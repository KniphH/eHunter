<template>
<div
    class="reader-view"
    :class="{
        'pointer-mode': pointerMode,
        'hover-top': hoverTop,
        'hover-bottom': hoverBottom,
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
                <TopBar class="top-bar" @closeEHunter="closeReader"/>
                <transition name="slow-horizontal-fade">
                    <AlbumScrollView class="content scroll-mode" v-if="store.readingMode === 0" />
                </transition>
                <transition name="slow-vertical-fade">
                    <AlbumBookView class="content book-mode" v-if="store.readingMode === 1" />
                </transition>
            </div>
        </template>
    </DockWorkspace>
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
const pointerMode = ref(false)
const hoverTop = ref(false)
const hoverBottom = ref(false)

function handlePointerMove(e: PointerEvent): void {
    if (!pointerMode.value) {
        return
    }
    const w = window.innerWidth
    const h = window.innerHeight
    // 顶栏热区：整个顶边；右下热区：全屏按钮 + 页码那块
    hoverTop.value = e.clientY <= 96
    hoverBottom.value = e.clientX >= w - 220 && e.clientY >= h - 130
}

function handlePointerLeave(): void {
    hoverTop.value = false
    hoverBottom.value = false
}

onMounted(() => {
    pointerMode.value = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.addEventListener('pointerleave', handlePointerLeave)
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
    /*
     * 沉浸模式：鼠标不在热区时收起顶栏和右下状态条。
     * 只在 pointer-mode（有精确指针的桌面环境）下生效，触屏保持常显。
     * 隐藏时同时关掉 pointer-events，避免看不见的按钮挡住翻页点击。
     */
    &.pointer-mode {
        :deep(.top-bar),
        > .status-pannel {
            transition: opacity 0.22s ease, transform 0.22s ease;
        }

        &:not(.hover-top) :deep(.top-bar) {
            opacity: 0 !important;
            transform: translateY(-10px);
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
    &.pointer-mode {
        :deep(.top-bar),
        > .status-pannel {
            transition: opacity 0.22s ease, transform 0.22s ease;
        }

        &:not(.hover-top) :deep(.top-bar) {
            opacity: 0 !important;
            transform: translateY(-10px);
            pointer-events: none !important;
        }

        &:not(.hover-bottom) > .status-pannel {
            opacity: 0 !important;
            transform: translateY(10px);
            pointer-events: none !important;
        }
    }

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

        > .top-bar {
            /*
             * 必须 absolute，而且需要 !important。
             * TopBar 组件自己的根样式写了 position: relative，会把这条盖掉——
             * 结果是顶栏在正常流里占掉一条高度，图片被顶下去一段；
             * 收到隐藏后那一块空白仍然留着，看起来像「图片没有往上顶」。
             * 改成 absolute 后顶栏浮在图片之上，收起时只淡出、不影响布局。
             */
            position: absolute !important;
            z-index: 10000;
            left: 0;
            top: 0;
            width: 100%;
        }

        > .content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
        }
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
