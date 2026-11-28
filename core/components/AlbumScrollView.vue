<template>
    <div class="album-scroll-view">
        <div class="preload">
            <div class="preload-item" v-for="i of computedVolPreloadPageIndexList">
                <PageView :active="true" :index="i" />
            </div>
        </div>
        <!-- scroll view -->
        <awesome-scroll-view ref="scrollView" class="scroll-view" v-if="store.imgPageInfos && store.imgPageInfos.length > 0"
            :document-scroll="documentScroll"
            :on-scroll-stopped="onScrollStopped" @topIn="storeAction.setTopBar(true)" :listen-scroll="true"
            @topLeave="storeAction.setTopBar(false)">
            <h1>{{ store.albumTitle }}</h1>

            <div class="page-container" ref="pageContainers" v-for="i of renderedPageIndexList"
                :key="i"
                :style="{ 'width': `${store.widthScale}%`, 'padding-bottom': `${store.widthScale * storeAction.getImgPageHeightOfWidth(i)}%`, 'margin': `${store.scrollPageMargin}px auto` }">
                <PageView :index="i" :active="activePageIndexes.has(i)"/>
            </div>

        </awesome-scroll-view>
    </div>
</template>

<script setup lang="ts">
import AwesomeScrollView from './widget/AwesomeScrollView.vue'
import Pagination from './widget/Pagination.vue'
import PageView from './PageView.vue'
import { store, storeAction, computedVolIndex, computedVolFirstIndex, computedVolPageIndexList, computedVolumeSum, computedCurVolNo, computedVolPreloadPageIndexList } from '../store/app'
import { ref, computed, watch, inject, onMounted, nextTick, onUnmounted } from 'vue'
import { documentScrollActive } from '../../src/mobileRootScroll'

const updater = 'album_scroll_view'
const animationTime = 800
const scrollPosition = ref(0)
const scrollView: any = ref(null)
const pageContainers: any = ref(null)
/**
 * 触屏设备上滚动交给文档（根滚动器），地址栏才会收起。
 * 两套坐标要分别处理：内部滚动用 offsetTop（相对 offsetParent），
 * 文档滚动用「元素绝对 Y」。用响应式 ref：组件可能在 enable 之前就建好了。
 */
const documentScroll = documentScrollActive

function onScrollStopped(position: number) {
    scrollPosition.value = position
}

// watch scrollPosition to calculate curIndex
watch(scrollPosition, position => {
    // 视口变了就要重新决定哪些页该加载
    updateActivePageIndexes()
    void maybeSlideWindow(position)
    if (!pageContainers.value) {
        return
    }
    // sort again, because if changing volume size, it may be out-of-order
    let cons = pageContainers.value.sort((a, b) => a.offsetTop - b.offsetTop)
    if (!cons) {
        return
    }
    let index
    if (documentScroll.value) {
        // 文档滚动：用元素在文档中的绝对 Y 与视口底部比较
        if (window.scrollY > 0) {
            const viewportBottom = window.scrollY + window.innerHeight
            const reversed = cons.concat().reverse()
            const found = reversed.find((item: HTMLElement) =>
                item.getBoundingClientRect().top + window.scrollY <= viewportBottom)
            const result = found ? cons.indexOf(found) : cons.length - 1
            index = renderedPageIndexList.value[result] ?? 0
        } else {
            index = renderedPageIndexList.value[0] ?? 0
        }
    } else if (scrollPosition.value !== 0) {
        /*
         * 判据改成：哪一页盖住了屏幕中心。
         *
         * 之前用 item.offsetTop 和 scrollPosition 比大小。这两个量的坐标系不一定一致
         * （offsetTop 相对 offsetParent，scrollPosition 相对滚动容器），
         * 在手机上直接失效：判出来的当前页永远停在第二页，往下滑既不更新页码、
         * 也不会触发下一页的预加载。
         *
         * getBoundingClientRect 给的是屏幕坐标，和容器结构无关，手机和桌面都成立。
         */
        const centerY = window.innerHeight / 2
        let volIndex = -1
        for (let i = 0; i < cons.length; i++) {
            const rect = cons[i].getBoundingClientRect()
            if (rect.height <= 0) {
                continue
            }
            if (rect.top <= centerY && rect.bottom >= centerY) {
                volIndex = i
                break
            }
        }
        if (volIndex === -1) {
            // 中心正好落在页间间隙里：取离中心最近的一页
            let bestDist = Infinity
            for (let i = 0; i < cons.length; i++) {
                const rect = cons[i].getBoundingClientRect()
                if (rect.height <= 0) {
                    continue
                }
                const dist = Math.abs((rect.top + rect.bottom) / 2 - centerY)
                if (dist < bestDist) {
                    bestDist = dist
                    volIndex = i
                }
            }
        }
        if (volIndex === -1) {
            volIndex = 0
        }
        index = renderedPageIndexList.value[volIndex] ?? 0
    } else {
        index = renderedPageIndexList.value[0] ?? 0
    }
    if (index !== store.curViewIndex) {
        storeAction.setCurViewIndex(index, updater)
    }
})

