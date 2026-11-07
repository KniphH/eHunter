/**
 * 像素级超分（WebGL2 运行器）
 *
 * 把 Anime4K v4 的 `.glsl` hook 文件搬到 WebGL2 上跑。**插件不内嵌任何算法**：
 * 用户在设置里自己挑 shader 文件，文本存进油猴存储，可随时换。
 *
 * 支持的 shader 形态：`//!HOOK MAIN` + `//!COMPONENTS 4`
 *   Restore_CNN_* / Upscale_CNN_x2_* / Upscale_Denoise_CNN_x2_* / Restore_GAN_*
 * 不支持 `//!COMPONENTS 1/2/3` 的亮度分离类（Darken / Thin / Deblur / AIO），
 * 载入时直接报错，而不是给出一张错的图。
 *
 * 移植自 libplacebo 的 hook 语义，几个必须照做的细节：
 *  - 每个 bind 纹理要提供 NAME_tex / NAME_texOff / NAME_pos / NAME_size / NAME_pt，
 *    且必须是 `#define` 而非函数——GAN 里写 `HOOKED_texOff(0)`，把 int 传给 vec2
 *    形参或算 `int / vec2` 在 GLSL ES 3.00 都不合法。
 *  - `//!BIND HOOKED` 是"被 hook 那张图"的别名，等同 MAIN，不能当普通中间纹理加前缀。
 *  - 中间纹理重写标识符不能用 `\bNAME\b`：`_` 是正则 word 字符，
 *    `conv2d_tf\b` 匹配不到 `conv2d_tf_texOff`。
 *  - `UNPACK_FLIP_Y_WEBGL` 对 ImageBitmap 在 Chromium 上不生效，必须自己翻。
 */
import Logger from '../utils/logger'
import { fetchImageBlob } from './ImageFetchService'
import { reportRender } from './StatsService'

export interface SuperResShaderFile {
    name: string
    text: string
}

export interface SuperResResult {
    url: string
    width: number
    height: number
    sourceWidth: number
    sourceHeight: number
    params: number
    costMs: number
    /** 输出图片的字节数（编码之后），状态浮层用它算体积变化 */
    bytes: number
    /**
     * 原图字节数。
     * 跨域图片走 `<img>` 时 Resource Timing 拿不到 size（没有 Timing-Allow-Origin），
     * 但这一份是**我们自己拉下来的 blob**，字节数是真的。
     */
    sourceBytes: number
}

interface ShaderPass {
    desc: string
    hook: string
    binds: string[]
    save: string
    width: string | null
    height: string | null
    components: number
    when: string | null
    body: string
}

interface TextureSlot {
    tex: WebGLTexture
    w: number
    h: number
}

const STORAGE_KEY = 'ehunter_superres_shaders_v1'
const RESULT_CACHE_LIMIT = 8
const SHADER_SHARED_NAMES = new Set(['MAIN', 'HOOKED'])

// ---------------------------------------------------------------- shader 解析

function newPassBlock(): ShaderPass {
    return {
        desc: '',
        hook: '',
        binds: [],
        save: '',
        width: null,
        height: null,
        components: 4,
        when: null,
        body: '',
    }
}

/**
 * 把一个 v4 shader 文本切成若干 pass。
 *
 * 分块边界比看上去微妙：多数 pass 以 `//!DESC` 开头，但 Restore_GAN_UL_CC
 * 把 `//!HOOK / //!BIND / //!SAVE` 写在第一个 `//!DESC` **之前**，
 * 所以不能"见到 DESC 就新开一块"，要看当前块是否已经实际开始。
 */
