<template>
<div
    v-if="stats.visible"
    ref="panelRef"
    class="ehunter-stats"
    :style="panelStyle"
    @contextmenu.prevent>
    <header class="ehunter-stats-bar" @pointerdown="onDragStart">
        <span class="ehunter-stats-title">{{ i18n.statsTitle }}</span>
        <span class="ehunter-stats-actions">
            <button type="button" @click.stop="copyReport">{{ i18n.statsCopy }}</button>
            <button type="button" @click.stop="resetStats">{{ i18n.statsReset }}</button>
            <button type="button" class="close" :title="i18n.statsClose" @click.stop="closeStats">×</button>
        </span>
    </header>

    <div class="ehunter-stats-body">
        <section class="ehunter-stats-section">
            <h6 class="ehunter-stats-head">{{ i18n.statsSectionPage }}</h6>
            <div class="ehunter-stats-row" v-for="row in pageRows" :key="row.key">
                <span class="ehunter-stats-k">{{ row.key }}</span>
                <span class="ehunter-stats-v" :class="{ warn: row.warn }">{{ row.value }}</span>
            </div>
        </section>

        <section class="ehunter-stats-section">
            <h6 class="ehunter-stats-head">{{ i18n.statsSectionAlbum }}</h6>
            <div class="ehunter-stats-progress">
                <span class="ehunter-stats-progress-fill" :style="{ width: progressPercent }"></span>
            </div>
            <div class="ehunter-stats-row" v-for="row in albumRows" :key="row.key">
                <span class="ehunter-stats-k">{{ row.key }}</span>
                <span class="ehunter-stats-v" :class="{ warn: row.warn }">{{ row.value }}</span>
            </div>
        </section>

        <section class="ehunter-stats-section">
            <h6 class="ehunter-stats-head">{{ i18n.statsSectionNet }}</h6>
            <div class="ehunter-stats-row" v-for="row in netRows" :key="row.key">
                <span class="ehunter-stats-k">{{ row.key }}</span>
                <span class="ehunter-stats-v" :class="{ warn: row.warn }">{{ row.value }}</span>
            </div>
            <div class="ehunter-stats-spark" v-if="netSamples.length">
                <span
                    v-for="item in netSamples"
                    :key="item.id"
                    class="ehunter-stats-bar-cell"
                    :class="{ bad: !item.ok }"
                    :style="{ height: item.bar }"
                    :title="item.tip"></span>
            </div>
            <div class="ehunter-stats-list" v-if="netLines.length">
                <div class="ehunter-stats-line" v-for="item in netLines" :key="item.id">
                    <span class="ehunter-stats-tag" :class="[`is-${item.channel}`, { bad: !item.ok }]">{{ channelLabel(item.channel) }}</span>
                    <span class="ehunter-stats-host">{{ item.host }}</span>
                    <span class="ehunter-stats-ms">{{ item.msText }}</span>
                    <span class="ehunter-stats-speed">{{ item.speedText }}</span>
                </div>
            </div>
        </section>

        <section class="ehunter-stats-section">
            <h6 class="ehunter-stats-head">{{ i18n.statsSectionSuperRes }}</h6>
            <div class="ehunter-stats-row" v-for="row in superRows" :key="row.key">
                <span class="ehunter-stats-k">{{ row.key }}</span>
                <span class="ehunter-stats-v" :class="{ warn: row.warn }">{{ row.value }}</span>
            </div>
        </section>

        <section class="ehunter-stats-section">
            <h6 class="ehunter-stats-head">{{ i18n.statsSectionEnv }}</h6>
            <div class="ehunter-stats-row" v-for="row in envRows" :key="row.key">
                <span class="ehunter-stats-k">{{ row.key }}</span>
                <span class="ehunter-stats-v">{{ row.value }}</span>
            </div>
        </section>
    </div>

    <footer class="ehunter-stats-foot">
        <span>{{ i18n.statsHint }}</span>
        <span class="ehunter-stats-uptime">{{ uptimeText }}</span>
    </footer>
