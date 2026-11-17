<template>
    <div ref="asv" :class="['awesome-scroll-view', 'scrollbar', `axis-${axis}`, { isHidden: isHidden }]">
        <slot></slot>
    </div>
</template>

<script setup lang="ts">
// awesome scroll view for chrome(-webkit)
import BezierEasing from '../../utils/bezier-easing.js'
import { ref, onMounted, onUnmounted } from 'vue'

const emit = defineEmits(['topIn', 'topLeave'])

const props = withDefaults(defineProps<{
    color?: string,
    isHidden?: boolean,
    offsetInterval?: number,
    onScrollStopped?: (pos: number) => void,
    listenScroll?: boolean,
    axis?: 'x' | 'y',
    /**
     * 滚动交给文档（window）而不是这个 div。
     * 移动浏览器只给根滚动器地址栏收起这类原生能力，内滚容器没有，
     * 所以触屏设备上阅读器要改成这个模式。见 core/style/_doc-scroll.scss。
     */
    documentScroll?: boolean,
}>(), {
    color: 'rgba(0,0,0,0.4)',
    isHidden: false,
    offsetInterval: 150,
    onScrollStopped: (pos: number) => { },
    listenScroll: false,
    axis: 'y',
    documentScroll: false,
})

const asv = ref<HTMLDivElement | null>(null)

let lastPosition: number
let isScrollingV2 = false
let isAtTop = true
let scrollRAFId = 0

function updateTopState(position: number) {
    const nextIsAtTop = position <= 0
    if (nextIsAtTop === isAtTop) {
        return
    }
    isAtTop = nextIsAtTop
    if (nextIsAtTop) {
        emit('topIn')
        return
    }
    emit('topLeave')
}

function watchPosition() {
    if (!asv.value) {
        return
    }
    const position = props.axis === 'y' ? asv.value.scrollTop : asv.value.scrollLeft
    if (props.axis === 'y') {
        updateTopState(position)
    }
    if (!isScrollingV2 && position === lastPosition) {
        return
    }
    if (!isScrollingV2 && position !== lastPosition) {
        lastPosition = position
        isScrollingV2 = true
        return
    }
    if (isScrollingV2 && position !== lastPosition) {
        lastPosition = position
        return
    }
    isScrollingV2 = false
    props.onScrollStopped(position)
}

let timer: number
let documentStopTimer = 0

/** 当前滚动位置（统一内部滚动与文档滚动两种来源） */
function currentPosition(): number {
    if (!asv.value) {
        return 0
    }
    if (props.documentScroll) {
        // 这个 div 在文档流里的绝对顶部；window.scrollY 减去它就是"滚到本容器内的距离"
        const top = asv.value.getBoundingClientRect().top + window.scrollY
        return Math.max(0, Math.round(window.scrollY - top))
    }
    return props.axis === 'y' ? asv.value.scrollTop : asv.value.scrollLeft
}

function onDocumentScroll(): void {
    if (!asv.value) {
        return
    }
    if (props.axis === 'y') {
        updateTopState(currentPosition())
    }
    // scroll 事件比 50ms 轮询灵敏得多，用静止 150ms 作为"滚动停止"判据
    if (documentStopTimer) {
        window.clearTimeout(documentStopTimer)
    }
    documentStopTimer = window.setTimeout(() => {
        documentStopTimer = 0
        props.onScrollStopped(currentPosition())
    }, 150)
}

onMounted(() => {
    if (!asv.value || !props.listenScroll) {
        return
    }
    if (props.documentScroll) {
        lastPosition = currentPosition()
        isAtTop = lastPosition <= 0
        if (isAtTop) {
            emit('topIn')
        }
        window.addEventListener('scroll', onDocumentScroll, { passive: true })
        return
    }
    lastPosition = props.axis === 'y' ? asv.value.scrollTop : asv.value.scrollLeft
    if (props.axis === 'y') {
        isAtTop = lastPosition <= 0
        if (isAtTop) {
            emit('topIn')
        }
    }
    timer = window.setInterval(watchPosition, 50)
})

