import { computed, nextTick, onUnmounted, ref, type ComputedRef } from 'vue'
import type { AlbumService } from '../../service/AlbumService'
import { ImgSrcMode } from '../../model/model'
import { i18n } from '../../store/i18n'
import { store, storeAction } from '../../store/app'
import Logger from '../../utils/logger'
import { buildImageRetryPlan } from '../../service/imageRetryPolicy'
import { isInSuperResWindow, superResPriority } from '../../service/renderQueue'
import { fetchImageObjectUrl } from '../../service/ImageFetchService'
import { superResolutionService } from '../../service/SuperResolutionService'
import { hostOf, reportNet, reportPage, type PageSnapshot } from '../../service/StatsService'

export enum ImgLoadStatus {
    Waiting = 0,
    Loading = 1,
    Error = 2,
    Loaded = 3,
}

interface UsePageImageLoaderOptions {
    index: number
    albumService: AlbumService
    imgPageInfo: ComputedRef<any>
    warmMagnifierSource: (src: string) => Promise<void>
    /** 这一页当前是否可见。不可见时 <img> 根本不在 DOM 里，不能用「等不到事件」判失败 */
    isActive: () => boolean
    /** 拿到 <img> 元素，用来区分「还在下载」和「浏览器已经放弃但事件丢了」 */
    getImgElement: () => HTMLImageElement | null
}

/**
 * 一圈 = 默认源 →（换源）；绕两圈就停，剩下的交给用户手动重试。
 * **原图不参与自动重试**：e-hentai 取原图扣 GP，不能替用户自动花。只有用户点「原图」才试。
 */
const RETRY_ROUNDS = 2
/** 单次取址超时。平台接口挂住时不能把整条链拖死 */
const FETCH_TIMEOUT_MS = 12000
/** 兜底通道（GM / fetch 拉字节）超时。这条通道原来**没有**超时，能永久挂住 */
const DEGRADED_FETCH_TIMEOUT_MS = 15000
/** 等 `<img>` 事件的检查间隔 */
const IMG_EVENT_TICK_MS = 3000
/** 最多检查几次（4 × 3s = 12s）。图片要么很快出来，要么就是出不来，不必等一分钟 */
const IMG_EVENT_MAX_TICKS = 4
/**
 * 页面不可见时最多再等几次（2 × 3s = 6s）。
 *
 * `active` 是跟着视口算的，`<img>` 又带 `v-if="active && …"`：滚动时元素会被摘掉，
 * 于是 load 事件永远不会来。旧实现「不可见就一直重排、不计数」，
 * 这一次等待就能永久停住 —— 三个平台表现一致，用户看到的就是「重试卡住不动」。
 *
 * 现在给一段宽限期（够滚过去的抖动），超了就**暂停**整条会话：
 * 状态留在加载中，但不再继续烧计划；页面重新可见时由页面层重开一轮。
 */
const IMG_EVENT_MAX_INACTIVE_TICKS = 2
/** 同一个地址最多试几次（多个模式可能指向同一张图） */
const MAX_ATTEMPTS_PER_SRC = 2
/**
 * 装上去的图和这一页应有的宽高比相差多少倍就判为「取错了图」。
 * 阈值放到 3 倍：只拦明显不是同一张的情况（比如多页拼版预览图，比例能差十几倍），
 * 不会误杀尺寸信息略微不准的正常页。
 */
const MAX_ASPECT_DEVIATION = 3
/**
 * 一次会话失败后，隔多久自动再开一轮（秒），依次用完后彻底停下。
 *
 * 重试计划绕两圈就停是为了不放大请求量；但网络抖动、代理线路被掐这类失败
 * 往往几十秒后自己就好了，停住不动只能让用户手动点刷新。
 * 这里按退避节奏再给几次机会，倒计时会显示在失败提示里——是显式的，不是偷偷重试。
 * 用户手动点「刷新 / 换源 / 原图」会立即重置这套节奏。
 */
const AUTO_RETRY_DELAYS = [10, 30, 90, 300]