async function scrollToCurIndex() {
    await nextTick()
    if (!pageContainers.value) {
        return
    }
    if (computedVolIndex.value == 0) {
        scrollView.value!.scrollTo(0, animationTime)
        return
    }
    const target = pageContainers.value[computedVolIndex.value]
    if (!target) {
        scrollView.value.scrollTo(0, animationTime)
        return
    }
    // 文档滚动要传绝对 Y；内部滚动传相对容器顶部的 offsetTop
    const offset = documentScroll.value
        ? target.getBoundingClientRect().top + window.scrollY - 100
        : target.offsetTop - 100
    scrollView.value.scrollTo(offset, animationTime)
}

onMounted(() => {
    resetVolumesAroundCurrent()
    setTimeout(() => {
        scrollToCurIndex()
    }, 200)
})

// return a indexes array. the index is index of page, determining the show of pages.
/*
 * 哪些页真正需要加载。
 *
 * 早先用「curViewIndex ± loadNum」算，但相邻卷的页完全不在这个区间里，
 * 于是 v-if 直接把它们摘掉——表现为「第三卷根本没加载出来」。
 * 改成按元素实际位置和视口比较：视口上下各留一屏的余量。
 */
const activePageIndexes = ref<Set<number>>(new Set())

function updateActivePageIndexes(): void {
    const containers = pageContainers.value
    if (!containers || containers.length === 0) {
        return
    }
    const scroller = scrollView.value?.$el as HTMLElement | undefined
    const viewportHeight = scroller && scroller.clientHeight ? scroller.clientHeight : window.innerHeight
    const indexes = renderedPageIndexList.value
    const next = new Set<number>()
    for (let i = 0; i < containers.length; i++) {
        const element = containers[i] as HTMLElement
        if (!element) {
            continue
        }
        /*
         * 用屏幕坐标判断可见性，不再用 offsetTop 与 scrollPosition 比较。
         *
         * offsetTop 相对 offsetParent、scrollPosition 相对滚动容器，
         * 两者坐标系不一致时（手机上很常见），算出来的范围会严重偏小——
         * 表现就是「加载页数设 10P，实际只加载到第 4 页，第 5 页永远不开始」。
         * getBoundingClientRect 给的是屏幕坐标，和容器结构无关。
         */
        const rect = element.getBoundingClientRect()
        if (rect.height > 0 && rect.bottom > -viewportHeight && rect.top < viewportHeight * 2) {
            const pageIndex = indexes[i]
            if (pageIndex !== undefined) {
                next.add(pageIndex)
            }
        }
    }

    /*
     * 兜底：把「当前页 ± 加载页数」范围内的页也算作活跃。
     *
     * 上面只看屏幕坐标有个死循环：没渲染的页 rect 高度是 0，
     * 永远不满足可见条件，于是永远不渲染，也就永远不加载。
     * 表现就是「只加载开头几页就停住，翻到后面的页也不开始加载」。
     * 用索引范围兜底之后，cursurViewIndex 往前推进时能自动把后续页拉进来。
     */
    const from = Math.max(0, store.curViewIndex - store.loadNum)
    const to = Math.min(store.pageCount - 1, store.curViewIndex + store.loadNum)
    for (let i = 0; i < indexes.length; i++) {
        const pageIndex = indexes[i]
        if (pageIndex !== undefined && pageIndex >= from && pageIndex <= to) {
            next.add(pageIndex)
        }
    }

    activePageIndexes.value = next
}

const nearbyIndexList = computed(() => {
    let start = store.curViewIndex - store.loadNum
    if (start < 0) {
        start = 0
    }
    let end = store.curViewIndex + store.loadNum
    if (end > store.pageCount - 1) {
        end = store.pageCount - 1
    }
    let result: number[] = []
    for (let i = start; i <= end; i++) {
        result.push(i)
    }
    return result
})

watch(() => store.curViewIndex, (newVal, oldVal) => {
    // sync pagination
    if (store.curViewIndexUpdater !== updater) {
        scrollToCurIndex()
    }
})

function selectVol(volIndex: number) {
    storeAction.setCurViewIndex(volIndex * store.volumeSize, 'scroll_view_vol')
}

/*
 * 两卷窗口。
 *
 * 用户要的效果：往下滚时新内容从下面长出来、上面的卷收缩掉；往上滚时反过来。
 * 必须同时存在两卷，否则「滑到底」那一刻目标卷还没渲染，只能整卷替换，
 * 视觉上就是「瞬移到下一卷第一页」。
 *
 * 卸载上方卷时必须补偿 scrollTop，否则内容一消失，视口会瞬间往下窜一整个卷的高度。
 */
