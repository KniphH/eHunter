/**
 * 禁漫天堂的图片 scramble 还原。
 *
 * 站点把每张图水平切成 N 条，然后**倒序**写回。N 由
 * `md5(scramble_id + aid)` 的末位 hex 决定（2~20 条）。
 * 直接显示原图就是错位的碎块——必须按同样的规则倒回来。
 *
 * 算法取自站点的 jquery.photo-0.6.js（混淆后解出来的），对应 aid >= 421926
 * 的 `% 8` 分支同样适用。
 */

/** 分块数只可能是这几个值 */
const BLOCK_TABLE = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]

/**
 * 算出某一页被切成了几条。
 *
 * 对应站点 get_num(aid, pageName)：
 *   n = String(aid) + pageName           // **字符串拼接**，不是相加
 *   n = md5(n).substr(-1).charCodeAt()   // 取末位的**字符编码**（'6' -> 54）
 *   aid >= 421926 时 % 8；268850~421925 时 % 10
 *   再查表 {0:2, 1:4, ..., 9:20}
 *
 * 注意每页的 pageName 不同，所以**同一本里每页的块数可能不一样**。
 * 早先按「md5(scramble_id+aid) 的十六进制值」算、且全书共用同一个块数，
 * 结果有的页被切得过细。
 */
export function getBlockCount(aid: number, pageName: string): number {
    const hex = md5Hex(String(aid) + pageName)
    let code = hex.charCodeAt(hex.length - 1)
    if (!Number.isFinite(code)) {
        code = 0
    }
    if (aid >= 268850 && aid <= 421925) {
        code %= 10
    } else if (aid >= 421926) {
        code %= 8
    }
    return BLOCK_TABLE[code] ?? 10
}

/**
 * 把打乱的图还原成正常顺序，返回 blob。
 *
 * 用 canvas 重绘：源图第 i 条画到目标位置 `height - h*(i+1) - remainder`，
 * 也就是倒序。第一条额外承担余数高度。
 */
export async function unscrambleToBlob(
    source: Blob,
    blocks: number,
): Promise<Blob | null> {
    if (blocks <= 1) {
        return source
    }
    const img = await blobToImage(source)
    if (!img || !img.naturalWidth || !img.naturalHeight) {
        return null
    }

    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
        return null
    }

    const totalHeight = img.naturalHeight
    const blockHeight = Math.floor(totalHeight / blocks)
    const remainder = totalHeight % blocks

    /*
     * 与站点逐字对应：
     *   源位置 = 高度 - h*(g+1) - 余数   （倒序）
     *   目标位置 = h*g                   （正序）
     *   第 0 条的高度补上余数，其余条的目标位置下移余数
     * 余数加在**目标**上而不是源上——这点反了就会整体错位一条。
     */
    for (let g = 0; g < blocks; g++) {
        let height = blockHeight
        const sourceY = totalHeight - blockHeight * (g + 1) - remainder
        let targetY = blockHeight * g
        if (g === 0) {
            height += remainder
        } else {
            targetY += remainder
        }
        if (height <= 0) {
            continue
        }
        ctx.drawImage(img, 0, sourceY, img.naturalWidth, height, 0, targetY, img.naturalWidth, height)
    }

    return new Promise(resolve => {
        try {
            canvas.toBlob(blob => resolve(blob), 'image/webp', 0.95)
        } catch {
            resolve(null)
        }
    })
}

function blobToImage(blob: Blob): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
        const url = URL.createObjectURL(blob)
        const img = new Image()
        img.onload = () => {
            URL.revokeObjectURL(url)
            resolve(img)
        }
        img.onerror = () => {
            URL.revokeObjectURL(url)
            resolve(null)
        }
        img.src = url
    })
}

/**
 * 标准 MD5，输出小写 hex。
 *
 * 只为算分块数用一次，不追求性能。常量表按标准用 sin 生成，省掉 64 个硬编码数字。
 */
export function md5Hex(input: string): string {
    const bytes = new TextEncoder().encode(input)
    const bitLength = bytes.length * 8
    const paddedLength = (((bytes.length + 8) >>> 6) + 1) * 64
    const buffer = new Uint8Array(paddedLength)
    buffer.set(bytes)
    buffer[bytes.length] = 0x80
    const view = new DataView(buffer.buffer)
    view.setUint32(paddedLength - 8, bitLength >>> 0, true)
    view.setUint32(paddedLength - 4, Math.floor(bitLength / 4294967296), true)

    const s = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ]
    const k = new Uint32Array(64)
    for (let i = 0; i < 64; i++) {
        k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)
    }

    let a0 = 0x67452301
    let b0 = 0xefcdab89
    let c0 = 0x98badcfe
    let d0 = 0x10325476

    const rotl = (x: number, c: number) => ((x << c) | (x >>> (32 - c))) >>> 0

    for (let offset = 0; offset < paddedLength; offset += 64) {
        const m = new Uint32Array(16)
        for (let i = 0; i < 16; i++) {
            m[i] = view.getUint32(offset + i * 4, true)
        }

        let a = a0
        let b = b0
        let c = c0
        let d = d0

        for (let i = 0; i < 64; i++) {
            let f: number
            let g: number
            if (i < 16) {
                f = (b & c) | (~b & d)
                g = i
            } else if (i < 32) {
                f = (d & b) | (~d & c)
                g = (5 * i + 1) % 16
            } else if (i < 48) {
                f = b ^ c ^ d
                g = (3 * i + 5) % 16
            } else {
                f = c ^ (b | ~d)
                g = (7 * i) % 16
            }
            const tmp = d
            d = c
            c = b
            b = (b + rotl((a + f + k[i] + m[g]) >>> 0, s[i])) >>> 0
            a = tmp
        }

        a0 = (a0 + a) >>> 0
        b0 = (b0 + b) >>> 0
        c0 = (c0 + c) >>> 0
        d0 = (d0 + d) >>> 0
    }

    return [a0, b0, c0, d0].map(wordToHex).join('')
}

function wordToHex(word: number): string {
    let out = ''
    for (let i = 0; i < 4; i++) {
        const byte = (word >>> (i * 8)) & 0xff
        out += byte.toString(16).padStart(2, '0')
    }
    return out
}