export function usePageImageLoader(options: UsePageImageLoaderOptions) {
    const { index, albumService, imgPageInfo, warmMagnifierSource, isActive, getImgElement } = options

    const reloadTimes = ref(0)
    const message = ref('')
    const curLoadStatus = ref(ImgLoadStatus.Waiting)
    const lastLoadMode = ref(ImgSrcMode.Default)
    /** 本会话剩余待尝试的模式，一次会话只构建一次，按序消费，空即放弃 */
    const autoRetryQueue = ref<ImgSrcMode[]>([])
    const isAutoRetryExhausted = ref(false)
    /** 这一页此刻是否真有一条会话在跑。用来区分「正在加载」和「加载状态残留」 */
    const isSessionRunning = ref(false)
    /** 当前这次尝试已经等了多少秒，显示在提示里——否则页面一动不动，看着就是卡死了 */
    const elapsedSec = ref(0)

    /**
     * 会话号。每次开始新会话 +1，旧会话的 await 回来发现号变了就直接退出，
     * 不写状态、不再发请求。这样用户点重试永远立刻生效，不会被进行中的自动重试吞掉。
     */
    let sessionId = 0
    /** 当前正在等 <img> 事件的那次尝试 */
    let pendingSettle: ((ok: boolean) => void) | null = null
    let watchdogTimer: number | null = null
    let elapsedTimer: number | null = null
    let attemptStartedAt = 0
    /** 本次会话起止，给状态浮层算「这一页一共花了多久」 */
    let sessionStartedAt = 0
    let sessionFinishedAt = 0
    /** 最近一次取址（问平台要地址）耗时 */
    let lastFetchMs = 0
    /** 原图字节数：只有一次 `<img>` 加载成功时能从 Resource Timing 拿到 */
    let originalBytes = 0
    /** 本次会话最终失败的原因（HTTP 403 / timeout / network error…），显示在提示里 */
    let failReason = ''
    /** 这次会话是因为「页面不可见」中止的：状态留着，但绝不能继续往下烧计划 */
    let pausedByVisibility = false
    /** 兜底通道自己产出的 blob 地址，只有这些能由我们 revoke（超分的 blob 归超分缓存管） */
    const ownBlobUrls = new Set<string>()
    /** 自动重试倒计时（秒）；0 表示当前没有安排 */
    const autoRetrySec = ref(0)
    let autoRetryAt = 0
    let autoRetryTimer: number | null = null
    let autoRetryCount = 0

    const loadingInfo = computed(() => {
        const reloadInfo = reloadTimes.value ? `[${i18n.value.reload}-${reloadTimes.value}] ` : ''
        const retryInfo = autoRetrySec.value > 0
            ? ` · ${i18n.value.autoRetryIn.replace('{sec}', String(autoRetrySec.value))}`
            : ''
        if (message.value) {
            return reloadInfo + message.value + retryInfo
        }
        switch (curLoadStatus.value) {
            case ImgLoadStatus.Error:
                return reloadInfo + i18n.value.loadingImgFailed + retryInfo
            case ImgLoadStatus.Loaded:
                return reloadInfo + i18n.value.imgLoaded
            case ImgLoadStatus.Waiting:
                return reloadInfo + i18n.value.waiting
            default: {
                // 从第 3 秒开始带秒数：真的卡住时能一眼看出「它是在等，还是死在这了」
                const waited = elapsedSec.value >= 3 ? ` · ${elapsedSec.value}s` : ''
                return reloadInfo + i18n.value.loadingImg + waited
            }
        }
    })

    function clearElapsedTimer() {
        if (elapsedTimer !== null) {
            window.clearInterval(elapsedTimer)
            elapsedTimer = null
        }
    }

    function clearAutoRetryTimer() {
        if (autoRetryTimer !== null) {
            window.clearInterval(autoRetryTimer)
            autoRetryTimer = null
        }
        autoRetryAt = 0
        autoRetrySec.value = 0
    }

    /** 用户手动重试 / 成功加载后，退避次数从头算 */
    function resetAutoRetry() {
        clearAutoRetryTimer()
        autoRetryCount = 0
    }

    /**
     * 失败后安排下一次自动重试，倒计时写在失败提示里。
     *
     * 只在页面可见时安排：不可见时 `<img>` 会被 v-if 摘掉，重开也等不到事件，
     * 那种情况交给页面层的可见性重开逻辑。
     */
    function scheduleAutoRetry() {
        if (!isActive() || autoRetryCount >= AUTO_RETRY_DELAYS.length) {
            return
        }
        clearAutoRetryTimer()
        const delay = AUTO_RETRY_DELAYS[autoRetryCount]
        autoRetryCount++
        autoRetryAt = Date.now() + delay * 1000
        autoRetrySec.value = delay
        autoRetryTimer = window.setInterval(() => {
            const left = Math.ceil((autoRetryAt - Date.now()) / 1000)
            if (left > 0) {
                autoRetrySec.value = left
                return
            }
            clearAutoRetryTimer()
            Logger.logText('LOADING', `auto retry ${autoRetryCount}/${AUTO_RETRY_DELAYS.length}`)
            void loadImgSrc(ImgSrcMode.Default)
        }, 500)
    }

    /** 每次开始一次尝试就重置计时，让提示里显示的是「这次」等了多久 */
    function markAttemptStart() {
        attemptStartedAt = Date.now()
        elapsedSec.value = 0
    }

    /**
     * 把这一页此刻的完整状态推给状态浮层。
     *
     * 只在**状态真的变了**的地方调用（会话开始/一次尝试结束/超分替换完成/计时器跳秒），
     * 不要放进任何会被频繁触发的路径——浮层是纯观察者，不该反过来拖累加载。
     */
    function publishPageState() {
        const info = imgPageInfo.value
        const img = getImgElement()
        const displaySrc = info.displaySrc || ''
        let displayKind: PageSnapshot['displayKind'] = 'none'
        if (displaySrc) {
            if (displaySrc === store.thumbInfos[index]?.src) {
                displayKind = 'thumb'
            } else if (superResolutionService.isOwnUrl(displaySrc)) {
                displayKind = 'superres'
            } else if (displaySrc.startsWith('blob:')) {
                displayKind = 'blob'
            } else {
                displayKind = 'url'
            }
        } else if (info.src) {
            displayKind = 'url'
        }
        const superRes = info.src ? superResolutionService.describe(info.src) : null
        const displayWidth = img && img.naturalWidth ? img.naturalWidth : 0
        const displayHeight = img && img.naturalHeight ? img.naturalHeight : 0
        // 超分生效后 `<img>` 的自然尺寸就是放大后的尺寸，原图尺寸只能从渲染记录里取；
        // 没超分时显示的就是原图。缩略图 / 兜底 blob 两侧都说不清，留 0。
        const originalWidth = superRes
            ? superRes.sourceWidth
            : (displayKind === 'url' || displayKind === 'none' ? displayWidth : 0)
        const originalHeight = superRes
            ? superRes.sourceHeight
            : (displayKind === 'url' || displayKind === 'none' ? displayHeight : 0)
        reportPage({
            index,
            status: curLoadStatus.value,
            mode: lastLoadMode.value,
            attempts: reloadTimes.value,
            running: isSessionRunning.value,
            paused: pausedByVisibility,
            elapsedSec: elapsedSec.value,
            loadMs: sessionStartedAt ? (sessionFinishedAt || Date.now()) - sessionStartedAt : 0,
            fetchMs: lastFetchMs,
            error: failReason || message.value,
            srcHost: hostOf(info.src || ''),
            displayKind,
            displayWidth,
            displayHeight,
            originalWidth,
            originalHeight,
            // 优先用超分那次自己拉的 blob 大小：跨域图片的 Resource Timing
            // 拿不到字节数（没有 Timing-Allow-Origin），那边会是 0
            originalBytes: superRes && superRes.sourceBytes ? superRes.sourceBytes : originalBytes,
            superWidth: superRes ? superRes.width : 0,
            superHeight: superRes ? superRes.height : 0,
            superBytes: superRes ? superRes.bytes : 0,
            superPasses: superRes ? superRes.params : 0,
            superMs: superRes ? Math.round(superRes.costMs) : 0,
            updatedAt: Date.now(),
        })
    }

    /**
     * 记一条 `<img>` 自己的加载：浏览器发的请求我们拿不到字节数，
     * 跨域资源的 `transferSize` 是 0，只能报「耗时 + 是否成功」。
     * 想看真实字节/速度就看兜底通道和超分那两条。
     */
    function reportImgNetwork(src: string, startedAt: number, ok: boolean) {
        let ms = performance.now() - startedAt
        let bytes = 0
        try {
            // 性能条目是用**绝对地址**登记的，而 `src` 常常是 `/01.jpg` 这种相对路径；
            // 直接拿相对路径去查会一条都查不到，字节数就永远是 0。
            //
            // 优先读 `<img>` 自己解析好的地址：页面里若有 `<base href>`，
            // 浏览器是按 base 解析的，拿 location.href 去拼会拼到另一台机器上
            const absolute = getImgElement()?.src || new URL(src, location.href).href
            const entries = performance.getEntriesByName(absolute, 'resource') as PerformanceResourceTiming[]
            const entry = entries[entries.length - 1]
            if (entry) {
                if (entry.duration > 0) {
                    ms = entry.duration
                }
                bytes = entry.transferSize > 0 ? entry.transferSize : (entry.decodedBodySize || 0)
            }
        } catch (e) {
            // 拿不到性能条目就用手表时间，别让统计把加载搞挂
        }
        if (ok && bytes) {
            originalBytes = bytes
        }
        reportNet({ channel: 'img', url: src, ms, bytes, ok, note: ok ? '' : 'img' })
    }

    function clearWatchdog() {
        if (watchdogTimer !== null) {
            window.clearTimeout(watchdogTimer)
            watchdogTimer = null
        }
    }

    function settlePending(ok: boolean) {
        const settle = pendingSettle
        pendingSettle = null
        clearWatchdog()
        const accepted = acceptsCurrentImage(ok)
        if (settle) {
            settle(accepted)
        }
        return accepted
    }

    /**
     * 等这一次的 `<img>` 出结果。
     *
     * **不能只靠事件**：元素被 `v-if` 摘掉、请求被浏览器吞掉、src 为空时，
     * load/error 永远不会来，整条重试链就永久停住（用户感知就是「卡住不继续重试」）。
     * 所以这里挂一个看门狗，定期检查元素的真实状态：
     * - 页面不可见 / 元素还没挂上 → 继续等（不判失败，否则后台页会把计划白白烧光）
     * - 元素还在下载 → 继续等
     * - 元素 complete 了却没事件 → 按 naturalWidth 判定成败，替事件做决定
     * - 超过总上限 → 判失败，继续下一个源
     */
    function waitImageSettled(): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            let ticks = 0
            let inactiveTicks = 0
            let finished = false

            const finish = (rawOk: boolean) => {
                if (finished) {
                    return
                }
                finished = true
                clearWatchdog()
                if (pendingSettle === finish) {
                    pendingSettle = null
                }
                resolve(acceptsCurrentImage(rawOk))
            }

            const tick = () => {
                watchdogTimer = null
                if (finished) {
                    return
                }
                // 页面不可见时元素已经被 v-if 摘掉了，这里等不到任何事件
                if (!isActive()) {
                    inactiveTicks++
                    if (inactiveTicks > IMG_EVENT_MAX_INACTIVE_TICKS) {
                        Logger.logText('LOADING', 'page stayed invisible, pause the session instead of burning attempts')
                        pausedByVisibility = true
                        finish(false)
                        return
                    }
                    watchdogTimer = window.setTimeout(tick, IMG_EVENT_TICK_MS)
                    return
                }
                if (ticks >= IMG_EVENT_MAX_TICKS) {
                    Logger.logText('LOADING', `no image event after ${IMG_EVENT_MAX_TICKS} checks, treat as failed`)
                    finish(false)
                    return
                }
                ticks++
                const img = getImgElement()
                if (!img || !img.complete) {
                    // 元素还没挂上，或还在下载
                    watchdogTimer = window.setTimeout(tick, IMG_EVENT_TICK_MS)
                    return
                }
                const ok = img.naturalWidth > 0 && img.naturalHeight > 0
                Logger.logText('LOADING', `image settled without event, treat as ${ok ? 'loaded' : 'failed'}`)
                finish(ok)
            }

            pendingSettle = finish
            watchdogTimer = window.setTimeout(tick, IMG_EVENT_TICK_MS)
        })
    }

    /** 摘掉 displaySrc；如果那是兜底通道自己造的 blob，顺手回收，避免整本漫画堆积内存 */
    function releaseDisplaySrc() {
        const current = imgPageInfo.value.displaySrc
        if (!current) {
            return
        }
        storeAction.setImgPageInfoDisplaySrc(index, '')
        if (ownBlobUrls.delete(current)) {
            URL.revokeObjectURL(current)
        }
    }

    /** 写入地址；换地址时把上一张的超分结果摘掉，否则会继续显示那张超分图 */
    async function applyImgSrc(src: string) {
        if (imgPageInfo.value.displaySrc) {
            releaseDisplaySrc()
        }
        if (imgPageInfo.value.src === src) {
            // 同一个地址再赋一次不会触发 <img> 重新请求，必须先清空让它再走一遍
            storeAction.setImgPageInfoSrc(index, '')
            await nextTick()
        }
        storeAction.setImgPageInfoSrc(index, src)
    }

    /**
     * 试一个模式，只负责拿到地址。取址失败 / 超时 / 抛异常 / 拿到空地址都算失败，
     * 一律返回 null 让调用方直接试下一个源。
     */
    async function requestImgSrc(mode: ImgSrcMode): Promise<string | null> {
        lastLoadMode.value = mode
        const fetchStartedAt = performance.now()
        let timer: number | null = null
        try {
            const timeout = new Promise<null>(resolve => {
                timer = window.setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)
            })
            const resp = await Promise.race([albumService.getImgSrc(index, mode), timeout])
            if (resp === null) {
                Logger.logText('LOADING', `get img src timeout after ${FETCH_TIMEOUT_MS}ms, mode=${mode}`)
                return null
            }
            if (resp instanceof Error) {
                Logger.logText('LOADING', `get img src failed, mode=${mode}, reason=${resp.message}`)
                if (resp.message === 'ERROR_NO_ORIGIN') {
                    message.value = i18n.value.noOriginalImg
                }
                return null
            }
            if (!resp.src) {
                Logger.logText('LOADING', `get img src returned empty src, mode=${mode}`)
                return null
            }
            if (resp.preciseHeightOfWidth && imgPageInfo.value.preciseHeightOfWidth !== resp.preciseHeightOfWidth) {
                storeAction.setImgPageInfoPreciseHeightOfWidth(index, resp.preciseHeightOfWidth)
            }
            return resp.src
        } catch (e) {
            Logger.logText('LOADING', `get img src threw, mode=${mode}, reason=${(e as Error)?.message || e}`)
            return null
        } finally {
            lastFetchMs = Math.round(performance.now() - fetchStartedAt)
            if (timer !== null) {
                window.clearTimeout(timer)
            }
        }
    }

    /**
     * 计划表跑完还取不到图，说明这个地址在当前浏览器里就是加载不出来
     * （Referer 被剥、隐私扩展、CSP、代理分流都可能）。
     *
     * 换通道：先用 GM 请求把图拉成 blob（自带 Referer、不受页面策略约束），
     * 再退化到缩略图。两者都只写 `displaySrc`，`src` 仍保留真实地址，
     * 这样预取/下载/换源都用真实地址，超分也会因为 displaySrc 已存在而跳过。
     */
    /**
     * 兜底通道本来是最容易挂住的地方：`fetchImageObjectUrl` 内部是 GM 请求或 `fetch`，
     * 两者都可能因为代理/防盗链一直不 settle，而这里没有超时就会把整条会话挂死。
     */
    function withTimeout<T>(task: Promise<T>, ms: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error('TIMEOUT')), ms)
            task.then(
                (value) => {
                    window.clearTimeout(timer)
                    resolve(value)
                },
                (error) => {
                    window.clearTimeout(timer)
                    reject(error)
                },
            )
        })
    }

    async function tryDegradedSources(sid: number, triedSrc: string | null, allowBlobChannel: boolean): Promise<boolean> {
        // 页面已经不可见了就别再发请求：兜底通道最贵（要下一次整图）
        if (!isActive()) {
            pausedByVisibility = true
            return false
        }
        // 最后一次尝试是用户点名的原图时不再走 blob 通道：那等于把原图再下一次，
        // e-hentai 会重复扣 GP。缩略图是免费的，仍然可以退。
        if (triedSrc && allowBlobChannel) {
            try {
                markAttemptStart()
                const blobUrl = await withTimeout(fetchImageObjectUrl(triedSrc), DEGRADED_FETCH_TIMEOUT_MS)
                if (sid !== sessionId) {
                    URL.revokeObjectURL(blobUrl)
                    return false
                }
                ownBlobUrls.add(blobUrl)
                Logger.logText('LOADING', 'img tag failed, retrying through GM blob channel')
                if (await presentDisplaySrc(blobUrl)) {
                    return true
                }
                releaseDisplaySrc()
            } catch (e) {
                failReason = describeFetchError(e)
                Logger.logText('LOADING', `blob channel failed: ${failReason}`)
            }
        }

        if (pausedByVisibility) {
            return false
        }

        const thumb = store.thumbInfos[index]?.src
        if (thumb && thumb !== triedSrc) {
            Logger.logText('LOADING', 'falling back to thumbnail')
            if (await presentDisplaySrc(thumb)) {
                return true
            }
            releaseDisplaySrc()
            if (!failReason) {
                failReason = 'thumbnail failed'
            }
        }
        return false
    }

    async function presentDisplaySrc(src: string): Promise<boolean> {
        storeAction.setImgPageInfoDisplaySrc(index, src)
        curLoadStatus.value = ImgLoadStatus.Loading
        // 兜底通道同样要过比例关（在 waitImageSettled 的判定入口里做）：blob 拉的是
        // 同一个（可能就已经是错的）地址，缩略图万一指向别的页也是同一个症状
        return await waitImageSettled()
    }

    /**
     * 图装上来后按宽高比复核一次。
     *
     * 平台给的地址偶尔会指向别的东西：e-hentai 的多页拼版预览图（mpv）是把前后几页
     * 横向拼成一张长条 JPEG，宽高比能和单页差十几倍，显示出来就是「长图被压扁」。
     * 这种图能 load 成功、naturalWidth 也非 0，光看事件根本发现不了，只能拿比例对。
     *
     * 阈值 3 倍足够宽松：只拦明显不是同一张的情况，尺寸信息略不准的正常页不会误杀。
     */
    function looksLikeWrongImage(img: HTMLImageElement): boolean {
        const expected = imgPageInfo.value?.preciseHeightOfWidth
        if (!expected || !img.naturalWidth) {
            return false
        }
        const actual = img.naturalHeight / img.naturalWidth
        const ratio = actual / expected
        return ratio > MAX_ASPECT_DEVIATION || ratio < 1 / MAX_ASPECT_DEVIATION
    }

    /**
     * 唯一的成败判定入口（事件路径、看门狗路径、兜底通道都走这里）：
     * 先看图和事件层面成不成功，再复核「这张到底是不是这一页的图」。
     *
     * 判成取错图时顺手把坏地址清掉，两个地方都要清：
     * - 平台缓存：eh 的默认模式命中缓存就直接返回老地址、不再请求页面，
     *   不清就永远重试回同一张拼版图；
     * - store：不清的话那张压扁的长图会一直挂在页面上。
     * 清完下次取址会重新拉图片页——相当于自动替用户刷新了一次。
     */
    function acceptsCurrentImage(rawOk: boolean): boolean {
        if (!rawOk) {
            return false
        }
        const img = getImgElement()
        if (!img || !looksLikeWrongImage(img)) {
            return true
        }
        const expected = imgPageInfo.value?.preciseHeightOfWidth
        const actual = img.naturalHeight / img.naturalWidth
        Logger.logText('LOADING', `wrong image: aspect ${actual.toFixed(3)} vs expected ${expected}, discard and refetch`)
        albumService.invalidateImgSrc?.(index)
        storeAction.setImgPageInfoSrc(index, '')
        return false
    }

    function describeFetchError(e: unknown): string {
        const msg = e instanceof Error ? e.message : String(e)
        const http = msg.match(/HTTP_(\d{3})/)
        if (http) {
            return `HTTP ${http[1]}`
        }
        if (/TIMEOUT/i.test(msg)) {
            return 'timeout'
        }
        if (/NOT_AVAILABLE/.test(msg)) {
            return 'GM request unavailable'
        }
        if (/GM_XHR_ERROR|ABORT/.test(msg)) {
            return 'network error'
        }
        return 'fetch failed'
    }

    /** 会话主循环：取址 → 挂到 <img> → 等结果 → 失败则下一个源 */
    async function runSession(sid: number) {
        /**
         * 有的平台几种模式其实指向同一个地址（pixiv 的 Default 和 Origin 都是 original），
         * 计划表按模式走会重复请求同一张图。这里按地址计数，同一地址最多试 2 次
         * （正好对应「隔一圈回来再试」），多了直接跳过下一个模式。
         */
        const srcAttempts = new Map<string, number>()
        let lastTriedSrc: string | null = null
        let lastTriedMode = ImgSrcMode.Default

        for (;;) {
            if (sid !== sessionId) {
                return
            }
            if (pausedByVisibility) {
                // 页面不可见时中止：状态留在加载中，等页面重新可见时重开一轮。
                // 这里如果继续跑，用户根本看不到任何东西，白烧一遍请求。
                Logger.logText('LOADING', `session paused (page invisible) after ${reloadTimes.value} attempts`)
                return
            }
            const mode = autoRetryQueue.value.shift()
            if (mode === undefined) {
                const recovered = await tryDegradedSources(sid, lastTriedSrc, lastTriedMode !== ImgSrcMode.Origin)
                if (sid !== sessionId) {
                    return
                }
                if (pausedByVisibility) {
                    Logger.logText('LOADING', 'session paused before degraded fallback (page invisible)')
                    return
                }
                isAutoRetryExhausted.value = true
                if (recovered) {
                    curLoadStatus.value = ImgLoadStatus.Loaded
                    autoRetryQueue.value = []
                    message.value = ''
                    sessionFinishedAt = Date.now()
                    Logger.logText('LOADING', `recovered by fallback channel after ${reloadTimes.value} attempts`)
                    afterImageLoaded()
                    publishPageState()
                    return
                }
                curLoadStatus.value = ImgLoadStatus.Error
                message.value = failReason
                    ? `${i18n.value.loadingImgFailed} · ${failReason}`
                    : (message.value || i18n.value.loadingImgFailed)
                sessionFinishedAt = Date.now()
                Logger.logText('LOADING', `retry failed after ${reloadTimes.value} attempts, reason=${failReason || 'unknown'}`)
                scheduleAutoRetry()
                publishPageState()
                return
            }

            const src = await requestImgSrc(mode)
            if (sid !== sessionId) {
                return
            }
            if (src === null) {
                continue
            }
            const tried = srcAttempts.get(src) || 0
            if (tried >= MAX_ATTEMPTS_PER_SRC) {
                Logger.logText('LOADING', `skip mode=${mode}, same src already tried ${tried} times`)
                continue
            }
            srcAttempts.set(src, tried + 1)
            lastTriedSrc = src
            lastTriedMode = mode

            reloadTimes.value++
            markAttemptStart()
            Logger.logText('LOADING', `attempt ${reloadTimes.value}, mode=${mode}`)

            const imgStartedAt = performance.now()
            await applyImgSrc(src)
            if (sid !== sessionId) {
                return
            }
            curLoadStatus.value = ImgLoadStatus.Loading
            publishPageState()

            const ok = await waitImageSettled()
            if (sid !== sessionId) {
                return
            }
            reportImgNetwork(src, imgStartedAt, ok)
            if (ok) {
                curLoadStatus.value = ImgLoadStatus.Loaded
                autoRetryQueue.value = []
                isAutoRetryExhausted.value = false
                resetAutoRetry()
                message.value = ''
                sessionFinishedAt = Date.now()
                afterImageLoaded()
                publishPageState()
                return
            }
            if (pausedByVisibility) {
                // 暂停不是失败：状态留着，页面重新可见时会重开一轮。
                // 写成 Error 的话页面会显示「加载失败」，其实只是滚走了。
                Logger.logText('LOADING', 'session paused mid-attempt (page invisible)')
                publishPageState()
                return
            }
            curLoadStatus.value = ImgLoadStatus.Error
            publishPageState()
        }
    }

    function startSession(mode: ImgSrcMode): Promise<void> {
        const sid = ++sessionId
        // 让上一个会话的等待者立刻出队（它回来时看到 sid 变了会自动退出）
        settlePending(false)
        failReason = ''
        pausedByVisibility = false
        // 重开一轮就撤掉上一次的自动重试倒计时；autoRetryCount 不在这里归零，
        // 否则自动重试会变成无限循环。归零只发生在用户手动操作或加载成功时。
        clearAutoRetryTimer()
        autoRetryQueue.value = buildImageRetryPlan({
            autoRetryByOtherSource: store.autoRetryByOtherSource,
            supportChangeSource: albumService.isSupportImgChangeSource(),
            startMode: mode,
            rounds: RETRY_ROUNDS,
        })
        isAutoRetryExhausted.value = false
        message.value = ''
        curLoadStatus.value = ImgLoadStatus.Loading
        isSessionRunning.value = true
        sessionStartedAt = Date.now()
        sessionFinishedAt = 0
        markAttemptStart()
        clearElapsedTimer()
        elapsedTimer = window.setInterval(() => {
            if (attemptStartedAt) {
                elapsedSec.value = Math.round((Date.now() - attemptStartedAt) / 1000)
                publishPageState()
            }
        }, 1000)
        publishPageState()
        // 会话结束（无论成败）都要收掉「正在跑」标记：这个标记是页面判断
        // 「要不要重新拉一次」的唯一依据，漏清就会永久停在加载中
        return runSession(sid).finally(() => {
            if (sid !== sessionId) {
                // 已经被更新的会话接管了，别去动它的计时器和状态
                return
            }
            isSessionRunning.value = false
            clearElapsedTimer()
            elapsedSec.value = 0
            // 会话收尾之后再推一次：runSession 里那几次推送发生时
            // isSessionRunning 还是 true，直接看会显示「已加载 · 进行中」
            publishPageState()
        })
    }

    /** 首次加载（页面进入视口且还没有地址时调用） */
    async function loadImgSrc(mode: ImgSrcMode) {
        await startSession(mode)
    }

    /** 用户手动重试 / 换模式：立刻按用户选的模式重开一次会话，退避节奏也从头算 */
    async function getNewImgSrc(mode: ImgSrcMode) {
        resetAutoRetry()
        await startSession(mode)
    }

    /**
     * 清空 src 强制重发时，旧元素已经脱离 DOM，它迟到的 load/error 不该算到这一次头上，
     * 否则会把正在加载的新地址误判成成功/失败。事件没带目标时（测试/合成事件）按当前处理。
     */
    function isStaleEvent(e: Event): boolean {
        const target = e.target
        if (!(target instanceof HTMLImageElement)) {
            return false
        }
        const img = getImgElement()
        return !!img && target !== img
    }

    function failLoad(e: Event) {
        e.preventDefault()
        if (isStaleEvent(e)) {
            return
        }
        curLoadStatus.value = ImgLoadStatus.Error
        Logger.logText('LOADING', 'loading image failed')
        // 有会话在等这次结果就交给它继续；没有则什么都不做（不会自己重启，避免再次死循环）
        settlePending(false)
        publishPageState()
    }

    function loaded(e?: Event) {
        if (e && isStaleEvent(e)) {
            return
        }
        const hasWaiter = pendingSettle !== null
        if (!settlePending(true)) {
            // 这张不是这一页的图（比例对不上），不能算加载成功，交回会话继续换源
            curLoadStatus.value = ImgLoadStatus.Error
            return
        }
        if (hasWaiter) {
            // 会话会接着写成功状态并触发超分，这里别重复做一遍
            return
        }
        curLoadStatus.value = ImgLoadStatus.Loaded
        autoRetryQueue.value = []
        isAutoRetryExhausted.value = false
        resetAutoRetry()
        sessionFinishedAt = Date.now()
        afterImageLoaded()
        publishPageState()
    }

    function afterImageLoaded() {
        if (imgPageInfo.value.src) {
            void warmMagnifierSource(imgPageInfo.value.displaySrc || imgPageInfo.value.src)
        }
        void upgradeBySuperResolution()
    }

    /**
     * 超分排队优先级：按阅读方向排，后面的页先算。
     * 当前页 0、后面第 k 页 k×10、前面第 1 页 100、窗口外不排队（见 renderQueue）。
     */
    function superResPriorityOf(pageIndex: number): number {
        return superResPriority(pageIndex, store.curViewIndex)
    }

    /**
     * 超分：先把原图正常显示出来，再在后台算超分版本，算完替换 displaySrc。
     * 不阻塞首屏，也不改 `src`（原图地址要留给预取/换源/下载用）。
     */
    async function upgradeBySuperResolution() {
        if (!store.superResEnabled) {
            return
        }
        const originalSrc = imgPageInfo.value.src
        if (!originalSrc) {
            return
        }
        if (lastLoadMode.value === ImgSrcMode.Origin) {
            // 这页拿的是原图，已经花过一次 GP；超分要再用 GM 下一次（不走浏览器缓存），
            // 等于再扣一次，不值当
            return
        }
        if (imgPageInfo.value.displaySrc) {
            // displaySrc 生效后会再次触发 load，这里直接结束，避免自激
            return
        }
        // 不在阅读方向上的页不排队：用户已经翻过去了，真翻回来时会由页面可见性补一次
        if (!isInSuperResWindow(index, store.curViewIndex)) {
            return
        }
        const upgraded = await superResolutionService.resolve(originalSrc, superResPriorityOf(index))
        // 这段时间里可能已经换页/换源/关掉超分，过期结果直接丢
        if (imgPageInfo.value.src !== originalSrc || !store.superResEnabled) {
            return
        }
        if (upgraded && upgraded !== originalSrc) {
            storeAction.setImgPageInfoDisplaySrc(index, upgraded)
            publishPageState()
        }
        prefetchNeighborPages(originalSrc)
    }

    /** 当前页算完后预取前后各一页（后一页优先），翻过去时直接命中缓存 */
    function prefetchNeighborPages(currentSrc: string) {
        for (const offset of [-1, 1]) {
            const neighbor = store.imgPageInfos[index + offset]
            if (!neighbor || !neighbor.src || neighbor.src === currentSrc || neighbor.displaySrc) {
                continue
            }
            if (!isInSuperResWindow(index + offset, store.curViewIndex)) {
                continue
            }
            superResolutionService.prefetch(neighbor.src, superResPriorityOf(index + offset))
        }
    }

    onUnmounted(() => {
        // 组件没了就别再等事件了，否则看门狗会一直空转
        sessionId++
        settlePending(false)
        clearElapsedTimer()
        clearAutoRetryTimer()
        for (const url of ownBlobUrls) {
            URL.revokeObjectURL(url)
        }
        ownBlobUrls.clear()
    })

    return {
        curLoadStatus,
        loadingInfo,
        isSessionRunning,
        loadImgSrc,
        getNewImgSrc,
        failLoad,
        loaded,
        resetAutoRetry,
        upgradeBySuperResolution,
    }
}
