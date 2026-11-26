import { reactive } from 'vue'
import { isCloudflareChallengeHtml, isCloudflareChallengeTitle } from '../../src/platform/cloudflare'
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

/**
 * 多久内最多弹一次窗口（毫秒）。
 *
 * 用**全局**时间戳而不是按 URL 分开算：一次加载会并发好几个图片页请求，
 * 它们 URL 各不相同，按 URL 冷却等于每个都放行，结果一下弹出好几个窗口。
 */
/**
 * 验证窗口的 URL 标记参数。
 *
 * 不能用 window.name 识别验证窗口：它在跨域导航后会被浏览器清空，
 * 而 Cloudflare 验证会跳到 challenges.cloudflare.com 再跳回来，
 * 回来时名字已经没了，窗口里的脚本认不出自己，于是不写完成信号，
 * 父窗口就一直等到超时——表现就是「能验证，但窗口不关」。
 * URL 参数在同源跳转中会保留。
 */
/**
 * 只有这些站点才可能真的遇到 Cloudflare 人机验证。
 *
 * 之前任何站点的 403 都会走到这里，而探测逻辑把「非 200」一律当作挑战页，
 * 于是 pixiv 这种自己用 403 做限流的站，网络一抖就弹出「需要人机验证」——
 * 用户根本没有验证窗口可过，因为压根不是 Cloudflare。
 */
const CHALLENGE_HOSTS = ['nhentai.net', 'nhentai.xxx', 'nhentai.to']

function isKnownChallengeHost(): boolean {
    const host = location.hostname.toLowerCase()
    return CHALLENGE_HOSTS.some(item => host === item || host.endsWith(`.${item}`))
}

/**
 * 「刚打开过验证窗口」的标记键。
 *
 * 不用 window.name（跨域导航后会被清空），也不用 URL 参数
 * （带 query 的首页会让 Cloudflare 反复挑战）。
 * sessionStorage 同源共享，窗口内脚本读得到。
 */
export const VERIFY_POPUP_KEY = 'ehunter:verify-popup-at'

const NOTIFY_COOLDOWN_MS = 60_000
/** 冷却时间戳持久化到 sessionStorage：页面刷新后不该重新允许弹窗 */
const COOLDOWN_KEY = 'ehunter:cf-notify-at'
let lastNotifiedAt = (() => {
    try {
        return Number(window.sessionStorage.getItem(COOLDOWN_KEY) || 0) || 0
    } catch {
        return 0
    }
})()

/** 弹出的验证窗口（保留引用才能读它的页面状态、才能关掉它） */
let verifyWindow: Window | null = null
let probeTimer = 0
/**
 * 是否正在探测验证结果。
 *
 * 和 challengeState.active 分开：弹窗成功打开时 UI 完全不出现（要的就是
 * Google 登录那种小窗口浮在页面上，不要遮罩），但探测要继续跑。
 */
let probing = false

const PROBE_INTERVAL_MS = 2000
/** 窗口打开后多久才开始判定（给它的页面留加载时间） */
let probeStartAt = 0
/** 最多探测这么久就停（5 分钟），避免用户一直不验证时后台反复拉整页 */
const PROBE_MAX_MS = 5 * 60 * 1000
let probeDeadline = 0

function closeVerifyWindow(): void {
    try {
        verifyWindow?.close()
    } catch {
        // 用户可能已经手动关了
    }
    verifyWindow = null
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
function openVerifyWindow(): void {
    /*
     * 打开站点**首页**，不是被挑战的那个地址。
     *
     * 验证针对的是域名级的 cookie（cf_clearance），首页和具体页是同一套。
     * 而打开具体页有两个坏处：那正是插件正在请求、可能被拒的地址；
     * 而且用户本来就在那一页，原页面自己会重试，不需要再开一个。
     */
    /*
     * 必须打开**干净的首页**，不要加任何 query。
     * 试过加 ?ehunter-verify=1 作为标记，结果带参数的首页会让 Cloudflare
     * 走另一条处理路径，出现「验证 → 跳回 → 又验证」的循环，
     * 用户看到的就是「点了确认它自己又刷新一遍」。
     * 窗口身份改由 sessionStorage 记录，不污染 URL。
     */
    let target = location.origin
    try {
        target = new URL('/', location.origin).href
    } catch {
        // 保持 location.origin
    }
    // 记下「验证窗口是我们开的」：窗口内脚本通过这个标记认出自己，
    // 不依赖 window.name（跨域会丢），也不污染 URL
    try {
        window.sessionStorage.setItem(VERIFY_POPUP_KEY, String(Date.now()))
    } catch {
        // 忽略
    }

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
        const win = window.open(target, 'ehunter-cf-verify', features)
        verifyWindow = win && !win.closed ? win : null
    } catch {
        verifyWindow = null
    }
}

