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
/**
 * 是否正在探测验证结果。
 *
 * 和 challengeState.active 分开：弹窗成功打开时 UI 完全不出现（要的就是
 * Google 登录那种小窗口浮在页面上，不要遮罩），但探测要继续跑。
 */
let probing = false

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
    probing = false
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
        if (response.status === 200) {
            // 200 却拿到挑战页：极少见，但也不是没有
            return isCloudflareChallengeHtml(text)
        }
        /*
         * 非 200 必须算「需要验证」。Cloudflare 对 XHR 的挑战经常只回一个
         * 403 加空响应体，光看内容会判成「不需要验证」，于是弹层永远不出现、
         * 图片一直重试一直失败。状态码本身就是信号。
         */
        return true
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
            onload: (res: any) => {
                const body = String(res.responseText || '')
                // 同 fetch 分支：非 200 一律按「需要验证」处理
                resolve(res.status !== 200 || isCloudflareChallengeHtml(body))
            },
            onerror: () => resolve(false),
            ontimeout: () => resolve(false),
        })
    })
}

/**
 * 弹出验证窗口。
 *
 * 要的是「Google 登录那种」独立小窗口：带 width/height 的 window.open 才是
 * popup，不带尺寸就是新标签页——两者视觉差别很大。
 *
 * 不用 GM_openInTab：它只会开标签页。也不用 noopener：那样 window.open 返回
 * null，就拿不到引用去关窗口了。这里打开的是同域页面，保留引用是安全的。
 */
function openVerifyWindow(url: string): void {
    const width = 520
    const height = 700
    const left = Math.max(0, Math.round((window.screen.width - width) / 2))
    const top = Math.max(0, Math.round((window.screen.height - height) / 2))
    const features = [
        `width=${width}`,
        `height=${height}`,
        `left=${left}`,
        `top=${top}`,
        'resizable=yes',
        'scrollbars=yes',
        'toolbar=no',
        'menubar=no',
        'location=no',
        'status=no',
        'popup=yes',
    ].join(',')
    try {
        const win = window.open(url, 'ehunter-cf-verify', features)
        openedTab = win && !win.closed ? { close: () => win.close() } : null
    } catch {
        openedTab = null
    }
}

/** 弹窗是否还能打开（被拦截时返回 null） */
export function canOpenVerifyWindow(): boolean {
    return typeof window.open === 'function'
}

/** 用户点按钮时调用：弹窗口并开始探测 */
export function startVerifyByUser(): void {
    openVerifyWindow(challengeState.url)
    if (openedTab) {
        challengeState.active = false
        startProbing(challengeState.url)
    }
}

async function tick(): Promise<void> {
    if (!probing || challengeState.passed) {
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
    probing = true
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

    /*
     * 这里**不做**前置探测。
     *
     * 之前先用 fetch 实测一次「是不是真的在验证」，结果探测在某些情况下
     * 返回「不是」，整个功能就静默失效了——用户完全看不到任何提示。
     * 探测是为了防误报，但防到把入口也堵死就不对了：宁可偶尔多提示一次
     * （用户点关闭即可，还有 60 秒冷却兜着），也不能让验证入口消失。
     */

    challengeState.url = url
    challengeState.passed = false
    openVerifyWindow(url)
    if (openedTab) {
        /*
         * 窗口弹出来了：不显示任何遮罩，用户看到的就是那个浮在页面中间的小窗口，
         * 和 Google 登录一样。这边只管探测，通了就关窗口、重试图片。
         */
        challengeState.active = false
        startProbing(url)
        return true
    }
    // 被浏览器拦了：显示卡片，让用户点按钮手动触发
    challengeState.active = true
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