export function splitShaderPasses(text: string): ShaderPass[] {
    const lines = text.split(/\r?\n/)
    const blocks: ShaderPass[] = []
    let cur: ShaderPass | null = null

    for (const line of lines) {
        const directive = line.match(/^\/\/!\s*(\w+)\s*([\s\S]*)$/)
        if (directive) {
            const key = directive[1].toUpperCase()
            const val = directive[2].trim()
            const startsNew =
                (key === 'DESC' && !!cur && (!!cur.desc || cur.body.trim().length > 0)) ||
                (key === 'HOOK' && !!cur && !!cur.hook)
            if (!cur || startsNew) {
                cur = newPassBlock()
                blocks.push(cur)
            }
            if (key === 'DESC') {
                cur.desc = val
            } else if (key === 'HOOK') {
                cur.hook = val
            } else if (key === 'BIND') {
                cur.binds.push(val)
            } else if (key === 'SAVE') {
                cur.save = val
            } else if (key === 'WIDTH') {
                cur.width = val
            } else if (key === 'HEIGHT') {
                cur.height = val
            } else if (key === 'COMPONENTS') {
                cur.components = parseInt(val, 10) || 4
            } else if (key === 'WHEN') {
                cur.when = val
            }
            continue
        }
        if (cur) {
            cur.body += line + '\n'
        }
    }

    return blocks.filter(block => block.body.trim().length > 0 && !!block.hook)
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 解析多个 shader 文件并按顺序串起来。
 *
 * 每个文件里的中间纹理加 `f0_` / `f1_` 前缀做命名空间，MAIN 共享，
 * 这样 Restore_CNN + Upscale_CNN_x2 这类叠加不会因为都用了 `conv2d_tf` 而打架。
 */
export function parseShaderFileTexts(fileTexts: string[]): ShaderPass[] {
    const passes: ShaderPass[] = []

    fileTexts.forEach((text, fileIndex) => {
        const blocks = splitShaderPasses(text)
        const names = new Set<string>()
        blocks.forEach((block) => {
            block.binds.forEach((name) => {
                if (name && !SHADER_SHARED_NAMES.has(name)) {
                    names.add(name)
                }
            })
            if (block.save && !SHADER_SHARED_NAMES.has(block.save)) {
                names.add(block.save)
            }
        })

        const prefix = `f${fileIndex}_`
        const mapName = (name: string) => (!name || SHADER_SHARED_NAMES.has(name)) ? name : prefix + name
        const sortedNames = Array.from(names).sort((a, b) => b.length - a.length)
        const namePattern = sortedNames.length
            ? new RegExp(`\\b(${sortedNames.map(escapeRegExp).join('|')})(?![A-Za-z0-9])`, 'g')
            : null
        const rewrite = (source: string | null) => {
            if (!source || !namePattern) {
                return source
            }
            return source.replace(namePattern, prefix + '$1')
        }
        const toTextureName = (name: string) => (name === 'HOOKED' ? 'MAIN' : name)

        blocks.forEach((block) => {
            passes.push({
                desc: block.desc,
                hook: block.hook,
                binds: block.binds.map(name => toTextureName(mapName(name))),
                save: toTextureName(mapName(block.save || 'MAIN')),
                width: rewrite(block.width),
                height: rewrite(block.height),
                components: block.components,
                when: block.when,
                body: rewrite(block.body) || '',
            })
        })
    })

    return passes
}

/** 尺寸指令是 RPN 后缀式：`conv2d_last_tf.w 2 *` */
export function evalSizeExpression(
    expression: string | null,
    sizes: Record<string, { w: number, h: number }>,
    fallback: number,
): number {
    if (!expression) {
        return fallback
    }
    const tokens = expression.trim().split(/\s+/)
    const stack: number[] = []
    const binary = (fn: (a: number, b: number) => number) => {
        const b = stack.pop()
        const a = stack.pop()
        if (a === undefined || b === undefined) {
            throw new Error(`size expr operand underflow: ${expression}`)
        }
        stack.push(fn(a, b))
    }
    for (const token of tokens) {
        if (/^-?\d+(\.\d+)?$/.test(token)) {
            stack.push(parseFloat(token))
            continue
        }
        const sizeRef = token.match(/^([A-Za-z_]\w*)\.(w|h)$/)
        if (sizeRef) {
            const slot = sizes[sizeRef[1]]
            if (!slot) {
                throw new Error(`size expr references unknown texture: ${token}`)
            }
            stack.push(sizeRef[2] === 'w' ? slot.w : slot.h)
            continue
        }
        switch (token) {
            case '*': binary((a, b) => a * b); break
            case '/': binary((a, b) => a / b); break
            case '+': binary((a, b) => a + b); break
            case '-': binary((a, b) => a - b); break
            case '>': binary((a, b) => a > b ? 1 : 0); break
            case '<': binary((a, b) => a < b ? 1 : 0); break
            case '>=': binary((a, b) => a >= b ? 1 : 0); break
            case '<=': binary((a, b) => a <= b ? 1 : 0); break
            case '==': binary((a, b) => a === b ? 1 : 0); break
            case '!=': binary((a, b) => a !== b ? 1 : 0); break
            default: throw new Error(`size expr unknown token: ${token}`)
        }
    }
    const value = stack.pop()
    if (value === undefined) {
        throw new Error(`size expr empty result: ${expression}`)
    }
    return Math.max(1, Math.round(value))
}

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`

function buildPassFragmentShader(pass: ShaderPass): string {
    const bindDeclarations = pass.binds
        .map(name => `uniform sampler2D u_${name};\nuniform vec2 u_${name}_size;`)
        .join('\n')
    const bindHelpers = pass.binds.map(name => `
#define ${name}_tex(p) texture(u_${name}, p)
#define ${name}_texOff(off) texture(u_${name}, gl_FragCoord.xy / u_outSize + vec2(off) / u_${name}_size)
`).join('\n')
    const bindMacros = pass.binds.map(name => `#define ${name}_pos (gl_FragCoord.xy / u_outSize)
#define ${name}_size u_${name}_size
#define ${name}_pt (1.0 / u_${name}_size)`).join('\n')
    const hookedAliases = pass.binds.includes('MAIN') ? `
#define HOOKED_pos MAIN_pos
#define HOOKED_size MAIN_size
#define HOOKED_pt MAIN_pt
#define HOOKED_tex(p) MAIN_tex(p)
#define HOOKED_texOff(off) MAIN_texOff(off)
` : ''

    return `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform vec2 u_outSize;
${bindDeclarations}
out vec4 fragColor;
${bindHelpers}
${bindMacros}
${hookedAliases}
${pass.body}
void main(){ fragColor = hook(); }`
}

