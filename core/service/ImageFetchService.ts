/**
 * 图片下载通道。
 *
 * 为什么不直接用 `<img>` 加载：`<img>` 的 Referer 由浏览器按页面策略决定，
 * 碰到隐私扩展、CSP、代理分流规则时可能根本发不出去；而 pixiv 的 i.pximg.net
 * 缺 Referer 直接 403。GM_xmlhttpRequest 能自己带 Referer、不受页面策略约束，
 * 所以把它作为 `<img>` 失败后的兜底通道，顺便借它拿到真实的 HTTP 状态码。
 *
 * 拿到字节后**必须校验魔数**：CDN 偶尔会 200 返回一个错误页 / 被中间设备替换的 HTML，
 * 某些油猴管理器也可能把 arraybuffer 降级成字符串。这些数据如果直接包成 Blob 塞进
 * `<img>`，就会显示成一张"乱码"图。校验不过一律当失败，让上层回退。
 */

import { reportNet } from './StatsService'

const PIXIV_REFERER = 'https://www.pixiv.net/'

/** `<img>` 标签由浏览器自动带 Referer，GM_xmlhttpRequest 不带，必须自己补 */
export function buildImageHeaders(url: string): Record<string, string> | undefined {
    if (/pixiv|pximg/i.test(url)) {
        return { Referer: PIXIV_REFERER }
    }
    // wnacg 的签名图片域会校验来源；GM 请求不自动带 Referer，用宿主页面 origin 补齐
    if (/wnacg|qy0\.ru/i.test(url)) {
        return { Referer: `${location.origin}/` }
    }
    return undefined
}

/**
 * 按 magic bytes 判断真实图片类型。
 * 返回 null 表示这批字节不是我们能识别的图片（HTML 错误页、被文本化的响应、被截断的数据）。
 */
export function sniffImageType(bytes: Uint8Array): string | null {
    if (bytes.length < 12) {
        return null
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return 'image/png'
    }
    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'image/jpeg'
    }
    // GIF: GIF87a / GIF89a
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        return 'image/gif'
    }
    // WebP: RIFF....WEBP
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
        return 'image/webp'
    }
    // ISO BMFF（AVIF / HEIF）: ....ftyp
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        return 'image/avif'
    }
    return null
}

function toBytes(raw: any): Uint8Array | null {
    if (raw instanceof ArrayBuffer) {
        return new Uint8Array(raw)
    }
    if (ArrayBuffer.isView(raw)) {
        return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
    }
    // Blob 需要异步读取，这里不处理；字符串说明响应被管理器文本化了，属于坏数据
    return null
}

/** 把一批字节包成带正确 MIME 的 Blob，非图片直接拒绝 */
function toImageBlob(bytes: Uint8Array): Blob {
    const type = sniffImageType(bytes)
    if (!type) {
        throw new Error('IMAGE_MAGIC_MISSING')
    }
    // TS 5.9 把 Uint8Array 泛型化了，`Uint8Array<ArrayBufferLike>` 不被 BlobPart 接受
    // （BlobPart 要求 ArrayBuffer 视图）。运行时 Blob 接受任何 ArrayBufferView，
    // 这里只做类型断言，不复制字节。
    return new Blob([bytes as unknown as BlobPart], { type })
}

export function fetchImageByGM(url: string): Promise<Blob> {
    const gmXhr = (globalThis as any).GM_xmlhttpRequest
    if (typeof gmXhr !== 'function') {
        return Promise.reject(new Error('GM_XHR_NOT_AVAILABLE'))
    }
    return new Promise<Blob>((resolve, reject) => {
        gmXhr({
            method: 'GET',
            url,
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: buildImageHeaders(url),
            onload: (resp: any) => {
                if (!resp || resp.status < 200 || resp.status >= 300) {
                    reject(new Error(`HTTP_${resp && resp.status ? resp.status : 'UNKNOWN'}`))
                    return
                }
                const bytes = toBytes(resp.response)
                if (!bytes) {
                    reject(new Error('GM_XHR_BAD_RESPONSE'))
                    return
                }
                try {
                    resolve(toImageBlob(bytes))
                } catch (error) {
                    reject(error as Error)
                }
            },
            onerror: () => reject(new Error('GM_XHR_ERROR')),
            ontimeout: () => reject(new Error('GM_XHR_TIMEOUT')),
            onabort: () => reject(new Error('GM_XHR_ABORT')),
        })
    })
}

/**
 * @param tag 只影响状态浮层里这条请求被归到哪一类（兜底通道 / 超分），不影响行为
 */
export async function fetchImageBlob(url: string, tag: 'blob' | 'superres' = 'blob'): Promise<Blob> {
    const startedAt = performance.now()
    const report = (ok: boolean, bytes: number, note: string) => {
        reportNet({ channel: tag, url, ms: performance.now() - startedAt, bytes, ok, note })
    }
    try {
        const blob = await fetchImageByGM(url)
        report(true, blob.size, 'GM')
        return blob
    } catch (gmError) {
        // 同源图或已允许 CORS 的源直接走 fetch
        try {
            const response = await fetch(url)
            if (!response.ok) {
                throw new Error(`HTTP_${response.status}`)
            }
            const blob = toImageBlob(new Uint8Array(await response.arrayBuffer()))
            report(true, blob.size, 'fetch')
            return blob
        } catch (fetchError) {
            // 两边都失败时，GM 的报错更有信息量（那是我们自己发起的请求，能拿到状态码）
            const gmMessage = gmError instanceof Error ? gmError.message : ''
            const thrown = (gmMessage && gmMessage !== 'GM_XHR_NOT_AVAILABLE' ? gmError : fetchError) as Error
            report(false, 0, String((thrown && thrown.message) || thrown))
            throw thrown
        }
    }
}

/** 拉成 blob URL，调用方负责 revokeObjectURL */
export async function fetchImageObjectUrl(url: string): Promise<string> {
    const blob = await fetchImageBlob(url)
    return URL.createObjectURL(blob)
}
