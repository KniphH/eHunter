/**
 * Cloudflare 人机验证页的识别。
 *
 * 被挑战时服务端返回的是一张"安全验证"页（Title 通常是 Just a moment...），
 * 上面只有 Turnstile 的勾选框，没有站点本身的内容。插件如果照常解析，
 * 会拿到一堆 null。
 *
 * 判据取三重，任一命中即认为是验证页：
 * 1. 文档标题（最稳，服务端直出）
 * 2. Cloudflare 的挑战容器（新旧两代 id 都覆盖）
 * 3. 正文开头的提示语（标题被站点改写时的兜底）
 */
/**
 * 标题判据必须足够窄。
 *
 * 之前写的 `安全验证|请稍候` 太宽——正常作品标题里出现这两个词，就会把页面
 * 误判成验证页，main.ts 直接不挂载插件，用户什么都看不到。只认 Cloudflare
 * 固定的那几句。
 */
const CHALLENGE_TITLE_RE = /just a moment\.\.\.|attention required!? *\| *cloudflare|checking your browser before accessing|正在进行安全验证|正在验证您是否是真人/i
const CHALLENGE_TEXT_RE = /verify you are human|checking your browser before accessing|正在进行安全验证|验证您是真人|防护恶意自动程序/i
/**
 * 挑战页的**结构性标志**（比标题可靠）。
 *
 * Cloudflare 当前的验证页会在正文里塞一个 Turnstile：
 *   <iframe src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/...">
 *   <input type="hidden" name="cf-turnstile-response" id="cf-chl-widget-xxxx">
 * 验证通过后整页会跳转到真实内容，这些节点随之消失。
 *
 * 老版本用的是 #challenge-form / #challenge-running 那几个 id，一并保留。
 */
export const CHALLENGE_SELECTOR = [
    'input[name="cf-turnstile-response"]',
    '[id^="cf-chl-widget"]',
    '.cf-turnstile',
    'cf-turnstile',
    '#challenge-form',
    '#challenge-running',
    '#cf-challenge-running',
    '#challenge-stage',
].join(', ')

/**
 * 注意：**不能**把 `iframe[src*="challenges.cloudflare.com"]` 放进上面这个列表。
 * 正常页面也可能挂着一个隐形的 challenge-platform iframe（pixiv 上就见过），
 * 拿它判断会把正常站点误判成挑战页，插件直接不挂载。
 * 上面这些（Turnstile 的响应 input / widget id / 旧版挑战容器）只在验证页出现。

/**
 * 验证覆盖层里那个 iframe 的 name。
 *
 * iframe 加载的是站点自己的地址，@match 会再次命中、再注入一次插件，
 * 于是「插件里开 iframe、iframe 里又是插件」无限套娃。
 * 用 window.name 标记，脚本启动时识别并跳过初始化。
 */
export const CHALLENGE_FRAME_NAME = 'ehunter-cf-frame'

export function isChallengeFrame(): boolean {
    try {
        return window.self !== window.top && window.name === CHALLENGE_FRAME_NAME
    } catch {
        return false
    }
}

export function isCloudflareChallengeTitle(title: string): boolean {
    return CHALLENGE_TITLE_RE.test(title || '')
}

export function isCloudflareChallengeDocument(doc: Document = document): boolean {
    if (!doc) {
        return false
    }
    if (isCloudflareChallengeTitle(doc.title)) {
        return true
    }
    try {
        if (doc.querySelector(CHALLENGE_SELECTOR)) {
            return true
        }
    } catch {
        // 跨域文档访问会抛，当作"不是验证页"处理，交给调用方的其他判据
    }
    const headText = (doc.body?.innerText || '').slice(0, 1200)
    return CHALLENGE_TEXT_RE.test(headText)
}

/**
 * 从响应体判断这是不是 Cloudflare 的挑战页（而不是普通的 403 权限拒绝）。
 *
 * 看漫画途中图片页请求被挑战时，服务端回的就是这一整套 HTML，
 * 只有识别出来才能提示用户去验证，而不是笼统报"加载失败"。
 */
export function isCloudflareChallengeHtml(html: string): boolean {
    if (!html) {
        return false
    }
    const head = html.slice(0, 4000)
    return /challenge-platform|cf-browser-verification|cf_chl_|Just a moment\.\.\.|正在验证您是否是真人|正在进行安全验证/i.test(head)
}
