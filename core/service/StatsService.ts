/**
 * 运行时状态采样。
 *
 * 目的很窄：**出问题时能一眼看出卡在哪一环**，而不是靠猜。
 * 所以这里只采「有决策价值」的几个人数：一条请求花了多久、多少字节、
 * 一次超分每一段各占多少、这一页试了几次才成。
 *
 * 几个约定：
 * - 采样是**环形缓冲**，不写日志、不落盘。浮层关着的时候照样采，
 *   否则打开瞬间是空的，看不到刚刚发生过什么。
 * - 这个模块只管**数据**。UI 在 `components/StatsOverlay.vue`。
 * - 浮层的开关状态放在这里，因为入口有两个（Shift+I、右键），
 *   放组件里会变成两处各存一份。
 */

import { reactive } from 'vue'

export type NetChannel = 'img' | 'blob' | 'superres'

/** 一条图片请求（含 `<img>` 自身的加载） */
export interface NetSample {
    id: number
    at: number
    channel: NetChannel
    host: string
    url: string
    ms: number
    bytes: number
    ok: boolean
    /** 失败原因 / HTTP 码，看不出来就别填 */
    note: string
}

/** 一次超分渲染。分段时间是可相加的，用来判断瓶颈在哪 */
export interface RenderSample {
    id: number
    at: number
    url: string
    sourceWidth: number
    sourceHeight: number
    /** 原图字节数（拉下来的 blob 大小） */
    sourceBytes: number
    width: number
    height: number
    /** 输出字节数（编码之后） */
    bytes: number
    passes: number
    decodeMs: number
    gpuMs: number
    encodeMs: number
    totalMs: number
}

/**
 * 某一页此刻的状态。整页替换，不原地改，省得响应式追踪漏字段。
 *
 * 尺寸和体积都分「原图 / 超分」两套：读者最想知道的恰恰是这两个的差。
 * 拿不到的那一侧写 0，UI 显示 `—`，不猜。
 */
export interface PageSnapshot {
    index: number
    /** ImgLoadStatus 的数值，1=Loading 2=Error 3=Loaded */
    status: number
    /** ImgSrcMode 的数值 */
    mode: number
    attempts: number
    running: boolean
    /** 因为页面不可见而暂停，不是失败 */
    paused: boolean
    elapsedSec: number
    /** 本次会话从开始到现在 */
    loadMs: number
    /** 最近一次取址（问平台要地址）花的时间 */
    fetchMs: number
    error: string
    srcHost: string
    /** displaySrc 的来源：超分结果 / 兜底 blob / 缩略图 / 原地址 */
    displayKind: 'none' | 'thumb' | 'blob' | 'superres' | 'url'
    /** 此刻 `<img>` 真正显示的像素尺寸 */
    displayWidth: number
    displayHeight: number
    /** 原图像素尺寸（超分时来自渲染记录，否则等于显示尺寸） */
    originalWidth: number
    originalHeight: number
    /** 原图字节数（来自 Resource Timing，跨域拿不到时是 0） */
    originalBytes: number
    superWidth: number
    superHeight: number
    superBytes: number
    superPasses: number
    superMs: number
    updatedAt: number
}

const NET_LIMIT = 48
const RENDER_LIMIT = 12

let nextId = 1

/** 只留 host，完整 URL 又长又没信息量；blob/data 单独标出来 */
export function hostOf(url: string): string {
    if (!url) {
        return ''
    }
    if (url.startsWith('blob:')) {
        return 'blob'
    }
    if (url.startsWith('data:')) {
        return 'data'
    }
    try {
        return new URL(url, location.href).host
    } catch (e) {
        return url.slice(0, 32)
    }
}

export const stats = reactive({
    visible: false,
    openedAt: 0,
    net: [] as NetSample[],
    renders: [] as RenderSample[],
    pages: {} as Record<number, PageSnapshot>,
    bytesTotal: 0,
    reqCount: 0,
    failCount: 0,
    fps: 0,
    heapUsed: 0,
    heapLimit: 0,
    nodes: 0,
    /** 探针每 500ms +1；UI 用它驱动派生值重算（速度、平均耗时这类） */
    tick: 0,
})

export function reportNet(sample: Omit<NetSample, 'id' | 'at' | 'host'> & { url: string }): void {
    stats.net.push({
        id: nextId++,
        at: Date.now(),
        host: hostOf(sample.url),
        ...sample,
    })
    stats.reqCount++
    stats.bytesTotal += sample.ok ? sample.bytes : 0
    if (!sample.ok) {
        stats.failCount++
    }
    while (stats.net.length > NET_LIMIT) {
        stats.net.shift()
    }
}

export function reportRender(sample: Omit<RenderSample, 'id' | 'at'>): void {
    stats.renders.push({ id: nextId++, at: Date.now(), ...sample })
    while (stats.renders.length > RENDER_LIMIT) {
        stats.renders.shift()
    }
}

export function reportPage(snapshot: PageSnapshot): void {
    stats.pages[snapshot.index] = snapshot
}

export function getPage(index: number): PageSnapshot | null {
    return stats.pages[index] || null
}

export function resetStats(): void {
    stats.net = []
    stats.renders = []
    stats.pages = {}
    stats.bytesTotal = 0
    stats.reqCount = 0
    stats.failCount = 0
    stats.openedAt = Date.now()
}

