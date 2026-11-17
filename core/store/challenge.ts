import { reactive } from 'vue'

/**
 * 运行中的 Cloudflare 验证。
 *
 * 场景：漫画看到一半，某个图片页请求被 Cloudflare 挑战，返回 403 挑战页。
 * 这时候插件只会显示"图片加载失败"，用户根本不知道发生了什么、也没法去验证。
 *
 * 所以这里在请求层识别出"这是挑战页"后弹一层覆盖层：iframe 加载那个被挑战的
 * 地址，用户在 iframe 里完成验证，cf_clearance 写到同域 cookie 上，然后
 * 记住当前阅读位置并整页重载，失败的请求自然重发。
 *
 * 注意与「打开页面就是挑战页」区分：那种情况 main.ts 直接不挂载插件，
 * 用户在原页面上点就行，不需要这一层。
 */
export const challengeState = reactive({
    active: false,
    /** 被挑战的地址，iframe 加载它 */
    url: '',
    /** 已判定通过，正在等重载 */
    passed: false,
})

export function notifyCloudflareChallenge(url: string): void {
    if (challengeState.active) {
        return
    }
    challengeState.active = true
    challengeState.url = url
    challengeState.passed = false
}

export function closeCloudflareChallenge(): void {
    challengeState.active = false
    challengeState.url = ''
    challengeState.passed = false
}

const RESUME_KEY = 'ehunter:resume-index'

/** 验证通过要整页重载，先把当前阅读位置记下来 */
export function saveResumeIndex(index: number): void {
    try {
        window.sessionStorage.setItem(RESUME_KEY, String(index))
    } catch {
        // 隐私模式等场景 sessionStorage 可能不可用，忽略即可
    }
}

/** 重载后取出并清掉，只生效一次 */
export function takeResumeIndex(): number | null {
    try {
        const raw = window.sessionStorage.getItem(RESUME_KEY)
        if (raw === null) {
            return null
        }
        window.sessionStorage.removeItem(RESUME_KEY)
        const value = Number(raw)
        return Number.isFinite(value) && value >= 0 ? value : null
    } catch {
        return null
    }
}