const renderedVolumes = ref<number[]>([])

/** 当前渲染的页（按已加载的卷展开） */
const renderedPageIndexList = computed(() => {
    const result: number[] = []
    for (const vol of renderedVolumes.value) {
        const startIndex = vol * store.volumeSize
        for (let i = startIndex; i < startIndex + store.volumeSize && i < store.pageCount; i++) {
            result.push(i)
        }
    }
    return result
})

watch(renderedPageIndexList, () => {
    // 卷窗口变了，新卷的页要按当前视口重新判定
    nextTick(() => updateActivePageIndexes())
})

/** 用「当前卷 - 1」起步，保证上下都有余量 */
function resetVolumesAroundCurrent(): void {
    const cur = Math.max(0, computedCurVolNo.value - 1)
    const total = computedVolumeSum.value
    const list = [cur]
    if (cur + 1 < total) {
        list.push(cur + 1)
    }
    if (cur - 1 >= 0) {
        list.unshift(cur - 1)
    }
    renderedVolumes.value = list
}

const SLIDE_TRIGGER_PX = 200
let sliding = false

/**
 * 窗口滑动：向下滚到底部时接下一卷并丢掉最上面的卷，向上滚到顶时反向。
 */
async function maybeSlideWindow(position: number): Promise<void> {
    const containers = pageContainers.value
    if (!containers || containers.length === 0 || sliding) {
        return
    }
    const first = containers[0] as HTMLElement
    const last = containers[containers.length - 1] as HTMLElement
    if (!first || !last) {
        return
    }
    const scroller = scrollView.value?.$el as HTMLElement | undefined
    const viewportHeight = scroller && scroller.clientHeight ? scroller.clientHeight : window.innerHeight
    const contentTop = first.offsetTop
    const contentBottom = last.offsetTop + last.offsetHeight
    const vols = renderedVolumes.value
    if (vols.length === 0) {
        return
    }
    const firstVol = vols[0]
    const lastVol = vols[vols.length - 1]
    const total = computedVolumeSum.value

    /*
     * 向下：视口接近末尾 → **追加**下一卷，不卸载任何已渲染的卷。
     *
     * 之前是「追加下一卷 + 丢掉最上面那卷」，靠 scrollTop 补偿来维持视觉位置。
     * 但补偿量极难算准（padding、重排时机、v-if 摘除元素都会影响），
     * 实测表现为：第三卷长出来之后一碰底部就被拽回第二卷，
     * 而且第一二卷再也不回收。与其在补偿上继续试错，不如先只追加：
     * 滚动位置天然稳定，页码也不会回退。
     *
     * 内存这边有另一道闸——activePageIndexes 只让视口附近的页真正持有 <img>，
     * 所以卸载卷对「图片内存」的收益其实有限，主要省的是 DOM 节点。
     */
    if (lastVol + 1 < total && position + viewportHeight >= contentBottom - SLIDE_TRIGGER_PX) {
        sliding = true
        renderedVolumes.value = [...vols, lastVol + 1]
        window.setTimeout(() => { sliding = false }, 300)
        return
    }

    // 向上：视口接近开头 → 在前面补上一卷（同样不卸载）
    if (firstVol - 1 >= 0 && position <= contentTop + SLIDE_TRIGGER_PX) {
        sliding = true
        renderedVolumes.value = [firstVol - 1, ...vols]
        window.setTimeout(() => { sliding = false }, 300)
    }
}

</script>

<style lang="scss" scoped>
@import '../style/_responsive';
@import '../style/_variables';

.album-scroll-view {
    position: relative;
    flex-direction: column;
    align-items: center;
    height: 100%;
    width: 100%;

    >.preload {
        position: absolute;
        top: 0;
        left: 0;
        width: 200px;
        height: 144px;
        z-index: -10;
        opacity: 0;
        display: flex;
        flex-direction: row;

        .preload-item {
            width: 200px;
            height: 144px;
            position: relative;
        }
    }

    >.scroll-view {
        height: 100%;
        width: 100%;

        h1 {
            color: #c9cacf;
            padding: 10px 20px;
            font-size: 18px;
            text-align: center;
            margin-top: 60px;
        }

        >.top-pagination {
            margin-top: 15px;
            margin-bottom: 15px;
        }

        >.bottom-pagination {
            margin-top: 15px;
            margin-bottom: 30px;
        }

        .page-container {
            transition: all 0.3s ease;
            height: 0;
            position: relative;

            &:first-of-type {
                margin-top: 35px;
            }

            &:last-of-type {
                margin-bottom: 35px;
            }
        }
    }
}
</style>