function buildPresentFragmentShader(): string {
    return `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_tex;
uniform vec2 u_size;
out vec4 fragColor;
void main(){
  fragColor = texture(u_tex, gl_FragCoord.xy / u_size);
}`
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)
    if (!shader) {
        throw new Error('createShader failed')
    }
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader) || ''
        gl.deleteShader(shader)
        throw new Error(`shader compile failed: ${info.split('\n').slice(0, 4).join(' | ')}`)
    }
    return shader
}

function linkProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
    const program = gl.createProgram()
    if (!program) {
        throw new Error('createProgram failed')
    }
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program) || ''
        gl.deleteProgram(program)
        throw new Error(`program link failed: ${info}`)
    }
    return program
}

/**
 * 一次渲染会话：一个 GL context + 一组 FBO。
 * 所有 pass 都是全屏三角形，中间纹理统一 RGBA16F（需要 EXT_color_buffer_float），
 * 每个 pass 写进新的 FBO，绝不读写同一张纹理。
 */
class SuperResRenderer {
    private gl: WebGL2RenderingContext
    private maxTextureSize: number
    private textureCache = new Map<string, TextureSlot>()
    private framebufferCache = new Map<WebGLTexture, WebGLFramebuffer>()
    private programCache = new Map<string, WebGLProgram>()
    private presentProgram: WebGLProgram | null = null
    private quadBuffer: WebGLBuffer
    private sizes: Record<string, { w: number, h: number }> = {}

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl
        this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
        const quad = gl.createBuffer()
        if (!quad) {
            throw new Error('createBuffer failed')
        }
        this.quadBuffer = quad
        gl.bindBuffer(gl.ARRAY_BUFFER, quad)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    }

    get maxSize(): number {
        return this.maxTextureSize
    }

    private createTexture(width: number, height: number, bitmap: TexImageSource | null): WebGLTexture {
        const gl = this.gl
        const texture = gl.createTexture()
        if (!texture) {
            throw new Error('createTexture failed')
        }
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        if (bitmap) {
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null)
        }
        return texture
    }

    private getFramebuffer(texture: WebGLTexture): WebGLFramebuffer {
        const gl = this.gl
        const cached = this.framebufferCache.get(texture)
        if (cached) {
            return cached
        }
        const framebuffer = gl.createFramebuffer()
        if (!framebuffer) {
            throw new Error('createFramebuffer failed')
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error(`framebuffer incomplete: 0x${status.toString(16)}`)
        }
        this.framebufferCache.set(texture, framebuffer)
        return framebuffer
    }

    private getProgram(pass: ShaderPass): WebGLProgram {
        const key = `${pass.binds.join(',')}|${pass.body}`
        const cached = this.programCache.get(key)
        if (cached) {
            return cached
        }
        const program = linkProgram(this.gl, VERTEX_SHADER_SOURCE, buildPassFragmentShader(pass))
        this.programCache.set(key, program)
        return program
    }

    /**
     * 上传源图。
     * 先在 2D canvas 里上下翻一次再按"不翻转"上传：实测 Chromium 对 ImageBitmap
     * 会忽略 UNPACK_FLIP_Y_WEBGL，不翻的话整条管线输出是倒的。
     */
    setSource(bitmap: ImageBitmap): void {
        const gl = this.gl
        const width = bitmap.width
        const height = bitmap.height
        if (width > this.maxTextureSize || height > this.maxTextureSize) {
            throw new Error(`image ${width}x${height} exceeds max texture size ${this.maxTextureSize}`)
        }
        const flipped = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(width, height)
            : Object.assign(document.createElement('canvas'), { width, height })
        const context = flipped.getContext('2d') as
            CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
        if (!context) {
            throw new Error('2d context unavailable')
        }
        context.translate(0, height)
        context.scale(1, -1)
        context.drawImage(bitmap, 0, 0)

        const texture = this.createTexture(width, height, flipped as unknown as TexImageSource)
        this.textureCache.set('MAIN', { tex: texture, w: width, h: height })
        this.sizes = { MAIN: { w: width, h: height } }
    }

    runPasses(passes: ShaderPass[]): void {
        const gl = this.gl
        for (let i = 0; i < passes.length; i++) {
            const pass = passes[i]
            const outWidth = evalSizeExpression(pass.width, this.sizes, this.sizes.MAIN.w)
            const outHeight = evalSizeExpression(pass.height, this.sizes, this.sizes.MAIN.h)
            if (outWidth > this.maxTextureSize || outHeight > this.maxTextureSize) {
                throw new Error(`pass ${i + 1} output ${outWidth}x${outHeight} exceeds max texture size`)
            }
            for (const name of pass.binds) {
                if (!this.textureCache.get(name)) {
                    throw new Error(`pass ${i + 1} binds unknown texture: ${name}`)
                }
            }

            const outTexture = this.createTexture(outWidth, outHeight, null)
            const framebuffer = this.getFramebuffer(outTexture)
            const program = this.getProgram(pass)

            gl.useProgram(program)
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
            gl.viewport(0, 0, outWidth, outHeight)

            const attributeLocation = gl.getAttribLocation(program, 'a_pos')
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
            gl.enableVertexAttribArray(attributeLocation)
            gl.vertexAttribPointer(attributeLocation, 2, gl.FLOAT, false, 0, 0)

            gl.uniform2f(gl.getUniformLocation(program, 'u_outSize'), outWidth, outHeight)
            pass.binds.forEach((name, unit) => {
                const slot = this.textureCache.get(name) as TextureSlot
                gl.activeTexture(gl.TEXTURE0 + unit)
                gl.bindTexture(gl.TEXTURE_2D, slot.tex)
                gl.uniform1i(gl.getUniformLocation(program, `u_${name}`), unit)
                gl.uniform2f(gl.getUniformLocation(program, `u_${name}_size`), slot.w, slot.h)
            })

            gl.drawArrays(gl.TRIANGLES, 0, 3)

            this.textureCache.set(pass.save, { tex: outTexture, w: outWidth, h: outHeight })
            this.sizes[pass.save] = { w: outWidth, h: outHeight }
        }
    }

    presentTo(target: HTMLCanvasElement): { width: number, height: number } {
        const gl = this.gl
        const final = this.textureCache.get('MAIN')
        if (!final) {
            throw new Error('no MAIN output')
        }
        target.width = final.w
        target.height = final.h
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.viewport(0, 0, final.w, final.h)
        if (!this.presentProgram) {
            this.presentProgram = linkProgram(gl, VERTEX_SHADER_SOURCE, buildPresentFragmentShader())
        }
        const program = this.presentProgram
        gl.useProgram(program)
        const attributeLocation = gl.getAttribLocation(program, 'a_pos')
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer)
        gl.enableVertexAttribArray(attributeLocation)
        gl.vertexAttribPointer(attributeLocation, 2, gl.FLOAT, false, 0, 0)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, final.tex)
        gl.uniform1i(gl.getUniformLocation(program, 'u_tex'), 0)
        gl.uniform2f(gl.getUniformLocation(program, 'u_size'), final.w, final.h)
        gl.drawArrays(gl.TRIANGLES, 0, 3)

        // 中心取 2×2 回读一次：GPU 上下文丢失 / 绘制被丢弃时 readPixels 全是 0，
        // 这时 toBlob 会产出一张全透明 PNG，挂到 <img> 上就是"空白/花图"。
        // 只要有一个字节非 0 就说明画上了（判据放宽到「全 0 才算没画」，避免误杀纯黑页）。
        const probe = new Uint8Array(16)
        const probeX = Math.max(0, (final.w >> 1) - 1)
        const probeY = Math.max(0, (final.h >> 1) - 1)
        gl.readPixels(probeX, probeY, 2, 2, gl.RGBA, gl.UNSIGNED_BYTE, probe)
        if (!probe.some(value => value !== 0)) {
            throw new Error('empty_output')
        }
        return { width: final.w, height: final.h }
    }

    /** 换页时清掉上一页的中间纹理，但保留已编译的 pass 程序（编译才是大头） */
    resetTextures(): void {
        const gl = this.gl
        for (const slot of this.textureCache.values()) {
            gl.deleteTexture(slot.tex)
        }
        for (const framebuffer of this.framebufferCache.values()) {
            gl.deleteFramebuffer(framebuffer)
        }
        this.textureCache.clear()
        this.framebufferCache.clear()
        this.sizes = {}
    }

    dispose(): void {
        const gl = this.gl
        for (const slot of this.textureCache.values()) {
            gl.deleteTexture(slot.tex)
        }
        for (const framebuffer of this.framebufferCache.values()) {
            gl.deleteFramebuffer(framebuffer)
        }
        for (const program of this.programCache.values()) {
            gl.deleteProgram(program)
        }
        if (this.presentProgram) {
            gl.deleteProgram(this.presentProgram)
        }
        gl.deleteBuffer(this.quadBuffer)
        this.textureCache.clear()
        this.framebufferCache.clear()
        this.programCache.clear()
    }
}