/** 弹窗是否还能打开（被拦截时返回 null） */
export function canOpenVerifyWindow(): boolean {
    return typeof window.open === 'function'
}

/** 用户点按钮时调用：弹窗口并开始探测 */
export function startVerifyByUser(): void {
    openVerifyWindow()
    startProbing(challengeState.url)
}

/**
 * 验证窗口里是不是已经不是挑战页了。
 *
 * 判据取窗口自己的 document.title —— 同域可读，而且那是**顶层导航**，
 * 不会被 Cloudflare 当成 XHR 挑战。之前用 fetch 探测目标地址，那个 fetch
 * 本身也 403，永远判"没通过"，窗口就永远不关。
 */
function verifyWindowPassed(): boolean {
    if (!verifyWindow || verifyWindow.closed) {
        return false
    }
    try {
        const doc = verifyWindow.document
        if (!doc) {
            return false
        }
        const title = doc.title || ''
        if (!title) {
            return false
        }
        return !isCloudflareChallengeTitle(title)
    } catch {
        // 读不到就当还没通过，继续等
        return false
    }
}

/** 验证窗口写、主窗口读的 localStorage 键（与 main.ts 保持一致） */
const VERIFY_READY_KEY = 'ehunter:verify-ready'

/**
 * 验证已经完成时的统一收尾：关窗口、让失败的图片重试、收起卡片。
 */
function handleVerifyPassed(): void {
    if (challengeState.passed) {
        return
    }
    stopProbing()
    challengeState.passed = true
    closeVerifyWindow()
    // 让失败的那些图片立刻重来一次；不刷新页面
    store.retryAllToken += 1
    window.setTimeout(() => {
        closeChallenge()
    }, 600)
}

/**
 * 验证窗口加载成功后会往 localStorage 写一个记号，这里接住它。
 *
 * 不依赖 window.open 的返回值：Edge 上它经常返回 null（窗口明明开着），
 * 拿不到引用就读不到那个窗口的状态，检测永远失败、窗口永远不关。
 * 两个窗口同源，storage 事件一定能送达。
 */
function installVerifyReadyListener(): void {
    window.addEventListener('storage', event => {
        if (event.key !== VERIFY_READY_KEY) {
            return
        }
        handleVerifyPassed()
    })
}

installVerifyReadyListener()

async function tick(): Promise<void> {
    if (!probing || challengeState.passed) {
        stopProbing()
        return
    }
    if (Date.now() < probeStartAt) {
        return
    }
    if (Date.now() > probeDeadline) {
        stopProbing()
        return
    }

    // 用户自己把窗口关了：停止等待，不再折腾
    if (verifyWindow && verifyWindow.closed) {
        // 用户自己关了窗口：收起卡片。全局冷却会让最近一分钟内不再自动弹。
        stopProbing()
        closeChallenge()
        return
    }

    const passed = verifyWindow
        ? verifyWindowPassed()
        : !(await probeIsChallenge(challengeState.url))
    if (!passed) {
        return
    }
    handleVerifyPassed()
}

function startProbing(url: string): void {
    stopProbing()
    probing = true
    // 先给窗口几秒把自己的页面加载出来，避免刚打开就把空白页判成"已通过"
    probeStartAt = Date.now() + 3000
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
    // 不在已知会触发 CF 挑战的站点上，403 只是普通限流/网络错误，不该弹验证提示
    if (!isKnownChallengeHost()) {
        return false
    }
    if (challengeState.active) {
        return false
    }
    const now = Date.now()
    if (now - lastNotifiedAt < NOTIFY_COOLDOWN_MS) {
        return false
    }
    lastNotifiedAt = now
    try {
        window.sessionStorage.setItem(COOLDOWN_KEY, String(now))
    } catch {
        // 忽略
    }
    try {
        window.sessionStorage.setItem(COOLDOWN_KEY, String(now))
    } catch {
        // 忽略
    }

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
    /*
     * 卡片始终显示，不去猜「窗口到底弹出来没有」。
     *
     * window.open 在某些情况下会返回一个对象但窗口并不出现（被静默拦下），
     * 之前据此把 UI 隐藏掉，结果窗口没有、卡片也没有，整个功能看起来不存在。
     * 现在无条件显示卡片：窗口真出来了它就是背景里的一层提示，
     * 没出来用户可以直接点上面的按钮。
     */
    challengeState.active = true
    openVerifyWindow()
    /*
     * 不管 window.open 有没有返回引用都开始等待：真正判断「验证完成」靠的是
     * 验证窗口写入的 localStorage 记号（storage 事件），不依赖这个引用。
     */
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
