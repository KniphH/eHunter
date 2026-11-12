function normalizeHostToHostname(hostOrHostname: string): string {
    const trimmed = hostOrHostname.trim()
    if (!trimmed) {
        return ''
    }
    if (trimmed.startsWith('[')) {
        const end = trimmed.indexOf(']')
        return end > 0 ? trimmed.slice(1, end) : trimmed
    }
    const firstColon = trimmed.indexOf(':')
    if (firstColon > -1) {
        return trimmed.slice(0, firstColon)
    }
    return trimmed
}

export function isIPv4Host(hostOrHostname: string): boolean {
    const hostname = normalizeHostToHostname(hostOrHostname)
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
}

export function isTestEnvironmentHost(hostOrHostname: string): boolean {
    const hostname = normalizeHostToHostname(hostOrHostname)
    return hostname === 'localhost' || isIPv4Host(hostname)
}

export function isTestEnvironment(): boolean {
    return isTestEnvironmentHost(window.location.host || '')
}

/**
 * 触屏/移动端判断，只用来选默认值。
 *
 * 桌面触屏本也会命中 coarse pointer，但这里只影响「超分默认输出编码」这类无害默认值，
 * 不做功能裁剪，误判代价很低。
 */
export function isMobileDevice(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return false
    }
    if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) {
        return true
    }
    return /iphone|ipad|ipod|android|mobile/i.test(navigator.userAgent)
}
