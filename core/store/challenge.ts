import { reactive } from 'vue'
import { isCloudflareChallengeHtml } from '../../src/platform/cloudflare'
import { store } from './app'

/**
 * 运行中的 Cloudflare 验证。
 *
 * 场景：漫画看到一半，某个请求被 Cloudflare 挑战，返回 403。插件只会显示
 * "加载失败"，用户不知道发生了什么、也没法处理。
 *
 * 这里做成「像登录 Google 账号那样的弹窗」：
 * 1. 403 后先探测一次，确认目标地址真的还是挑战页（避免误报）
 * 2. 用 GM_openInTab 自动弹出一个**顶层**标签页——
 *    验证只能在顶层窗口完成，嵌在 iframe 里 Cloudflare 根本不给有效 token
 * 3. 弹层留在原地，每 3 秒探一次，通了就关掉那个标签、收起弹层、重试图片
 */
export const challengeState = reactive({
    active: false,
    url: '',
    passed: false,
})

/** 同一地址多久内不重复弹（毫秒） */
const NOTIFY_COOLDOWN_MS = 60_000
const lastNotifiedAt = new Map<string, number>()

/** 自动弹出的那个标签页（GM_openInTab 的返回值，拿得到 close） */
let openedTab: { close?: () => void } | null = null
let probeTimer = 0

const PROBE_INTERVAL_MS = 5000
/** 最多探测这么久就停（5 分钟），避免用户一直不验证时后台反复拉整页 */
const PROBE_MAX_MS = 5 * 60 * 1000
let probeDeadline = 0

function closeOpenedTab(): void {
    try {
        openedTab?.close?.()
    } catch {
        // 用户可能已经手动关了
    }
    openedTab = null
}

function stopProbing(): void {
    if (probeTimer) {
        window.clearInterval(probeTimer)
        probeTimer = 0
    }
}

/**
 * 实际拉一次目标地址，看看是不是还在要验证。
 *
 * 优先用页面内的 fetch 而不是 GM_xmlhttpRequest：同域请求会带完整 Cookie 和
 * 浏览器的 UA，跟真实页面加载一致。GM 请求的 UA 不同，Cloudflare 可能给出
 * 不一样的判定，探出来的结果就不可信了。
 */
async function probeIsChallenge(url: string): Promise<boolean> {
    try {
        const response = await fetch(url, { credentials: 'include', cache: 'no-store' })
        const text = await response.text()
        return isCloudflareChallengeHtml(text)
    } catch {
        // fetch 被策略挡住时退回 GM 请求
    }
    return new Promise(resolve => {
        const request = (globalThis as any).GM_xmlhttpRequest
        if (typeof request !== 'function') {
            resolve(true)
            return
        }
        request({
            method: 'GET',
            url,
            timeout: 8000,
            onload: (res: any) => resolve(isCloudflareChallengeHtml(String(res.responseText || ''))),
            onerror: () => resolve(false),
            ontimeout: () => resolve(false),
        })
    })
}

/**
 * 自动弹出验证页。
 *
 * 优先 GM_openInTab（不受浏览器弹窗拦截，且返回值能拿到 close），
 * 没有就退回 window.open——那种情况下可能被拦，用户得自己点一下。
 */
function openVerifyTab(url: string): void {
    const openInTab = (globalThis as any).GM_openInTab
    if (typeof openInTab === 'function') {
        try {
            openedTab = openInTab(url, { active: true, insert: true, setParent: true })
            return
        } catch {
            openedTab = null
        }
    }
    const win = window.open(url, '_blank', 'noopener,width=980,height=760')
    openedTab = win ? { close: () => win.close() } : null
}

async function tick(): Promise<void> {
    if (!challengeState.active || challengeState.passed) {
        stopProbing()
        return
    }
    if (Date.now() > probeDeadline) {
        stopProbing()
        return
    }
    if (Date.now() > probeDeadline) {
        stopProbing()
        return
    }
    const stillChallenge = await probeIsChallenge(challengeState.url)
    if (stillChallenge) {
        return
    }
    stopProbing()
    challengeState.passed = true
    closeOpenedTab()
    // 让失败的那些图片立刻重来一次；不刷新页面
    store.retryAllToken += 1
    // 稍等一下让用户看清"已验证"，再收起弹层
    window.setTimeout(() => {
        closeChallenge()
    }, 600)
}

function startProbing(url: string): void {
    stopProbing()
    probeDeadline = Date.now() + PROBE_MAX_MS
    probeDeadline = Date.now() + PROBE_MAX_MS
    probeTimer = window.setInterval(() => {
        void tick()
    }, PROBE_INTERVAL_MS)
    void tick()
    void url
}

/**
 * 请求被挑战时调用。
 *
 * 两道闸：冷却（并发请求会同时 403）+ 实测确认（返回的确实是挑战页才弹）。
 * 确认后自动弹标签页，并把状态置为 active，让弹层显示"正在等待验证"。
 */
export async function notifyCloudflareChallenge(url: string): Promise<boolean> {
    if (challengeState.active) {
        return false
    }
    const now = Date.now()
    const last = lastNotifiedAt.get(url) ?? 0
    if (now - last < NOTIFY_COOLDOWN_MS) {
        return false
    }
    lastNotifiedAt.set(url, now)

    const reallyChallenge = await probeIsChallenge(url)
    if (!reallyChallenge || challengeState.active) {
        return false
    }

    challengeState.active = true
    challengeState.url = url
    challengeState.passed = false
    openVerifyTab(url)
    startProbing(url)
    return true
}

export function closeChallenge(): void {
    stopProbing()
    challengeState.active = false
    challengeState.url = ''
    challengeState.passed = false
}

/** 用户手动关掉弹层时，别把刚打开的验证标签也一起关了——他可能正在里面操作 */
export function dismissChallenge(): void {
    stopProbing()
    challengeState.active = false
    challengeState.url = ''
    challengeState.passed = false
}
