/**
 * 移动端「文档滚动」模式开关。
 *
 * 背景：移动浏览器只把「下滑收起地址栏 / 点状态栏回顶 / 前后退恢复滚动位置」
 * 这些原生能力交给唯一的根滚动器（document.scrollingElement）。阅读器默认是
 * position:fixed 的全屏层，滚动发生在内部 .scroll-view，根滚动器一动不动，
 * 于是地址栏永远不收。
 *
 * 试过「让 body 可滚 + 把内部 scrollTop 同步到 window.scrollTo」——无效。
 * 浏览器只认用户手势直接驱动的根滚动，程序滚动不算数。所以要真正解决，
 * 必须把阅读器放回文档流，让手势作用在根滚动器上。
 *
 * 这里只负责给 html 加/去 .ehunter-doc-scroll（布局覆盖在 core/style/_doc-scroll.scss），
 * 并保存/恢复被改动的内联样式。只在触屏设备启用，桌面完全走原路径。
 */

import { ref } from 'vue'

interface SavedInlineStyle {
    element: HTMLElement
    overflow: string
    height: string
}

const DOC_SCROLL_CLASS = 'ehunter-doc-scroll'

let saved: SavedInlineStyle[] = []
let savedScrollY = 0

/**
 * 必须是响应式的：ReaderView / AlbumScrollView 在 enableDocumentScroll() 之前
 * 就已经创建好了，组件直接读一个布尔值会拿到 false，之后不会再更新。
 */
export const documentScrollActive = ref(false)

export const isCoarsePointer = (): boolean => {
    if (typeof window.matchMedia !== 'function') {
        return false
    }
    return window.matchMedia('(pointer: coarse)').matches
}

/** 当前是否处于文档滚动模式（组件用它决定滚动坐标怎么算） */
export function isDocumentScrollActive(): boolean {
    return documentScrollActive.value
}

/** 返回是否真的启用（非触屏设备返回 false，调用方按原逻辑处理 body.overflow） */
export function enableDocumentScroll(): boolean {
    if (documentScrollActive.value) {
        return true
    }
    if (!isCoarsePointer()) {
        return false
    }
    documentScrollActive.value = true
    savedScrollY = window.scrollY

    const html = document.documentElement
    const body = document.body
    saved = [
        { element: html, overflow: html.style.overflow, height: html.style.height },
        { element: body, overflow: body.style.overflow, height: body.style.height },
    ]
    // 根节点不能再有 overflow:hidden / 固定高度，否则根滚动器又被降级
    html.style.overflow = ''
    html.style.height = ''
    body.style.overflow = ''
    body.style.height = ''

    document.documentElement.classList.add(DOC_SCROLL_CLASS)
    // 打开时从顶部开始，避免继承宿主页面的滚动位置
    window.scrollTo(0, 0)
    return true
}

export function disableDocumentScroll(): void {
    if (!documentScrollActive.value) {
        return
    }
    documentScrollActive.value = false
    document.documentElement.classList.remove(DOC_SCROLL_CLASS)
    for (const item of saved) {
        item.element.style.overflow = item.overflow
        item.element.style.height = item.height
    }
    saved = []
    // 还给宿主页面它原来的滚动位置
    window.scrollTo(0, savedScrollY)
}
