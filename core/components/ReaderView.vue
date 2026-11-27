<template>
<div
    class="reader-view"
    :class="{
        'pointer-mode': pointerMode,
        'hover-top': hoverTop,
        'hover-bottom': hoverBottom,
        'hover-thumb': hoverThumb,
    }">
    <DockWorkspace
        ref="dockWorkspaceRef"
        :thumb-slot="store.thumbDockSlot"
        :thumb-size-px="store.thumbDockSlot === 'bottom' ? store.thumbViewHeight : store.thumbViewWidth"
        :show-thumb="showThumb"
        :long-press-ms="500"
        @request-dock="(slot) => storeAction.setThumbDockSlot(slot)"
        @request-resize="(size) => storeAction.setThumbPanelSize(size)">
        <template #thumb>
            <ThumbScrollView @dock-drag-start="onThumbDockDragStart" @open-thumb-expand="onOpenThumbExpand" />
        </template>
        <template #main>
            <div class="main-content">
                <transition name="slow-horizontal-fade">
                    <AlbumScrollView class="content scroll-mode" v-if="store.readingMode === 0" />
                </transition>
                <transition name="slow-vertical-fade">
                    <AlbumBookView class="content book-mode" v-if="store.readingMode === 1" />
                </transition>
            </div>
        </template>
    </DockWorkspace>
    <!-- 顶栏放在 DockWorkspace 外面：它原先在 .main-content 里，
         即便设了 absolute 也会受那个容器的 flex 布局影响，实测仍会把图片顶下去 -->
    <TopBar class="top-bar" @closeEHunter="closeReader"/>
    <div v-if="topBarProbe" class="topbar-probe">{{ topBarProbe }}</div>
    <div v-if="topBarProbe" class="topbar-probe">{{ topBarProbe }}</div>
    <div class="status-pannel">
        <button
            class="full-screen"
            :aria-label="i18n.fullScreen"
            @click="toggleFullscreen"
            type="button">
            <FullScreenIcon />
        </button>
        <div class="progress">{{ `${store.curViewIndex + 1} / ${store.pageCount}` }}</div>
    </div>
    <ThumbExpandDialog @select-page="onThumbExpandSelectPage" />
    <InstructionDialog />
</div>
</template>

<script lang="ts" setup>
import AlbumScrollView from './AlbumScrollView.vue';
import ThumbScrollView from './ThumbScrollView.vue';
import TopBar from './TopBar.vue';
import AlbumBookView from './AlbumBookView.vue';
import ThumbExpandDialog from './dialog/ThumbExpandDialog.vue'
import InstructionDialog from './dialog/InstructionDialog.vue'
import DockWorkspace from './layout/DockWorkspace.vue'
import FullScreenIcon from '../assets/svg/full_screen.svg?component'
import { i18n } from '../store/i18n'
import { store, storeAction } from '../store/app'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { GestureStartPayload } from '../utils/layoutGesture'

type FullscreenTarget = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void
    webkitRequestFullScreen?: () => Promise<void> | void
    mozRequestFullScreen?: () => Promise<void> | void
}

const isFullscreen = ref(false)
const dockWorkspaceRef = ref<null | { startDockDrag: (payload: GestureStartPayload) => void }>(null)
const showThumb = computed(() => {
    // 没有缩略图数据就别展开侧栏：它一旦展开就固定占 thumbSizePx，
    // 空白栏会把漫画整体推向右（joyacg 就是这样偏右的）。
    if (!store.thumbInfos.length) {
        return false
    }
    if (store.readingMode === 0) {
        return store.showThumbView
    }
    return store.showBookThumbView
})

function syncFullscreenState() {
    const doc = document as Document & {
        webkitFullscreenElement?: Element | null
        mozFullScreenElement?: Element | null
    }
    isFullscreen.value = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement)
}

function closeReader() {
    const win = window as Window & {
        __EHUNTER_UI__?: { close: () => void }
    }

    if (win.__EHUNTER_UI__) {
        win.__EHUNTER_UI__.close()
        return
    }

    const container = document.querySelector('#ehunter-app .ehunter-container') as HTMLElement | null
    if (container) {
        container.style.top = '-100%'
        document.body.style.overflow = ''
    }
}

function toggleFullscreen() {
    const doc = document as Document & {
        webkitExitFullscreen?: () => Promise<void> | void
        mozCancelFullScreen?: () => Promise<void> | void
        webkitFullscreenElement?: Element | null
        mozFullScreenElement?: Element | null
    }
    const isFullScreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement)

    if (isFullScreen) {
        if (doc.exitFullscreen) {
            doc.exitFullscreen()
            return
        }
        if (doc.webkitExitFullscreen) {
            doc.webkitExitFullscreen()
            return
        }
        if (doc.mozCancelFullScreen) {
            doc.mozCancelFullScreen()
        }
        return
    }

    const elem = document.querySelector('.ehunter-container') as FullscreenTarget | null
    const target: FullscreenTarget = elem || (document.documentElement as FullscreenTarget)

    if (target.requestFullscreen) {
        target.requestFullscreen()
        return
    }
    if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen()
        return
    }
    if (target.webkitRequestFullScreen) {
        target.webkitRequestFullScreen()
        return
    }
    if (target.mozRequestFullScreen) {
        target.mozRequestFullScreen()
    }
}