</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { store } from '../store/app'
import { i18n } from '../store/i18n'
import { getOutputEncode, superResolutionService } from '../service/SuperResolutionService'
import {
    closeStats,
    formatBytes,
    formatDuration,
    formatMs,
    formatSpeed,
    resetStats,
    startProbe,
    stats,
    summarizeAlbum,
} from '../service/StatsService'

const panelRef = ref<HTMLElement | null>(null)
const pos = ref({ x: 16, y: 16 })
const dragging = ref(false)
let dragOrigin = { x: 0, y: 0, px: 0, py: 0 }

const panelStyle = computed(() => ({
    left: `${pos.value.x}px`,
    top: `${pos.value.y}px`,
}))

const STAT_STATUS_KEY: Record<number, string> = {
    0: 'statsStatusWaiting',
    1: 'statsStatusLoading',
    2: 'statsStatusError',
    3: 'statsStatusLoaded',
}

const KIND_KEY: Record<string, string> = {
    none: 'statsKindNone',
    url: 'statsKindUrl',
    thumb: 'statsKindThumb',
    blob: 'statsKindBlob',
    superres: 'statsKindSuperres',
}

const MODE_KEY: Record<number, string> = {
    0: 'statsModeDefault',
    1: 'statsModeFast',
    2: 'statsModeOrigin',
    3: 'statsModeChangeSource',
}

/** shader 链只在打开时读一次：它要在对话框里才能改，而对话框是模态的 */
const shaderSummary = ref({ files: [] as Array<{ name: string, passes: number }>, total: 0 })

function refreshShaderSummary() {
    try {
        shaderSummary.value = superResolutionService.describeShaders()
    } catch (e) {
        shaderSummary.value = { files: [], total: 0 }
    }
}

function t(key: string): string {
    const dict = i18n.value as any
    return typeof dict[key] === 'string' ? dict[key] : key
}

/** 体积变化。两边都有数才算，否则宁可显示 — 也不编一个百分比 */
function sizeDelta(original: number, upgraded: number): string {
    if (!original || !upgraded) {
        return ''
    }
    const delta = (upgraded / original - 1) * 100
    const sign = delta >= 0 ? '+' : ''
    return ` (${sign}${delta.toFixed(0)}%)`
}

const currentPage = computed(() => stats.pages[store.curViewIndex] || null)

const pageRows = computed(() => {
    // 依赖 tick：暂停/进行中这类没有新采样也要跟着时间刷新
    void stats.tick
    const page = currentPage.value
    if (!page) {
        return [{ key: t('statsStatus'), value: t('statsNoData') }]
    }
    const rows: Array<{ key: string, value: string, warn?: boolean }> = []
    const modeText = store.readingMode === 1 ? t('bookMode') : t('scrollMode')
    rows.push({
        key: t('statsPageIndex'),
        value: `${page.index + 1} / ${store.pageCount} · ${modeText}`,
    })
    const flags: string[] = []
    if (page.running) {
        flags.push(t('statsRunning'))
    }
    if (page.paused) {
        flags.push(t('statsPaused'))
    }
    rows.push({
        key: t('statsStatus'),
        value: `${t(STAT_STATUS_KEY[page.status] || 'statsStatusWaiting')}${flags.length ? ` · ${flags.join(' · ')}` : ''}`,
        warn: page.status === 2,
    })
    rows.push({
        key: t('statsSession'),
        value: `${formatMs(page.loadMs)} · ${t('statsAttempts')} ${page.attempts}`,
    })
    rows.push({ key: t('statsFetchMs'), value: page.fetchMs ? formatMs(page.fetchMs) : '—' })

    const originalSize = page.originalWidth && page.originalHeight
        ? `${page.originalWidth}×${page.originalHeight}`
        : '—'
    rows.push({ key: t('statsOriginalSize'), value: originalSize })
    if (page.superWidth && page.superHeight) {
        const ratio = page.originalWidth ? (page.superWidth / page.originalWidth) : 0
        rows.push({
            key: t('statsSuperSize'),
            value: `${page.superWidth}×${page.superHeight}${ratio ? ` (${ratio.toFixed(2)}x)` : ''}`,
        })
    }
    rows.push({ key: t('statsOriginalBytes'), value: page.originalBytes ? formatBytes(page.originalBytes) : '—' })
    if (page.superBytes) {
        rows.push({
            key: t('statsSuperBytes'),
            value: `${formatBytes(page.superBytes)}${sizeDelta(page.originalBytes, page.superBytes)}`,
        })
    }
    rows.push({ key: t('statsDisplayKind'), value: t(KIND_KEY[page.displayKind] || 'statsKindNone') })
    rows.push({ key: t('statsSrcHost'), value: page.srcHost || '—' })
    rows.push({ key: t('statsMode'), value: t(MODE_KEY[page.mode] || 'statsModeDefault') })
    if (page.error) {
        rows.push({ key: t('statsLastError'), value: page.error, warn: true })
    }
    return rows
})