// ---------------------------------------------------------------- 算法文件存储

interface StoredShaderConfig {
    version: number
    files: SuperResShaderFile[]
    updatedAt: string
}

function readStorageValue(key: string): any {
    const gmGetValue = (globalThis as any).GM_getValue
    if (typeof gmGetValue === 'function') {
        try {
            return gmGetValue(key, null)
        } catch (e) {
            return null
        }
    }
    try {
        const raw = window.localStorage.getItem(key)
        return raw ? JSON.parse(raw) : null
    } catch (e) {
        return null
    }
}

function writeStorageValue(key: string, value: any): void {
    const gmSetValue = (globalThis as any).GM_setValue
    if (typeof gmSetValue === 'function') {
        try {
            gmSetValue(key, value)
            return
        } catch (e) {
            // fallthrough to localStorage
        }
    }
    try {
        window.localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
    }
}

function normalizeShaderFiles(raw: any): SuperResShaderFile[] {
    if (!raw || !Array.isArray(raw.files)) {
        return []
    }
    const files: SuperResShaderFile[] = []
    for (const item of raw.files) {
        if (!item || typeof item.text !== 'string' || !item.text.trim()) {
            continue
        }
        files.push({
            name: typeof item.name === 'string' && item.name ? item.name : `shader-${files.length + 1}.glsl`,
            text: item.text,
        })
    }
    return files
}

