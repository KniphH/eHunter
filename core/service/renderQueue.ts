/**
 * 超分渲染队列的调度规则。
 *
 * 调度规则：按 priority 取最小，同优先级按入队序号。
 * 纯 FIFO 会让「先入队」赢过「用户正在看」：开启开关时的补跑、翻页时的预取
 * 都是批量入队，当前页往往排在十几个准备页后面。
 *
 * 现在渲染是并发的（多个 worker 各自持一个 WebGL slot），但**顺序规则不变**：
 * 每次取当前优先级最高的那个，所以并发也不会让远处的页抢在眼前这页前面。
 *
 * priority 越小越先：0 = 当前页，10/20… = 与当前页的距离，DEFAULT_RENDER_PRIORITY 兜底。
 */
export const DEFAULT_RENDER_PRIORITY = 1000

/**
 * 往后看几页的默认值。实际值由设置项 superResLookahead 决定，
 * 阅读方向是往后，所以后面的页比「前面那一页」更值得先算。
 */
export const SUPER_RES_LOOKAHEAD = 3

/**
 * 排队窗口：当前页前一页 ~ 当前页往后 N 页（N 由设置项决定，默认 3）。
 *
 * 用户已经翻过去的前面的页不再排队——它们要么在缓存里，要么翻回去时重新算，
 * 排在队里只会拖慢当前阅读方向。前面只留一页，是为了覆盖「往回翻一页」的情况。
 */
export function isInSuperResWindow(
    pageIndex: number,
    center: number,
    lookahead: number = SUPER_RES_LOOKAHEAD,
): boolean {
    return pageIndex >= center - 1 && pageIndex <= center + lookahead
}

/**
 * 排队优先级，数值越小越先：
 * - 当前页 0
 * - 后面的第 k 页 = k × 10
 * - 前面的第 k 页 = 100 + k × 10（比后面都靠后，且越远越靠后）
 * - 窗口外 = 10000 + 距离 × 10
 *
 * 关键在于**同一侧的远近必须能区分**。
 * 原来「前面的页一律 100」「窗口外一律 10000」，同分之后淘汰只能按 Map 插入顺序挑，
 * 于是翻到第 4 页时丢掉的是第 2 页而不是最远的第 1 页，
 * 接着又要为第 2 页腾位置，再来一轮——就是用户看到的「左右互搏」。
 */
export function superResPriority(
    pageIndex: number,
    center: number,
    lookahead: number = SUPER_RES_LOOKAHEAD,
): number {
    const delta = pageIndex - center
    if (!isInSuperResWindow(pageIndex, center, lookahead)) {
        // 窗口外：越远越该被淘汰
        return 10000 + Math.abs(delta) * 10
    }
    if (delta >= 0) {
        return delta * 10
    }
    return 100 + -delta * 10
}

export interface RenderJob {
    /** 去重键：同一张原图只排一次 */
    url: string
    priority: number
    /** 入队序号，只在同优先级之间决定先后 */
    seq: number
    /** workerId 决定用哪个 WebGL slot（见 SuperResolutionService.slots） */
    run: (workerId: number) => Promise<void>
    /** 被窗口裁掉时调用，让挂起的 promise 结束（不是失败，只是没算） */
    cancel: () => void
}

/**
 * 取出优先级最高的任务（数值最小）；同优先级按入队先后。
 * 队列长度是「待算页数」级别（几十），线性扫一遍比维护堆更简单，也不会因排序抖动改变同优先级顺序。
 */
export function takeNextJob(queue: RenderJob[]): RenderJob | null {
    if (queue.length === 0) {
        return null
    }
    let best = 0
    for (let i = 1; i < queue.length; i++) {
        const candidate = queue[i]
        const current = queue[best]
        if (candidate.priority < current.priority
            || (candidate.priority === current.priority && candidate.seq < current.seq)) {
            best = i
        }
    }
    return queue.splice(best, 1)[0]
}