const albumTotals = computed(() => {
    void stats.tick
    return summarizeAlbum(store.pageCount)
})

const progressPercent = computed(() => {
    const totals = albumTotals.value
    if (!totals.total) {
        return '0%'
    }
    return `${Math.min(100, Math.round((totals.loaded / totals.total) * 100))}%`
})

const albumRows = computed(() => {
    const totals = albumTotals.value
    const percent = totals.total ? Math.round((totals.loaded / totals.total) * 100) : 0
    const rows: Array<{ key: string, value: string, warn?: boolean }> = [
        { key: t('statsLoadedPages'), value: `${totals.loaded} / ${totals.total} (${percent}%)` },
        { key: t('statsLoadingPages'), value: `${totals.loading}` },
        { key: t('statsFailedPages'), value: `${totals.failed}`, warn: totals.failed > 0 },
        { key: t('statsPendingPages'), value: `${totals.untouched}` },
    ]
    if (totals.loaded) {
        rows.push({ key: t('statsAvgLoadMs'), value: totals.avgLoadMs ? formatMs(totals.avgLoadMs) : '—' })
    }
    if (totals.originalBytes) {
        rows.push({ key: t('statsOriginalTotal'), value: formatBytes(totals.originalBytes) })
    }
    if (totals.superPages) {
        rows.push({
            key: t('statsSuperTotal'),
            value: `${formatBytes(totals.superBytes)} · ${totals.superPages} ${t('statsPagesUnit')}`,
        })
    }
    return rows
})

const netRows = computed(() => {
    void stats.tick
    let sumBytes = 0
    let sumMs = 0
    for (const item of stats.net) {
        if (item.ok && item.bytes) {
            sumBytes += item.bytes
            sumMs += item.ms
        }
    }
    return [
        { key: t('statsTotal'), value: `${stats.reqCount} ${t('statsTimes')} · ${formatBytes(stats.bytesTotal)}` },
        { key: t('statsFailCount'), value: `${stats.failCount} ${t('statsTimes')}`, warn: stats.failCount > 0 },
        { key: t('statsAvgSpeed'), value: sumBytes ? formatSpeed(sumBytes, sumMs) : '—' },
    ]
})

/** 最近 5 条明细，新的在右；柱状图仍然画 12 条，用来看整体节奏 */
const netSamples = computed(() => {
    void stats.tick
    const recent = stats.net.slice(-12)
    let fastest = 1
    for (const item of recent) {
        if (item.ok && item.bytes && item.ms) {
            fastest = Math.max(fastest, item.bytes / item.ms)
        }
    }
    return recent.map((item) => {
        const speed = item.ok && item.bytes && item.ms ? item.bytes / item.ms : 0
        const bar = `${Math.max(6, Math.round((speed / fastest) * 100))}%`
        return {
            id: item.id,
            channel: item.channel,
            host: item.host,
            ok: item.ok,
            msText: formatMs(item.ms),
            speedText: item.ok ? formatSpeed(item.bytes, item.ms) : (item.note || '—'),
            bar,
            tip: `${item.channel} ${item.host} ${formatMs(item.ms)} ${formatBytes(item.bytes)}${item.note ? ` ${item.note}` : ''}`,
        }
    })
})

/** 明细只留最后 5 条：柱状图已经表达了节奏，再列 12 行只会把面板撑长 */
const netLines = computed(() => netSamples.value.slice(-5))