function onThumbDockDragStart(payload: GestureStartPayload) {
    dockWorkspaceRef.value?.startDockDrag(payload)
}

function onOpenThumbExpand() {
    storeAction.openThumbExpandDialog()
}

function onThumbExpandSelectPage(pageNumber: number) {
    storeAction.closeThumbExpandDialog()
    storeAction.setCurViewIndex(pageNumber - 1, 'thumb-expand')
}

/*
 * 沉浸模式：鼠标靠近右上角 / 右下角才浮出对应按钮，移开就收起。
 *
 * 只在「有精确指针」的设备上启用（桌面鼠标）。触屏没有 hover 概念，
 * 强制开启会导致按钮永远看不见，所以 pointerMode 为 false 时保持常显、行为不变。
 */
const topBarProbe = ref('')

/*
 * 临时诊断：把顶栏和内容区的实际计算样式摊到屏幕上。
 * 「顶栏顶掉图片」改了几轮都没解决，靠猜没用，直接读真实值。
 */
function sampleLayout(): void {
    const bar = document.querySelector('.reader-view > .top-bar') as HTMLElement | null
    const content = document.querySelector('.reader-view .content') as HTMLElement | null
    if (!bar) {
        topBarProbe.value = 'probe: top-bar 未挂载'
        return
    }
    const cs = getComputedStyle(bar)
    const contentTop = content ? Math.round(content.getBoundingClientRect().top) : -1
    topBarProbe.value = `bar pos=${cs.position} h=${bar.offsetHeight} top=${cs.top}`
        + ` rect=${Math.round(bar.getBoundingClientRect().top)} content=${contentTop}`
}

const pointerMode = ref(false)
const hoverTop = ref(false)
const hoverBottom = ref(false)
const hoverThumb = ref(false)

function handlePointerMove(e: PointerEvent): void {
    if (!pointerMode.value) {
        return
    }
    const w = window.innerWidth
    const h = window.innerHeight
    // 顶栏热区：整个顶边；右下热区：全屏按钮 + 页码那块
    hoverTop.value = e.clientY <= 96
    hoverBottom.value = e.clientX >= w - 220 && e.clientY >= h - 130
    // 页目录（缩略图栏）在底部，热区给宽一点：整条底边都算
    hoverThumb.value = e.clientY >= h - 150
}

function handlePointerLeave(): void {
    hoverTop.value = false
    hoverBottom.value = false
    hoverThumb.value = false
}

onMounted(() => {
    /*
     * 只有「明确是触摸设备」才关闭沉浸模式。
     * 之前用 (hover: hover) and (pointer: fine) 反向判断，条件过严：
     * 某些桌面环境（外接触控板、远程桌面、混合设备）不满足就会一直是 false，
     * 结果按钮永远不隐藏，看起来像「这个功能没做」。
     */
    pointerMode.value = !window.matchMedia('(hover: none) and (pointer: coarse)').matches
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.addEventListener('pointerleave', handlePointerLeave)
    setTimeout(sampleLayout, 1200)
    setTimeout(sampleLayout, 3000)
    setTimeout(sampleLayout, 1200)
    setTimeout(sampleLayout, 3000)
    syncFullscreenState()
    document.addEventListener('fullscreenchange', syncFullscreenState)
    document.addEventListener('webkitfullscreenchange', syncFullscreenState as EventListener)
    document.addEventListener('mozfullscreenchange', syncFullscreenState as EventListener)
})

onUnmounted(() => {
    window.removeEventListener('pointermove', handlePointerMove)
    document.removeEventListener('pointerleave', handlePointerLeave)
    document.removeEventListener('fullscreenchange', syncFullscreenState)
    document.removeEventListener('webkitfullscreenchange', syncFullscreenState as EventListener)
    document.removeEventListener('mozfullscreenchange', syncFullscreenState as EventListener)
})
</script>

<style lang="scss" scoped>
@import '../style/_responsive';
@import '../style/_variables';

div {
    display: flex;
}