function readShaderFiles(): SuperResShaderFile[] {
    return normalizeShaderFiles(readStorageValue(STORAGE_KEY))
}

function writeShaderFiles(files: SuperResShaderFile[]): void {
    const payload: StoredShaderConfig = {
        version: 1,
        files,
        updatedAt: new Date().toISOString(),
    }
    writeStorageValue(STORAGE_KEY, payload)
}

export type SuperResEncode = 'png' | 'webp' | 'jpeg'

/**
 * 着色器输出的编码。
 *
 * 本机实测（NVIDIA RTX 3050 Laptop / ANGLE D3D11，2560×3440 的真实彩图输出）：
 *   png          11.27MB  编码 355ms  解码 114ms
 *   webp@0.90     0.55MB  编码 677ms  解码  70ms
 *   jpeg@0.90     0.93MB  编码  75ms  解码  32ms
 *
 * 三条曲线对应三种诉求，没有一项是全面更优的：
 *  - png 出图最快、无损，但体积最大（8 页缓存就是 90MB 级别）；
 *  - webp 体积只有 png 的 1/20，解码反而更快，代价是每页多花约 0.3s 编码；
 *  - jpeg 编码最快、体积居中，但**有损**，细线和小字会有压缩痕迹。
 *
 * 不单独暴露质量滑杆：多一个旋钮就多一种"看着能调、其实调不出差别"的困扰，
 * 每档固定一个实测过的质量值更省事。
 */
