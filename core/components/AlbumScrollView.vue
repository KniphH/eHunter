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
            <Pagination v-if="computedVolumeSum > 1" class="top-pagination" :cur-index="computedCurVolNo - 1"
                :page-sum="computedVolumeSum" @change="selectVol" />
            <div class="page-container" ref="pageContainers" v-for="i of computedVolPageIndexList"
                :key="i"
                :style="{ 'width': `${store.widthScale}%`, 'padding-bottom': `${store.widthScale * storeAction.getImgPageHeightOfWidth(i)}%`, 'margin': `${store.scrollPageMargin}px auto` }">
                <PageView :index="i" :active="nearbyIndexList.indexOf(i) > -1"/>
            </div>
            <Pagination v-if="computedVolumeSum > 1" class="bottom-pagination" :cur-index="computedCurVolNo - 1"
                :page-sum="computedVolumeSum" @change="selectVol" />
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
    maybeSwitchVolume(position)
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
            index = result + computedVolFirstIndex.value
        } else {
            index = computedVolFirstIndex.value
        }
    } else if (scrollPosition.value !== 0) {
        // avoiding that in the top, page 1 and page 2 show at the same time, the index is 1
        const _cons = cons.concat().reverse()
        let result = cons.indexOf(
            _cons.find(item => item.offsetTop <= scrollPosition.value + window.innerHeight)
        );
        const volIndex = result === -1 ? pageContainers.value.length - 1 : result
        index = volIndex + computedVolFirstIndex.value
    } else {
        index = computedVolFirstIndex.value
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
    setTimeout(() => {
        scrollToCurIndex()
    }, 200)
})

// return a indexes array. the index is index of page, determining the show of pages.
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
 * 卷的自动衔接。
 *
 * 一次只渲染当前卷（computedVolPageIndexList），所以「滑出窗口就卸载」是天然的，
 * 不需要额外的卸载逻辑。这里只补两件事：
 *   - 滑到本卷底部 → 自动进入下一卷（相当于把「手动点分页」变成滚动续接）
 *   - 滑回本卷顶部 → 自动回到上一卷（用户往回翻时的对称行为）
 *
 * 为什么底部要「碰到就接」而顶部要「顶到头才接」：
 * 向前阅读是主流，提前一屏接上下一卷可以让滚动不中断；
 * 往回读是少数情况，等真顶到顶部再接就够了，否则一进来就会误触发。
 */
const AUTO_VOL_EDGE_PX = 40
let switchingVolume = false

function maybeSwitchVolume(position: number) {
    const containers = pageContainers.value
    if (!containers || containers.length === 0 || switchingVolume) {
        return
    }
    const scroller = scrollView.value?.$el as HTMLElement | undefined
    const viewportHeight = scroller && scroller.clientHeight ? scroller.clientHeight : window.innerHeight

    const last = containers[containers.length - 1] as HTMLElement
    if (!last) {
        return
    }
    const contentBottom = last.offsetTop + last.offsetHeight

    // 底部：碰到本卷最后一张的下沿 → 接下一卷
    if (position + viewportHeight >= contentBottom - AUTO_VOL_EDGE_PX) {
        if (computedCurVolNo.value < computedVolumeSum.value) {
            switchingVolume = true
            selectVol(computedCurVolNo.value)
            window.setTimeout(() => { switchingVolume = false }, 600)
        }
        return
    }

    // 顶部：真顶到头 → 回上一卷
    if (position <= AUTO_VOL_EDGE_PX && computedCurVolNo.value > 1) {
        switchingVolume = true
        selectVol(computedCurVolNo.value - 2)
        window.setTimeout(() => { switchingVolume = false }, 600)
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
