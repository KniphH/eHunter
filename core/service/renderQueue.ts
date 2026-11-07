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

export interface RenderJob {
    /** 去重键：同一张原图只排一次 */
    url: string
    priority: number
    /** 入队序号，只在同优先级之间决定先后 */
    seq: number
    run: () => Promise<void>
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
