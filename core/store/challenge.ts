import { reactive } from 'vue'

/**
 * Cloudflare 人机验证的状态。
 *
 * nhentai 前面挂着 Cloudflare，页面被挑战时整页只有"正在进行安全验证"，
 * 插件按正常页面解析会直接报 `Cannot read properties of null`。
 *
 * 这里不报错退出，而是把验证界面搬到插件里：覆盖层内嵌 iframe 加载同一个
 * 地址，用户在 iframe 里点一下完成验证，cf_clearance 会写到同域 cookie 上，
 * 检测到通过就自动重新加载。
 */
export const challengeState = reactive({
    active: false,
    url: '',
    /** 验证通过后是否自动重载；用户手动关掉时不重载 */
    passed: false,
})

export function openCloudflareChallenge(url: string): void {
    challengeState.active = true
    challengeState.url = url
    challengeState.passed = false
}

export function closeCloudflareChallenge(): void {
    challengeState.active = false
    challengeState.url = ''
    challengeState.passed = false
}