const ENCODE_OPTIONS: Record<SuperResEncode, { type: string, quality?: number }> = {
    png: { type: 'image/png' },
    webp: { type: 'image/webp', quality: 0.9 },
    jpeg: { type: 'image/jpeg', quality: 0.9 },
}

let outputEncode: SuperResEncode = 'png'

export function getOutputEncode(): SuperResEncode {
    return outputEncode
}

/**
 * 换编码。已缓存的结果是旧格式的 blob，必须清掉——
 * 不清的话同 URL 的页会一直拿到旧格式，"超分体积"那行看着像没生效。
 *
 * 注意调用顺序：先把 `<img>` 上的 displaySrc 摘掉再调这里，
 * 内部会 revokeObjectURL，图片还指着那个地址的话会直接裂掉。
 */
export function setOutputEncode(value: string): void {
    const next: SuperResEncode = value === 'webp' || value === 'jpeg' ? value : 'png'
    if (next === outputEncode) {
        return
    }
    outputEncode = next
    superResolutionService.clearCache()
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    const option = ENCODE_OPTIONS[outputEncode]
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob)
                } else {
                    reject(new Error('toBlob_failed'))
                }
            },
            option.type,
            option.quality
        )
    })
}

// ---------------------------------------------------------------- 服务

interface CacheEntry {
    result: SuperResResult
}

interface RenderSlot {
    canvas: HTMLCanvasElement
    renderer: SuperResRenderer
    passes: ShaderPass[]
    signature: string
}

class SuperResolutionService {
    private resultCache = new Map<string, CacheEntry>()
    private pending = new Map<string, Promise<string>>()
    private failed = new Set<string>()
    private queue: Array<() => Promise<void>> = []
    private draining = false
    private slot: RenderSlot | null = null
    private signatureCache = ''
    private passesCache: ShaderPass[] = []
    private unsupportedLogged = false
    /** 缓存命中/未命中计数，只给状态浮层看 */
    private hitCount = 0
    private missCount = 0

    /** 本服务产出的 blob 地址，用来避免对超分结果二次超分 */
    private ownUrls = new Set<string>()

    getShaderFiles(): SuperResShaderFile[] {
        return readShaderFiles()
    }

    setShaderFiles(files: SuperResShaderFile[]): void {
        writeShaderFiles(files)
        this.invalidateEverything()
    }

    hasShaders(): boolean {
        return readShaderFiles().length > 0
    }

    /** 算法文件指纹，用于让缓存随 shader 变更失效 */
    getSignature(): string {
        const files = readShaderFiles()
        return files.map(file => `${file.name}:${file.text.length}`).join('|')
    }

    isSupported(): boolean {
        if (this.unsupportedLogged) {
            return false
        }
        return true
    }

