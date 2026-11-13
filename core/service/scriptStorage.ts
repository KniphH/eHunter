/**
 * 脚本级键值存储。
 *
 * 优先走油猴的 GM 存储：它与页面 origin 无关，同一个脚本在 e-hentai / exhentai /
 * nhentai / pixiv / wnacg 上共享同一份设置与算法文件。
 *
 * 只有 banner 里声明了 `@grant GM_getValue/GM_setValue` 时脚本管理器才会注入这两个函数；
 * 没声明时 `globalThis.GM_getValue` 是 undefined，调用点会静默落到 localStorage——
 * 而 localStorage 按 origin 隔离，等于每个站各存一份，超分算法文件要导五遍。
 *
 * 从老版本升级上来时数据还在 localStorage 里：读到 GM 侧没有就搬过去，搬完删掉本地那份，
 * 避免两边各存一份、以后互相打架。
 */

/** GM_getValue 没取到值时的哨兵。不能用 null：我们的取值里可能合法出现 null */
const MISSING = Symbol('missing')

function gmApi(name: string): any {
    const fn = (globalThis as any)[name]
    return typeof fn === 'function' ? fn : null
}

/** 当前环境支持跨站存储吗（取决于 banner 有没有声明 @grant） */
export function hasScriptStorage(): boolean {
    return gmApi('GM_getValue') !== null && gmApi('GM_setValue') !== null
}

/** 读 localStorage 原始值。命中返回字符串，未命中返回哨兵 */
function readLocalRaw(key: string): any {
    try {
        const raw = window.localStorage.getItem(key)
        return raw === null ? MISSING : raw
    } catch (e) {
        return MISSING
    }
}

/**
 * localStorage 里存的是 JSON 文本，GM 里存的是结构化值，统一成结构化值。
 * 解析失败就原样返回字符串，交给调用方的 parse 去兼容历史脏数据。
 */
function normalizeStored(raw: any): any {
    if (raw === MISSING || typeof raw !== 'string') {
        return raw
    }
    try {
        return JSON.parse(raw)
    } catch (e) {
        return raw
    }
}

export function readScriptValue(key: string, fallback: any = null): any {
    if (!key) {
        return fallback
    }
    const gmGet = gmApi('GM_getValue')
    if (gmGet) {
        let value: any
        try {
            value = gmGet(key, MISSING)
        } catch (e) {
            value = MISSING
        }
        if (value !== MISSING && value !== null && value !== undefined) {
            return value
        }
        // GM 侧没有：可能刚从老版本升上来，把 localStorage 里那份搬过来
        const legacy = normalizeStored(readLocalRaw(key))
        if (legacy === MISSING) {
            return fallback
        }
        writeScriptValue(key, legacy)
        return legacy
    }
    const legacy = normalizeStored(readLocalRaw(key))
    return legacy === MISSING ? fallback : legacy
}

/**
 * 写入。GM 可用时以 GM 为权威，并清掉 localStorage 里的同键旧值。
 * GM 写失败（配额满 / 权限被拒）时退回 localStorage，宁可两边不同步也不要静默丢设置。
 */
export function writeScriptValue(key: string, value: any): boolean {
    if (!key) {
        return false
    }
    const gmSet = gmApi('GM_setValue')
    if (gmSet) {
        try {
            gmSet(key, value)
            try {
                window.localStorage.removeItem(key)
            } catch (e) {
            }
            return true
        } catch (e) {
        }
    }
    try {
        window.localStorage.setItem(key, JSON.stringify(value))
        return true
    } catch (e) {
        return false
    }
}

export function removeScriptValue(key: string): boolean {
    if (!key) {
        return false
    }
    let ok = true
    const gmDelete = gmApi('GM_deleteValue')
    if (gmDelete) {
        try {
            gmDelete(key)
        } catch (e) {
            ok = false
        }
    }
    try {
        window.localStorage.removeItem(key)
    } catch (e) {
        ok = false
    }
    return ok
}

/**
 * 清空本脚本自己的键。
 *
 * 不能直接 `localStorage.clear()`：那会连站点自己的数据一起清掉。
 * 所以只清 `keys` 里显式列出的键，GM 侧再多清一遍 GM_listValues 里以 `ehunter` 开头的。
 */
export function clearScriptStorage(keys: string[]): void {
    keys.forEach((key) => removeScriptValue(key))
    const gmList = gmApi('GM_listValues')
    const gmDelete = gmApi('GM_deleteValue')
    if (!gmList || !gmDelete) {
        return
    }
    try {
        const all = gmList()
        if (!Array.isArray(all)) {
            return
        }
        all.forEach((key: unknown) => {
            if (typeof key === 'string' && key.startsWith('ehunter')) {
                try {
                    gmDelete(key)
                } catch (e) {
                }
            }
        })
    } catch (e) {
    }
}