onUnmounted(() => {
    if (scrollRAFId) {
        window.cancelAnimationFrame(scrollRAFId)
        scrollRAFId = 0
    }
    if (timer) {
        clearInterval(timer)
    }
    if (documentStopTimer) {
        window.clearTimeout(documentStopTimer)
        documentStopTimer = 0
    }
    window.removeEventListener('scroll', onDocumentScroll)
})

function scrollTo(offset: number, duration: number, axis: 'y' | 'x' = 'y') {
    const effectiveAxis = axis || props.axis
    if (!asv.value) {
        return
    }
    if (scrollRAFId) {
        window.cancelAnimationFrame(scrollRAFId)
        scrollRAFId = 0
    }
    if (props.documentScroll) {
        // 文档模式下 offset 直接是「文档绝对 Y」：内部滚动用的是
        // 「相对本容器的距离」，两套坐标不能混用，调用方按模式分别换算。
        const target = Math.max(0, offset)
        if (duration <= 0) {
            window.scrollTo(0, target)
            return
        }
        const startValue = window.scrollY
        const diff = target - startValue
        if (Math.abs(diff) < 0.5) {
            return
        }
        let start = 0
        const easing = BezierEasing(0.61, 0.29, 0.3, 0.97)
        scrollRAFId = window.requestAnimationFrame(function step(timestamp) {
            if (!start) start = timestamp
            const time = timestamp - start
            const percent = Math.min(time / duration, 1)
            window.scrollTo(0, startValue + diff * easing(percent))
            if (time < duration) {
                scrollRAFId = window.requestAnimationFrame(step)
                return
            }
            scrollRAFId = 0
        })
        return
    }
    if (duration <= 0) {
        if (effectiveAxis === 'y') {
            asv.value.scrollTop = offset
        } else {
            asv.value.scrollLeft = offset
        }
        return
    }
    const startValue = effectiveAxis === 'y' ? asv.value.scrollTop : asv.value.scrollLeft
    const diff = offset - startValue
    if (Math.abs(diff) < 0.5) {
        return
    }
    let start = 0
    const easing = BezierEasing(0.61, 0.29, 0.3, 0.97)
    scrollRAFId = window.requestAnimationFrame(function step(timestamp) {
        if (!asv.value) {
            scrollRAFId = 0
            return
        }
        if (!start) start = timestamp
        const time = timestamp - start
        const percent = Math.min(time / duration, 1)
        const next = startValue + diff * easing(percent)
        if (effectiveAxis === 'y') {
            asv.value.scrollTop = next
        } else {
            asv.value.scrollLeft = next
        }
        if (time < duration) {
            scrollRAFId = window.requestAnimationFrame(step)
            return
        }
        scrollRAFId = 0
    })
}

defineExpose({
    scrollTo
})
</script>

<style lang="scss" scoped>
.awesome-scroll-view {
    position: relative;
    overflow-y: overlay;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;

    &.axis-x {
        overflow-y: hidden;
        overflow-x: overlay;
        flex-direction: row;
    }

    &.scrollbar {
        transition: all 0.3s ease;

        &::-webkit-scrollbar {
            width: 8px;
            height: 8px;
            background: transparent;
        }

        &::-webkit-scrollbar-track {
            background: transparent;
        }

        &::-webkit-scrollbar-thumb {
            border-radius: 999px;
            border: 2px solid transparent;
            background-clip: padding-box;
            background-color: rgba(255, 255, 255, 0);
            transition: background-color 0.2s ease;
        }

        &:hover::-webkit-scrollbar-thumb {
            background-color: rgba(255, 255, 255, 0.46);
        }
    }

    &.axis-y {
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0) transparent;
    }

    &.axis-y:hover {
        scrollbar-color: rgba(255, 255, 255, 0.46) transparent;
    }

    &.axis-x {
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0) transparent;
    }

    &.axis-x:hover {
        scrollbar-color: rgba(255, 255, 255, 0.46) transparent;
    }
}
</style>