    /**
     * 把一页原图升级成超分版本。
     * 成功返回可直接塞进 `<img src>` 的 blob URL，失败返回原始地址（调用方据此跳过替换）。
     */
    async resolve(sourceUrl: string): Promise<string> {
        if (!sourceUrl) {
            return sourceUrl
        }
        // 只挡「自己产出的结果」，不能按 blob: 前缀一刀切——
        // 否则任何 blob 图片都会被当成"已经超分过"直接跳过。
        if (this.ownUrls.has(sourceUrl)) {
            return sourceUrl
        }
        const cached = this.resultCache.get(sourceUrl)
        if (cached) {
            // 命中就挪到队尾，配合容量上限做 LRU
            this.resultCache.delete(sourceUrl)
            this.resultCache.set(sourceUrl, cached)
            this.hitCount++
            return cached.result.url
        }
        if (this.failed.has(sourceUrl)) {
            return sourceUrl
        }
        const inflight = this.pending.get(sourceUrl)
        if (inflight) {
            return inflight
        }
        // 只在**真的要开算**时记一次未命中。放在前面会把「同一个失败地址被反复调用」
        // 也算进去，命中率被拉成 0%，看着像缓存没用上
        this.missCount++
        const task = this.enqueue(() => this.render(sourceUrl))
            .then((result) => {
                if (!result) {
                    this.failed.add(sourceUrl)
                    return sourceUrl
                }
                this.store(sourceUrl, result)
                Logger.logText('SUPERRES', `ok ${result.sourceWidth}x${result.sourceHeight} -> ${result.width}x${result.height}, ${Math.round(result.costMs)}ms, ${result.params} passes`)
                return result.url
            })
            .catch((error) => {
                this.failed.add(sourceUrl)
                Logger.logText('SUPERRES', `failed: ${sourceUrl} ${String(error && (error as Error).message || error)}`)
                return sourceUrl
            })
            .finally(() => {
                this.pending.delete(sourceUrl)
            })
        this.pending.set(sourceUrl, task)
        return task
    }

    /** 预取：结果只进缓存，不关心返回值 */
    prefetch(sourceUrl: string): void {
        if (!sourceUrl || this.resultCache.has(sourceUrl) || this.failed.has(sourceUrl)) {
            return
        }
        void this.resolve(sourceUrl)
    }

    isCached(sourceUrl: string): boolean {
        return this.resultCache.has(sourceUrl)
    }

    clearCache(): void {
        for (const entry of this.resultCache.values()) {
            URL.revokeObjectURL(entry.result.url)
        }
        this.resultCache.clear()
        this.ownUrls.clear()
        this.failed.clear()
        this.invalidateSlot()
    }

    getCacheSize(): number {
        return this.resultCache.size
    }

    /** 这条地址是不是我们自己产出的超分图（用来区分「超分结果」和「兜底 blob」） */
    isOwnUrl(url: string): boolean {
        return this.ownUrls.has(url)
    }

    /** 取某张原图的超分结果描述。缓存里没有就返回 null */
    describe(sourceUrl: string): SuperResResult | null {
        const cached = this.resultCache.get(sourceUrl)
        return cached ? cached.result : null
    }

    /** 状态浮层用的汇总。别在渲染热路径里调用 */
    getStats(): { cacheSize: number, hits: number, misses: number, queued: number } {
        return {
            cacheSize: this.resultCache.size,
            hits: this.hitCount,
            misses: this.missCount,
            queued: this.queue.length,
        }
    }

    /** 当前配置的 shader 链，按执行顺序。pass 数解析失败记 0 */
    describeShaders(): { files: Array<{ name: string, passes: number }>, total: number } {
        const files = readShaderFiles().map((file) => {
            let passes = 0
            try {
                passes = parseShaderFileTexts([file.text]).length
            } catch (e) {
                passes = 0
            }
            return { name: file.name, passes }
        })
        return { files, total: files.reduce((sum, item) => sum + item.passes, 0) }
    }

    private invalidateEverything(): void {
        this.clearCache()
        this.signatureCache = ''
        this.passesCache = []
    }

    private invalidateSlot(): void {
        if (!this.slot) {
            return
        }
        this.slot.renderer.dispose()
        this.slot = null
    }

    private store(sourceUrl: string, result: SuperResResult): void {
        this.resultCache.set(sourceUrl, { result })
        this.ownUrls.add(result.url)
        while (this.resultCache.size > RESULT_CACHE_LIMIT) {
            const oldestKey = this.resultCache.keys().next().value as string | undefined
            if (oldestKey === undefined) {
                break
            }
            const oldest = this.resultCache.get(oldestKey)
            this.resultCache.delete(oldestKey)
            if (oldest) {
                this.ownUrls.delete(oldest.result.url)
                URL.revokeObjectURL(oldest.result.url)
            }
        }
    }