.reader-view {
    position: relative;

    /*
     * 沉浸模式：鼠标不在热区时收起顶栏和右下状态条。
     * 只在 pointer-mode（有精确指针的桌面环境）下生效，触屏保持常显。
     * 隐藏时同时关掉 pointer-events，避免看不见的按钮挡住翻页点击。
     */
    &.pointer-mode {
        :deep(.top-bar),
        :deep(.thumb-panel.bottom),
        :deep(.bottom-pagination),
        > .status-pannel {
            transition: opacity 0.22s ease, transform 0.22s ease;
        }

        &:not(.hover-top) :deep(.top-bar) {
            opacity: 0 !important;
            transform: translateY(-10px);
            pointer-events: none !important;
        }

        /* 底部页码条与页目录一致：靠近底边才浮出 */
        &:not(.hover-thumb) :deep(.bottom-pagination) {
            opacity: 0 !important;
            pointer-events: none !important;
        }

        /* 页目录（底部缩略图栏）同样只在靠近底边时浮出 */
        &:not(.hover-thumb) :deep(.thumb-panel.bottom) {
            opacity: 0 !important;
            transform: translateY(100%);
            pointer-events: none !important;
        }

        &:not(.hover-bottom) > .status-pannel {
            opacity: 0 !important;
            transform: translateY(10px);
            pointer-events: none !important;
        }
    }

    /*
     * 沉浸模式：鼠标不在热区时收起顶栏和右下状态条。
     * 只在 pointer-mode（有精确指针的桌面环境）下生效，触屏保持常显。
     * 隐藏时同时关掉 pointer-events，避免看不见的按钮挡住翻页点击。
     */
    position: relative;
    flex-direction: row;
    align-items: center;
    height: 100%;
    width: 100%;

    :deep(.main-content) {
        height: 100%;
        width: 100%;
        flex-grow: 1;
        position: relative;
        display: flex;
        flex-direction: column;



        > .content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
        }
    }
    /*
     * 顶栏现在是 .reader-view 的直接子级，绝对定位，浮在内容之上。
     * TopBar 自己根样式是 position: relative，在绝对定位父级内部不影响外部布局。
     */
    > .topbar-probe {
        position: fixed;
        left: 8px;
        bottom: 8px;
        z-index: 99999;
        background: rgba(0, 0, 0, 0.75);
        color: #7ef;
        font: 11px/1.4 monospace;
        padding: 3px 6px;
        border-radius: 3px;
        pointer-events: none;
    }

    > .topbar-probe {
        position: fixed;
        left: 8px;
        bottom: 8px;
        z-index: 99999;
        background: rgba(0, 0, 0, 0.75);
        color: #7ef;
        font: 11px/1.4 monospace;
        padding: 3px 6px;
        border-radius: 3px;
        pointer-events: none;
    }

    > .top-bar {
        position: absolute !important;
        top: 0;
        left: 0;
        width: 100%;
        z-index: 10001;
    }

    > .panel {
        display: flex;
        align-items: center;
        justify-content: center;
        position: absolute;
        bottom: 2vh;
        right: 2vh;
        z-index: 10000;
        opacity: 0.5;
        transition: all 0.2s ease;
        &:hover {
            opacity: 1;
        }
        > .location {
            color: $reader_view_location_color;
            display: inline-block;
            font-size: 16px;
            line-height: 16px;
            margin-top: 2px;
        }
        .icon-container {
            position: relative;
            display: inline-block;
        }
        > .full-screen {
            cursor: pointer;
            margin-left: 5px;
            > svg {
                fill: $reader_view_full_screen_color;
                width: 26px;
                height: 26px;
            }
        }
    }
    
    /*
     * 右下角这一条（页码 + 放大）同样会被宿主的全局样式影响：
     * 18comic / joyacg 这类 Bootstrap 站点会给 div / span 设字体、行高、
     * 甚至 background，导致黑底没了、字号不对、间距错乱。
     * 这里和全屏按钮一样，把关键属性全部钉死。
     */
    > .status-pannel {
        z-index: 10000 !important;
        position: absolute !important;
        bottom: 0 !important;
        right: 0 !important;
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        opacity: 0.5 !important;
        background-color: black !important;
        background-image: none !important;
        padding: 3px 5px !important;
        margin: 0 !important;
        gap: 3px !important;
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        width: auto !important;
        height: auto !important;
        min-width: 0 !important;
        min-height: 0 !important;
        line-height: 1 !important;
        text-align: left !important;
        overflow: visible !important;
        pointer-events: auto !important;
        > .progress {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            font-size: 11px !important;
            line-height: 11px !important;
            color: white !important;
            margin: 0 !important;
            padding: 0 !important;
            background: transparent !important;
            font-weight: normal !important;
            letter-spacing: normal !important;
            white-space: nowrap !important;
        }
        /*
         * 宿主站点会对 <button> 施加全局样式（Bootstrap 的边框/内边距/字体、
         * 以及各种 button:not(:disabled) 规则）。nh / eh 上没有这类规则所以看着正常，
         * 到了 18comic / joyacg 就会变形：按钮被撑大、图标偏移、出现多余边框。
         * 这里把可能被覆盖的属性全部显式钉死。
         */
        > .full-screen {
            display: flex !important;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            box-sizing: content-box !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 0 0 5px !important;
            min-width: 0 !important;
            min-height: 0 !important;
            width: 12px !important;
            height: 12px !important;
            font: inherit !important;
            line-height: 1 !important;
            text-transform: none !important;
            appearance: none !important;
            -webkit-appearance: none !important;
            box-shadow: none !important;
            outline: none !important;
            cursor: pointer;
            color: white;
            transition: color 0.2s ease;
            &:hover {
                color: $accent_color;
            }
            > svg {
                display: block !important;
                fill: currentColor;
                width: 12px !important;
                height: 12px !important;
            }
        }
    }
}
</style>