export function openStats(): void {
    if (!stats.visible) {
        stats.openedAt = Date.now()
    }
    stats.visible = true
}

export function closeStats(): void {
    stats.visible = false
}

export function toggleStats(): void {
    if (stats.visible) {
        closeStats()
    } else {
        openStats()
    }
}

/**
 * 采样探针。只在浮层打开期间跑，关掉就把 rAF 停掉——
 * 一直开着 rAF 去算一个没人看的 FPS 是纯粹的耗电。
 *
 * FPS 这里量的是**主线程出帧节奏**：页面静止时它等于屏幕刷新率，
 * 超分把主线程堵住时会掉下来，正好能反映卡顿。
 */
export function startProbe(): () => void {
    let frames = 0
    let lastFrameAt = performance.now()
    let rafId = 0
    let alive = true

    const loop = (now: number) => {
        if (!alive) {
            return
        }
        frames++
        const span = now - lastFrameAt
        if (span >= 500) {
            stats.fps = Math.round((frames * 1000) / span)
            frames = 0
            lastFrameAt = now
        }
        rafId = window.requestAnimationFrame(loop)
    }
    rafId = window.requestAnimationFrame(loop)

    /**
     * 节点数用 MutationObserver 增量维护。
     *
     * 原来每 500ms 跑一次 `getElementsByTagName('*').length`：漫画页有几十个页容器，
     * 节点数几千到上万，浮层一开就是一笔固定开销。增量计数只在 DOM 变动时做加减，
     * 500ms 的采样只负责把结果写给 UI。
     */
    let nodeCount = document.getElementsByTagName('*').length
    stats.nodes = nodeCount
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            nodeCount += record.addedNodes.length - record.removedNodes.length
        }
        if (nodeCount < 0) {
            nodeCount = 0
        }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })

    const sampleMemory = () => {
        const memory = (performance as any).memory
        if (memory) {
            stats.heapUsed = memory.usedJSHeapSize || 0
            stats.heapLimit = memory.jsHeapSizeLimit || 0
        }
        stats.nodes = nodeCount
        stats.tick++
    }
    sampleMemory()
    const timer = window.setInterval(sampleMemory, 500)

    return () => {
        alive = false
        window.cancelAnimationFrame(rafId)
        window.clearInterval(timer)
        observer.disconnect()
    }
}

// ---------------------------------------------------------------- 汇总

export interface AlbumTotals {
    /** 整本页数 */
    total: number
    /** 已经有状态记录的页（被浏览过 / 预取过） */
    known: number
    loaded: number
    /** 此刻真的有一条会话在跑的页 */
    loading: number
    failed: number
    untouched: number
    /** 已加载页的平均加载耗时 */
    avgLoadMs: number
    /** 已加载页原图字节合计 */
    originalBytes: number
    /** 超分输出字节合计 */
    superBytes: number
    /** 已经被超分过的页数 */
    superPages: number
}

/**
 * 从逐页快照里汇总整本进度。
 *
 * 口径说明：
 * - `loading` 认 `running` 而不是 `status === Loading`：状态会残留，
 *   会话标记才是「此刻真的在跑」；
 * - `untouched` 是总页数减掉有记录的页，包含还没滚到的页，不是「失败」。
 */
export function summarizeAlbum(pageCount: number): AlbumTotals {
    const totals: AlbumTotals = {
        total: pageCount || 0,
        known: 0,
        loaded: 0,
        loading: 0,
        failed: 0,
        untouched: 0,
        avgLoadMs: 0,
        originalBytes: 0,
        superBytes: 0,
        superPages: 0,
    }
    let loadMsSum = 0
    let loadMsCount = 0
    for (const key of Object.keys(stats.pages)) {
        const page = stats.pages[Number(key)]
        if (!page) {
            continue
        }
        totals.known++
        if (page.running) {
            totals.loading++
        }
        if (page.status === 3) {
            totals.loaded++
            if (page.loadMs > 0) {
                loadMsSum += page.loadMs
                loadMsCount++
            }
        } else if (page.status === 2 && !page.running) {
            totals.failed++
        }
        totals.originalBytes += page.originalBytes || 0
        if (page.superWidth) {
            totals.superPages++
            totals.superBytes += page.superBytes || 0
        }
    }
    totals.untouched = Math.max(0, totals.total - totals.known)
    totals.avgLoadMs = loadMsCount ? Math.round(loadMsSum / loadMsCount) : 0
    return totals
}

// ---------------------------------------------------------------- 格式化

export function formatBytes(bytes: number): string {
    if (!bytes) {
        return '0 B'
    }
    if (bytes < 1024) {
        return `${bytes} B`
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`
    }
    if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`
    }
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function formatMs(ms: number): string {
    if (!ms) {
        return '0ms'
    }
    if (ms < 1000) {
        return `${Math.round(ms)}ms`
    }
    return `${(ms / 1000).toFixed(2)}s`
}

/** 平均速度，字节/毫秒 -> MB/s */
export function formatSpeed(bytes: number, ms: number): string {
    if (!bytes || !ms) {
        return '—'
    }
    const mbPerSec = (bytes / 1024 / 1024) / (ms / 1000)
    if (mbPerSec < 0.01) {
        return `${(mbPerSec * 1024).toFixed(0)} KB/s`
    }
    return `${mbPerSec.toFixed(2)} MB/s`
}

export function formatDuration(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000))
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return min > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}s`
}