    private enqueue<T>(job: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    resolve(await job())
                } catch (error) {
                    reject(error)
                }
            })
            void this.drain()
        })
    }

    private async drain(): Promise<void> {
        if (this.draining) {
            return
        }
        this.draining = true
        try {
            while (this.queue.length > 0) {
                const job = this.queue.shift()
                if (job) {
                    await job()
                }
            }
        } finally {
            this.draining = false
        }
    }

    private ensureSlot(): RenderSlot {
        const files = readShaderFiles()
        if (files.length === 0) {
            throw new Error('no_shader_selected')
        }
        const signature = this.getSignature()
        if (this.slot && this.slot.signature === signature) {
            return this.slot
        }
        this.invalidateSlot()

        const passes = parseShaderFileTexts(files.map(file => file.text))
        if (passes.length === 0) {
            throw new Error('no_pass_parsed')
        }
        const unsupportedComponents = passes.filter(pass => pass.components !== 4)
        if (unsupportedComponents.length > 0) {
            const comps = Array.from(new Set(unsupportedComponents.map(pass => pass.components))).join('/')
            throw new Error(`unsupported_components_${comps}`)
        }

        const canvas = document.createElement('canvas')
        const gl = canvas.getContext('webgl2', {
            preserveDrawingBuffer: true,
            antialias: false,
        }) as WebGL2RenderingContext | null
        if (!gl) {
            this.unsupportedLogged = true
            throw new Error('no_webgl2')
        }
        const floatExt = gl.getExtension('EXT_color_buffer_float')
            || gl.getExtension('EXT_color_buffer_half_float')
        if (!floatExt) {
            this.unsupportedLogged = true
            throw new Error('no_color_buffer_float')
        }

        // GPU 上下文丢了以后所有绘制都变成空操作，继续用这个 slot 只会产出空图
        canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault()
            Logger.logText('SUPERRES', 'webgl context lost, slot dropped, will rebuild on next render')
            this.signatureCache = ''
            this.passesCache = []
            this.slot = null
        })

        const renderer = new SuperResRenderer(gl)
        this.slot = { canvas, renderer, passes, signature }
        this.signatureCache = signature
        this.passesCache = passes
        return this.slot
    }

    private async render(sourceUrl: string): Promise<SuperResResult | null> {
        const slot = this.ensureSlot()
        const startedAt = performance.now()
        const blob = await fetchImageBlob(sourceUrl, 'superres')
        const afterFetch = performance.now()
        const bitmap = await createImageBitmap(blob)
        const afterDecode = performance.now()
        try {
            if (bitmap.width > slot.renderer.maxSize || bitmap.height > slot.renderer.maxSize) {
                throw new Error(`image_too_large_${bitmap.width}x${bitmap.height}`)
            }
            slot.renderer.resetTextures()
            slot.renderer.setSource(bitmap)
            slot.renderer.runPasses(slot.passes)
            const size = slot.renderer.presentTo(slot.canvas)
            // presentTo 末尾有 readPixels 回读，GPU 到这里已经同步跑完，
            // 所以下面编码的耗时是纯编码，不会把 GPU 时间算进去。
            const afterGpu = performance.now()
            const outBlob = await canvasToBlob(slot.canvas)
            const finishedAt = performance.now()
            reportRender({
                url: sourceUrl,
                sourceWidth: bitmap.width,
                sourceHeight: bitmap.height,
                width: size.width,
                height: size.height,
                passes: slot.passes.length,
                decodeMs: afterDecode - afterFetch,
                gpuMs: afterGpu - afterDecode,
                encodeMs: finishedAt - afterGpu,
                totalMs: finishedAt - startedAt,
                bytes: outBlob.size,
                sourceBytes: blob.size,
            })
            return {
                url: URL.createObjectURL(outBlob),
                width: size.width,
                height: size.height,
                sourceWidth: bitmap.width,
                sourceHeight: bitmap.height,
                params: slot.passes.length,
                costMs: finishedAt - startedAt,
                bytes: outBlob.size,
                sourceBytes: blob.size,
            }
        } finally {
            bitmap.close()
            slot.renderer.resetTextures()
        }
    }
}

export const superResolutionService = new SuperResolutionService()

