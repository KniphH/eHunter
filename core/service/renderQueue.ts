/**
 * 超分渲染队列的调度规则。
 *
 * 一次只算一页（单个 WebGL context），所以问题不是并行，而是**下一张算谁**。
 * 纯 FIFO 会让「先入队」赢过「用户正在看」：开启开关时的补跑、翻页时的预取
 * 都是批量入队，当前页往往排在十几个准备页后面。这里改成按 priority 取最小，
 * 同优先级再按入队序号，保证结果稳定。
 *
 * priority 越小越先：0 = 当前页，10/20… = 与当前页的距离，DEFAULT_RENDER_PRIORITY 兜底。
 */
export const DEFAULT_RENDER_PRIORITY = 1000

/**
 * 往后看几页。阅读方向是往后，所以后面的页比「前面那一页」更值得先算。
 */
export const SUPER_RES_LOOKAHEAD = 3

/**
 * 排队窗口：当前页前一页 ~ 当前页往后 3 页。
 *
 * 用户已经翻过去的前面的页不再排队——它们要么在缓存里，要么翻回去时重新算，
 * 排在队里只会拖慢当前阅读方向。前面只留一页，是为了覆盖「往回翻一页」的情况。
 */
export function isInSuperResWindow(pageIndex: number, center: number): boolean {
    return pageIndex >= center - 1 && pageIndex <= center + SUPER_RES_LOOKAHEAD
}

/**
 * 排队优先级，数值越小越先：
 * - 当前页 0
 * - 后面的第 k 页 = k × 10
 * - 前面第 1 页 = 100（比后面三页都靠后）
 * - 窗口外 = 10000（正常情况下入队前就已被过滤）
 */
export function superResPriority(pageIndex: number, center: number): number {
    if (!isInSuperResWindow(pageIndex, center)) {
        return 10000
    }
    const delta = pageIndex - center
    if (delta >= 0) {
        return delta * 10
    }
    return 100
}

export interface RenderJob {
    /** 去重键：同一张原图只排一次 */
    url: string
    priority: number
    /** 入队序号，只在同优先级之间决定先后 */
    seq: number
    run: () => Promise<void>
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
