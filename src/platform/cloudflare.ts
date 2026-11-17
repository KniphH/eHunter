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
const CHALLENGE_TITLE_RE = /just a moment|attention required|checking your browser|正在进行安全验证|正在验证|安全验证|请稍候/i
const CHALLENGE_TEXT_RE = /verify you are human|checking your browser before accessing|正在进行安全验证|验证您是真人|防护恶意自动程序/i
const CHALLENGE_SELECTOR = '#challenge-form, #challenge-running, #cf-challenge-running, #challenge-stage, .cf-turnstile, cf-turnstile'

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
