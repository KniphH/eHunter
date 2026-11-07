import { ImgSrcMode } from '../model/model'

export interface ImageRetryPolicyOptions {
    autoRetryByOtherSource: boolean
    supportChangeSource: boolean
}

export interface ImageRetryStage {
    mode: ImgSrcMode
    attempts: number
}

const defaultOnlyRetryStages: ImageRetryStage[] = [
    { mode: ImgSrcMode.Default, attempts: 3 },
]

/**
 * 下载（批量落盘）用的分段策略：一次只往后走，不绕回已失败的模式。
 *
 * **不含原图**：e-hentai 的原图链接（图片页 `#i6` 里那个 Download original）
 * 每下载一次都会扣 GP，自动重试绝对不能碰它。
 */
const sourceFallbackRetryStages: ImageRetryStage[] = [
    { mode: ImgSrcMode.Default, attempts: 2 },
    { mode: ImgSrcMode.ChangeSource, attempts: 2 },
]

export function getImageRetryStages(options: ImageRetryPolicyOptions): ImageRetryStage[] {
    if (options.autoRetryByOtherSource && options.supportChangeSource) {
        return sourceFallbackRetryStages
    }
    return defaultOnlyRetryStages
}

export interface ImageRetryPlanOptions {
    /** 设置里的「自动换源重试」开关 */
    autoRetryByOtherSource: boolean
    /** 当前平台能不能换源 */
    supportChangeSource: boolean
    /** 这一轮从哪个模式开始试（用户手动点了换源/原图时用它），默认 Default */
    startMode?: ImgSrcMode
    /** 绕几圈 */
    rounds: number
}

/**
 * 阅读器的重试顺序：默认源 → 换源 → 默认源 → 换源，绕 `rounds` 圈后放弃。
 *
 * 之所以要「绕圈」而不是「一路往后走」：换源可能失败，而默认源往往只是临时抖动
 * （CDN 限流、连接被掐），隔一圈回来再试是值得的。
 *
 * **原图（Origin）永远不进循环**：e-hentai 上取原图会扣 GP，自动重试不能替用户花这个钱。
 * 只有用户自己点了「原图」，它才作为起点出现在计划表最前面**一次**（见 `startMode`）。
 *
 * 返回的是**一次会话的完整计划**：调用方按序消费到底就结束，不能中途重建。
 * 旧实现每次失败都重建队列、且重建时把「已放弃」标志重置掉，图片彻底取不到时
 * 会无限重试（实测几百次）。
 */
export function buildImageRetryPlan(options: ImageRetryPlanOptions): ImgSrcMode[] {
    const cycle: ImgSrcMode[] = [ImgSrcMode.Default]
    // 只有允许自动换源时才把换源放进循环，否则等于换个说法重复请求默认源
    if (options.autoRetryByOtherSource && options.supportChangeSource) {
        cycle.push(ImgSrcMode.ChangeSource)
    }

    const startIndex = options.startMode === undefined ? -1 : cycle.indexOf(options.startMode)
    // 用户指定的起点在循环里时，把循环转一下让它排第一个，后续顺序保持不变
    const ordered = startIndex > 0
        ? [...cycle.slice(startIndex), ...cycle.slice(0, startIndex)]
        : cycle

    const plan: ImgSrcMode[] = []
    const rounds = Math.max(1, options.rounds)
    for (let round = 0; round < rounds; round++) {
        plan.push(...ordered)
    }

    // 起点不在循环里（原图、或者平台不支持换源时用户仍点了换源）：只试这一次
    if (options.startMode !== undefined && startIndex < 0) {
        plan.unshift(options.startMode)
    }
    return plan
}