const superRows = computed(() => {
    void stats.tick
    const rows: Array<{ key: string, value: string, warn?: boolean }> = []
    rows.push({
        key: t('statsEnabled'),
        value: store.superResEnabled ? t('statsEnabled') : t('statsDisabled'),
    })
    const files = shaderSummary.value.files
    rows.push({
        key: t('statsShaderCount'),
        value: `${files.length} · ${shaderSummary.value.total} ${t('statsPassUnit')}`,
        warn: files.length === 0 && store.superResEnabled,
    })
    // 编码直接影响"超分体积"那行和整本缓存占用，摆在超分分区里最容易被找到
    const encode = getOutputEncode()
    rows.push({
        key: t('statsOutEncode'),
        value: encode === 'png' ? 'PNG' : `${encode === 'webp' ? 'WebP' : 'JPEG'} 0.9`,
    })
    if (files.length) {
        rows.push({
            key: t('statsChain'),
            value: files
                .map((file, index) => `${index + 1}. ${file.name.replace(/\.(glsl|hook|txt)$/i, '')}(${file.passes})`)
                .join(' → '),
        })
    }
    const counters = superResolutionService.getStats()
    const attempts = counters.hits + counters.misses
    rows.push({
        key: t('statsCache'),
        value: `${counters.cacheSize} · ${t('statsHit')} ${counters.hits} / ${t('statsMiss')} ${counters.misses}`
            + (attempts ? ` (${Math.round((counters.hits / attempts) * 100)}%)` : '')
            + (counters.queued ? ` · ${t('statsQueued')} ${counters.queued}` : ''),
    })
    const last = stats.renders[stats.renders.length - 1]
    if (last) {
        rows.push({
            key: t('statsLastRender'),
            value: `${last.sourceWidth}×${last.sourceHeight} → ${last.width}×${last.height} · ${last.passes} ${t('statsPassUnit')}`,
        })
        rows.push({
            key: t('statsLastRenderSize'),
            value: `${formatBytes(last.sourceBytes)} → ${formatBytes(last.bytes)}${sizeDelta(last.sourceBytes, last.bytes)}`,
        })
        rows.push({
            key: t('statsBreakdown'),
            value: `${t('statsDecode')} ${formatMs(last.decodeMs)} · ${t('statsGpu')} ${formatMs(last.gpuMs)}`
                + ` · ${t('statsEncode')} ${formatMs(last.encodeMs)} · ${t('statsTotalMs')} ${formatMs(last.totalMs)}`,
        })
    }
    return rows
})

const envRows = computed(() => {
    void stats.tick
    const heap = stats.heapLimit
        ? `${formatBytes(stats.heapUsed)} / ${formatBytes(stats.heapLimit)}`
        : formatBytes(stats.heapUsed)
    // 合并成四行：环境这块信息密度低，逐行摊开会把整块撑到滚动区外
    return [
        { key: t('statsVersion'), value: `v${eHunterVersion()} · ${platformName()}` },
        { key: t('statsViewport'), value: `${window.innerWidth}×${window.innerHeight} · DPR ${window.devicePixelRatio}` },
        { key: t('statsFps'), value: stats.fps ? `${stats.fps}` : '—' },
        { key: t('statsHeap'), value: `${heap} · ${stats.nodes} ${t('statsNodeUnit')}` },
    ]
})

const uptimeText = computed(() => {
    void stats.tick
    if (!stats.openedAt) {
        return ''
    }
    return formatDuration(Date.now() - stats.openedAt)
})

function eHunterVersion(): string {
    const direct = typeof __EHUNTER_VERSION__ === 'string' ? __EHUNTER_VERSION__ : ''
    if (direct) {
        return direct
    }
    const raw = (globalThis as any).__EHUNTER_VERSION__
    return typeof raw === 'string' && raw ? raw : 'unknown'
}

function platformName(): string {
    const host = location.hostname
    if (/pixiv/.test(host)) {
        return 'pixiv'
    }
    if (/nhentai/.test(host)) {
        return 'nhentai'
    }
    if (/exhentai|e-hentai/.test(host)) {
        return 'e-hentai'
    }
    return host || '—'
}

function channelLabel(channel: string): string {
    if (channel === 'superres') {
        return 'SR'
    }
    if (channel === 'blob') {
        return 'GM'
    }
    return 'IMG'
}

