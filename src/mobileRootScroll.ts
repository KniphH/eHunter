/**
 * 移动端的「根滚动伴生」。
 *
 * 移动浏览器只给**唯一的根滚动容器**（document.scrollingElement）那些原生特权：
 * 向下滚动时收起底部地址栏、点状态栏回到顶部、前进后退恢复滚动位置。
 *
 * 阅读器是 `position: fixed; height: 100%` 的全屏层，滚动发生在内部的 `.scroll-view`
 * 里，根滚动器一动不动。视觉上内容在滚，但浏览器内核认为"页面没有滚动"，于是底部
 * 地址栏永远不收起来——这正是手机上用了插件就进不了全屏的原因。
 *
 * 这里不重构整个滚动架构（那会波及当前页判定、滚动定位、书页模式），而是给根滚动器
 * 留出可滚空间，再把内部滚动同步过去：浏览器重新认为页面在滚，地址栏就会收起。
 * 只在粗指针（触屏）设备启用，桌面完全不受影响。
 */

interface SavedInlineStyle {
    element: HTMLElement
    overflow: string
    minHeight: string
    height: string
}

let saved: SavedInlineStyle[] = []
let active = false
let rafId = 0
let pendingTop = 0
/** 打开阅读器前的根滚动位置：关闭时恢复，别把宿主页面停在半路 */
let savedScrollY = 0

const isCoarsePointer = (): boolean => {
    if (typeof window.matchMedia !== 'function') {
        return false
    }
    return window.matchMedia('(pointer: coarse)').matches
}

/** 内部滚动容器用的类名（AwesomeScrollView 渲染出来的那个 div） */
const SCROLL_VIEW_CLASS = 'scroll-view'

function capture(element: HTMLElement): void {
    saved.push({
        element,
        overflow: element.style.overflow,
        minHeight: element.style.minHeight,
        height: element.style.height,
    })
}

/** 返回是否真的启用了（非触屏设备返回 false，调用方仍走原来的 overflow:hidden） */
export function enableRootScrollCompanion(): boolean {
    if (active) {
        return true
    }
    if (!isCoarsePointer()) {
        return false
    }
    active = true
    savedScrollY = window.scrollY

    const html = document.documentElement
    const body = document.body
    capture(html)
    capture(body)

    // 关键：不能让 overflow:hidden 把根滚动器降级成普通容器
    html.style.overflow = ''
    body.style.overflow = ''
    // 给根滚动器留出可滚空间。高度取两屏：足够滚过地址栏那几十像素，
    // 又不会让宿主页面被撑得过分离谱。
    body.style.minHeight = `${Math.round(window.innerHeight * 2)}px`
    return true
}

export function disableRootScrollCompanion(): void {
    if (!active) {
        return
    }
    active = false
    if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
    }
    for (const item of saved) {
        item.element.style.overflow = item.overflow
        item.element.style.minHeight = item.minHeight
        item.element.style.height = item.height
    }
    saved = []
    // 关掉阅读器后把根滚动位置还原到打开前，别让宿主页面停在半路
    window.scrollTo(0, savedScrollY)
}

function flushRootScroll(): void {
    rafId = 0
    const max = document.documentElement.scrollHeight - window.innerHeight
    if (max <= 0) {
        return
    }
    const target = Math.min(pendingTop, max)
    if (Math.abs(window.scrollY - target) < 2) {
        return
    }
    window.scrollTo(0, target)
}

/**
 * 把内部滚动位置映射到根滚动器。
 * 用 rAF 合并：滚动事件可能一帧触发多次，没必要每次都调 scrollTo。
 */
export function syncRootScroll(internalTop: number): void {
    if (!active) {
        return
    }
    pendingTop = internalTop
    if (rafId) {
        return
    }
    rafId = requestAnimationFrame(flushRootScroll)
}

/**
 * scroll 事件不冒泡，用捕获阶段在 document 上收。
 * 只在阅读器打开且是移动端时处理，其余情况一次判断就返回。
 */
export function installRootScrollBridge(): void {
    document.addEventListener(
        'scroll',
        (event) => {
            if (!active) {
                return
            }
            const target = event.target
            if (!(target instanceof HTMLElement)) {
                return
            }
            if (!target.classList.contains(SCROLL_VIEW_CLASS)) {
                return
            }
            syncRootScroll(target.scrollTop)
        },
        true,
    )
}