// ---------------------------------------------------------------- 交互

function onDragStart(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) {
        return
    }
    dragging.value = true
    dragOrigin = { x: pos.value.x, y: pos.value.y, px: e.clientX, py: e.clientY }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragEnd, { once: true })
}

function onDragMove(e: PointerEvent) {
    if (!dragging.value) {
        return
    }
    const panel = panelRef.value
    const width = panel ? panel.offsetWidth : 480
    const height = panel ? panel.offsetHeight : 260
    pos.value = {
        x: Math.max(0, Math.min(window.innerWidth - Math.min(width, window.innerWidth), dragOrigin.x + e.clientX - dragOrigin.px)),
        y: Math.max(0, Math.min(window.innerHeight - Math.min(height, window.innerHeight), dragOrigin.y + e.clientY - dragOrigin.py)),
    }
}

function onDragEnd() {
    dragging.value = false
    window.removeEventListener('pointermove', onDragMove)
}

function buildReport(): string {
    const lines: string[] = [`eHunter v${eHunterVersion()} · ${location.href}`]
    const sections: Array<[string, Array<{ key: string, value: string }>]> = [
        [t('statsSectionPage'), pageRows.value],
        [t('statsSectionAlbum'), albumRows.value],
        [t('statsSectionNet'), netRows.value],
        [t('statsSectionSuperRes'), superRows.value],
        [t('statsSectionEnv'), envRows.value],
    ]
    for (const [title, rows] of sections) {
        lines.push('', `[${title}]`)
        for (const row of rows) {
            lines.push(`${row.key}: ${row.value}`)
        }
    }
    if (netSamples.value.length) {
        lines.push('', '[recent]')
        for (const item of netSamples.value) {
            lines.push(`${item.channel} ${item.host} ${item.msText} ${item.speedText}`)
        }
    }
    return lines.join('\n')
}

async function copyReport() {
    const text = buildReport()
    try {
        await navigator.clipboard.writeText(text)
        return
    } catch (e) {
        // 剪贴板权限被拒（非安全上下文 / 油猴沙箱）时退到 textarea，
        // 否则这个按钮在最需要它的时候恰好用不了
    }
    try {
        const area = document.createElement('textarea')
        area.value = text
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        document.body.removeChild(area)
    } catch (e) {
        // 两条路都走不通就什么都不做：状态浮层不该为了复制弹报错
    }
}

/** 入口是右键和页面菜单，只用 Esc 做关闭 */
function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !stats.visible) {
        return
    }
    const target = e.target as HTMLElement | null
    if (target) {
        const tag = (target.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
            return
        }
    }
    closeStats()
}

let stopProbe: (() => void) | null = null

watch(() => stats.visible, (visible) => {
    if (visible) {
        refreshShaderSummary()
        pos.value = { x: 16, y: 16 }
        stopProbe = startProbe()
    } else if (stopProbe) {
        stopProbe()
        stopProbe = null
    }
})

onMounted(() => {
    document.addEventListener('keydown', onKeyDown, true)
})

onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('pointermove', onDragMove)
    if (stopProbe) {
        stopProbe()
        stopProbe = null
    }
})
</script>

<style lang="scss" scoped>
@import '../style/_variables';

// 这个浮层故意不跟随主题：它是对照 mpv 的 stats 做的，
// 深底浅字在任何页面上都可读，浅色主题下反而会被漫画的白色背景吃掉。
.ehunter-stats {
    position: fixed;
    // 阅读器自己的层都用小 z-index，浮层必须盖在菜单和放大镜之上
    z-index: 2147483000;
    width: 480px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
    display: flex;
    flex-direction: column;
    // 不透明：漫画页是白底，留 6% 透明度就能看见底下的分格线透过来
    background: #0f1013;
    color: #e6edf3;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Cascadia Mono', 'Microsoft YaHei', monospace;
    font-size: 12px;
    line-height: 1.45;
    user-select: none;

    > .ehunter-stats-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 8px 6px 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.10);
        cursor: move;
        background: rgba(255, 255, 255, 0.04);

        > .ehunter-stats-title {
            font-weight: 600;
            letter-spacing: 0.04em;
            color: #9be3ff;
        }

        > .ehunter-stats-actions {
            display: flex;
            align-items: center;
            gap: 6px;

            > button {
                background: rgba(255, 255, 255, 0.08);
                color: #cfd8e3;
                border: 1px solid rgba(255, 255, 255, 0.10);
                border-radius: 3px;
                font-size: 11px;
                padding: 1px 7px;
                cursor: pointer;
                font-family: inherit;

                &:hover {
                    background: rgba(255, 255, 255, 0.16);
                    color: #fff;
                }

                &.close {
                    font-size: 14px;
                    line-height: 1;
                    padding: 0 6px 1px;
                }
            }
        }
    }

    > .ehunter-stats-body {
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        padding: 3px 0 2px;
        // 内容超长时要能看出「下面还有」：面板是深色，默认滚动条几乎看不见
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.22) transparent;

        > .ehunter-stats-section {
            display: flex;
            flex-direction: column;
            padding: 1px 10px 4px;

            & + .ehunter-stats-section {
                border-top: 1px dashed rgba(255, 255, 255, 0.09);
                padding-top: 3px;
            }

            > .ehunter-stats-head {
                color: #7f8b99;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.08em;
                margin: 1px 0 2px;
                text-transform: uppercase;
            }

            > .ehunter-stats-progress {
                display: flex;
                height: 3px;
                margin: 2px 0 5px;
                background: rgba(255, 255, 255, 0.10);
                border-radius: 2px;
                overflow: hidden;

                > .ehunter-stats-progress-fill {
                    display: block;
                    height: 100%;
                    background: #4c9be8;
                    transition: width 0.2s ease;
                }
            }

            > .ehunter-stats-row {
                display: flex;
                align-items: baseline;
                gap: 8px;

                > .ehunter-stats-k {
                    flex: 0 0 92px;
                    color: #8b949e;
                    white-space: nowrap;
                }

                > .ehunter-stats-v {
                    flex: 1 1 auto;
                    color: #e6edf3;
                    // 优先在空格处断行：`1. A(4) → 2. B(17)` 这样换行比在
                    // `GAN_x` / `2_S(17)` 中间劈开好读
                    word-break: normal;
                    overflow-wrap: anywhere;

                    &.warn {
                        color: #ffb86b;
                    }
                }
            }
        }

        > .ehunter-stats-section > .ehunter-stats-spark {
            display: flex;
            align-items: flex-end;
            gap: 2px;
            height: 18px;
            margin: 3px 0 1px 100px;

            > .ehunter-stats-bar-cell {
                flex: 1 1 0;
                min-width: 2px;
                background: #4c9be8;
                border-radius: 1px 1px 0 0;

                &.bad {
                    background: #d9544d;
                }
            }
        }

        > .ehunter-stats-section > .ehunter-stats-list {
            display: flex;
            flex-direction: column;
            margin-top: 2px;

            > .ehunter-stats-line {
                display: flex;
                align-items: baseline;
                gap: 6px;
                color: #b8c2cc;

                > .ehunter-stats-tag {
                    flex: 0 0 34px;
                    margin-right: 4px;
                    font-size: 10px;
                    text-align: center;
                    border-radius: 2px;
                    background: rgba(255, 255, 255, 0.10);
                    color: #9aa7b4;

                    &.is-superres {
                        color: #d6b3ff;
                    }

                    &.is-blob {
                        color: #9be3ff;
                    }

                    &.bad {
                        color: #ff9b93;
                    }
                }

                > .ehunter-stats-host {
                    flex: 1 1 auto;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                > .ehunter-stats-ms {
                    flex: 0 0 58px;
                    text-align: right;
                    color: #8b949e;
                }

                > .ehunter-stats-speed {
                    flex: 0 0 78px;
                    text-align: right;
                    color: #8b949e;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
            }
        }
    }

    > .ehunter-stats-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 3px 10px 5px;
        border-top: 1px solid rgba(255, 255, 255, 0.10);
        color: #6f7b88;
        font-size: 11px;

        > .ehunter-stats-uptime {
            color: #8b949e;
        }
    }
}
</style>
