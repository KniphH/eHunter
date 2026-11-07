<template>
    <teleport to=".ehunter-app">
        <transition name="slow-opacity-fade" appear>
            <div v-if="active" class="ehunter-superres-modal" @click.self="close">
                <div class="ehunter-superres-panel" @click.stop>
                    <header class="ehunter-superres-header">
                        <h3>{{ i18n.superResolutionShaders }}</h3>
                        <button class="ehunter-superres-close" type="button" :aria-label="i18n.cancel" @click="close">×</button>
                    </header>
                    <div class="ehunter-superres-body">
                        <p class="ehunter-superres-intro">{{ i18n.superResolutionShadersTip }}</p>

                        <div class="ehunter-superres-actions">
                            <button class="ehunter-superres-btn" type="button" @click="pickFiles">
                                {{ i18n.superResolutionConfigure }}
                            </button>
                            <button v-if="files.length" class="ehunter-superres-btn ehunter-superres-btn-danger" type="button" @click="clearFiles">
                                {{ i18n.superResolutionClear }}
                            </button>
                            <span class="ehunter-superres-cache">{{ i18n.superResolutionCacheInfo }} {{ cacheSize }}</span>
                        </div>

                        <input
                            ref="fileInputRef"
                            type="file"
                            accept=".glsl,.hook,.txt,text/plain"
                            multiple
                            class="ehunter-superres-input"
                            @change="onFilesPicked" />

                        <ul v-if="files.length" class="ehunter-superres-list">
                            <li
                                v-for="(item, index) in fileSummary"
                                :key="`${item.name}-${index}`"
                                class="ehunter-superres-item">
                                <span class="ehunter-superres-step">{{ index + 1 }}</span>
                                <span class="ehunter-superres-name">{{ item.name }}</span>
                                <span
                                    v-if="files.length > 1 && index === 0"
                                    class="ehunter-superres-flag ehunter-superres-flag-first">{{ i18n.superResolutionStepFirst }}</span>
                                <span
                                    v-else-if="files.length > 1 && index === files.length - 1"
                                    class="ehunter-superres-flag">{{ i18n.superResolutionStepLast }}</span>
                                <span class="ehunter-superres-meta">{{ item.passes }} {{ i18n.superResolutionPassCount }}</span>
                                <span class="ehunter-superres-move" v-if="files.length > 1">
                                    <button
                                        type="button"
                                        :title="i18n.superResolutionMoveUp"
                                        :disabled="index === 0"
                                        @click="move(index, -1)">▲</button>
                                    <button
                                        type="button"
                                        :title="i18n.superResolutionMoveDown"
                                        :disabled="index === files.length - 1"
                                        @click="move(index, 1)">▼</button>
                                </span>
                            </li>
                        </ul>
                        <p v-else class="ehunter-superres-empty">{{ i18n.superResolutionEmpty }}</p>

                        <p v-if="errorText" class="ehunter-superres-error">{{ errorText }}</p>
                        <template v-else-if="files.length">
                            <p class="ehunter-superres-ok">
                                {{ i18n.superResolutionLoaded }} · {{ totalPasses }} {{ i18n.superResolutionPassCount }}
                            </p>
                            <p class="ehunter-superres-chain">
                                <span class="ehunter-superres-chain-label">{{ i18n.superResolutionOrder }}</span>
                                <span class="ehunter-superres-chain-body">{{ chainText }}</span>
                            </p>
                        </template>
                    </div>
                </div>
            </div>
        </transition>
    </teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { i18n } from '../../store/i18n'
import { storeAction } from '../../store/app'
import {
    parseShaderFileTexts,
    superResolutionService,
    type SuperResShaderFile,
} from '../../service/SuperResolutionService'

defineProps<{ active: boolean }>()
const emit = defineEmits(['close', 'changed'])

const fileInputRef = ref<HTMLInputElement | null>(null)
const files = ref<SuperResShaderFile[]>(superResolutionService.getShaderFiles())
const errorText = ref('')
const cacheSize = ref(superResolutionService.getCacheSize())

const fileSummary = computed(() => files.value.map((file) => {
    try {
        return { name: file.name, passes: parseShaderFileTexts([file.text]).length }
    } catch (e) {
        return { name: file.name, passes: 0 }
    }
}))

const totalPasses = computed(() => fileSummary.value.reduce((sum, item) => sum + item.passes, 0))

/**
 * 一句话把执行顺序摊开：列表从上到下就是实际执行的先后，
 * 这里再用箭头串一遍，避免"到底是正序还是倒序"的疑问。
 */
const chainText = computed(() => fileSummary.value
    .map((item, index) => `${index + 1}. ${item.name.replace(/\.(glsl|hook|txt)$/i, '')}`)
    .join('  →  '))

/** 调整执行顺序。文件选择器的返回顺序由系统排序决定，用户只能在这里改 */
function move(index: number, delta: number): void {
    const target = index + delta
    if (target < 0 || target >= files.value.length) {
        return
    }
    const next = files.value.slice()
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    files.value = next
    storeAction.applySuperResShaders(next)
    errorText.value = ''
    cacheSize.value = superResolutionService.getCacheSize()
    emit('changed')
}

function pickFiles(): void {
    fileInputRef.value?.click()
}

async function onFilesPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const picked = Array.from(input.files || [])
    input.value = ''
    if (picked.length === 0) {
        return
    }
    const next: SuperResShaderFile[] = []
    for (const file of picked) {
        next.push({ name: file.name, text: await file.text() })
    }
    const validationError = validate(next)
    if (validationError) {
        errorText.value = validationError
        return
    }
    storeAction.applySuperResShaders(next)
    files.value = next
    errorText.value = ''
    cacheSize.value = superResolutionService.getCacheSize()
    emit('changed')
}

/**
 * 载入前就把不支持的 shader 挡掉：
 * COMPONENTS 1/2/3 的 pass（Darken / Thin / Deblur / AIO）返回的是 float/vec2，
 * 塞不进 vec4 输出，跑起来只会给你一张错图。
 */
function validate(candidate: SuperResShaderFile[]): string {
    let passes
    try {
        passes = parseShaderFileTexts(candidate.map(file => file.text))
    } catch (e) {
        return `解析失败：${(e as Error).message}`
    }
    if (passes.length === 0) {
        return '没有解析到任何 pass，请确认选的是 Anime4K v4 的 .glsl 文件'
    }
    const unsupported = passes.filter(pass => pass.components !== 4)
    if (unsupported.length > 0) {
        const comps = Array.from(new Set(unsupported.map(pass => pass.components))).join('/')
        return `包含 ${unsupported.length} 个 COMPONENTS=${comps} 的 pass（亮度分离类滤镜），暂不支持。`
            + `请改用 Restore_CNN_* / Upscale_CNN_x2_* / Restore_GAN_* 这类 4 通道滤镜`
    }
    return ''
}

function clearFiles(): void {
    storeAction.applySuperResShaders([])
    files.value = []
    errorText.value = ''
    cacheSize.value = superResolutionService.getCacheSize()
    emit('changed')
}

function close(): void {
    cacheSize.value = superResolutionService.getCacheSize()
    emit('close')
}
</script>

<style scoped>
/* 注意：不能复用 MoreSettingsDialog 的 .ehunter-more-settings-modal ——
   那是 scoped 样式，跨组件拿不到；这里必须自带完整定位与层级，
   且 z-index 要高于设置面板（10020），否则弹窗会被压在下面。 */
.ehunter-superres-modal {
    position: fixed;
    inset: 0;
    z-index: 10030;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(16, 24, 39, 0.46);
    backdrop-filter: blur(6px);
}

.ehunter-superres-panel {
    width: min(560px, 100%);
    max-height: min(660px, 100%);
    border-radius: 18px;
    overflow: hidden;
    background: linear-gradient(180deg, #f8fbff 0%, #f2f6fd 100%);
    box-shadow:
        0 28px 70px rgba(6, 19, 38, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.7);
    display: flex;
    flex-direction: column;
}

.ehunter-superres-header {
    position: relative;
    display: flex;
    align-items: center;
    padding: 14px 56px 14px 20px;
    border-bottom: 1px solid rgba(78, 102, 146, 0.18);
    background: rgba(255, 255, 255, 0.82);
}

.ehunter-superres-header h3 {
    margin: 0;
    font-size: 19px;
    font-weight: 700;
    letter-spacing: 0.2px;
    color: #1e304f;
}

.ehunter-superres-close {
    position: absolute;
    right: 14px;
    top: 12px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    color: #4a6fa5;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 2px 8px rgba(26, 45, 78, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}

.ehunter-superres-close:hover {
    background: #ebf3ff;
    color: #2d5a9e;
    transform: scale(1.08);
}

.ehunter-superres-body {
    padding: 16px 20px 20px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.ehunter-superres-intro {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.65;
    color: rgba(30, 48, 79, 0.68);
}

.ehunter-superres-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.ehunter-superres-btn {
    border: 1px solid rgba(78, 102, 146, 0.28);
    background: #ffffff;
    color: #2d5a9e;
    font-size: 13px;
    padding: 8px 14px;
    border-radius: 9px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.ehunter-superres-btn:hover {
    background: #ebf3ff;
    border-color: rgba(78, 102, 146, 0.45);
}

.ehunter-superres-btn-danger {
    color: #c0392b;
    border-color: rgba(192, 57, 43, 0.28);
}

.ehunter-superres-btn-danger:hover {
    background: #ffecec;
    border-color: rgba(192, 57, 43, 0.45);
}

.ehunter-superres-cache {
    margin-left: auto;
    font-size: 12px;
    color: rgba(30, 48, 79, 0.5);
}

.ehunter-superres-input {
    display: none;
}

.ehunter-superres-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.ehunter-superres-list li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: #1e304f;
    background: rgba(78, 102, 146, 0.07);
    border-radius: 8px;
    padding: 8px 10px;
}

/* 行与行之间画一小段竖线，让「从上往下依次执行」这件事一眼可见 */
.ehunter-superres-item {
    position: relative;
}

.ehunter-superres-item:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 19px;
    bottom: -7px;
    width: 2px;
    height: 8px;
    border-radius: 1px;
    background: rgba(78, 102, 146, 0.4);
}

.ehunter-superres-step {
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: #ffffff;
    background: #4a6fa5;
}

.ehunter-superres-flag {
    flex: none;
    font-size: 10.5px;
    line-height: 1;
    padding: 3px 6px;
    border-radius: 999px;
    color: rgba(30, 48, 79, 0.62);
    background: rgba(78, 102, 146, 0.13);
}

.ehunter-superres-flag-first {
    color: #1f6f3f;
    background: rgba(31, 157, 85, 0.16);
}

.ehunter-superres-move {
    flex: none;
    display: inline-flex;
    flex-direction: column;
    gap: 2px;
}

.ehunter-superres-move button {
    width: 18px;
    height: 13px;
    padding: 0;
    border: 1px solid rgba(78, 102, 146, 0.26);
    border-radius: 4px;
    background: #ffffff;
    color: #4a6fa5;
    font-size: 8px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.ehunter-superres-move button:hover:not(:disabled) {
    background: #ebf3ff;
    border-color: rgba(78, 102, 146, 0.5);
}

.ehunter-superres-move button:disabled {
    opacity: 0.32;
    cursor: default;
}

.ehunter-superres-chain {
    margin: 0;
    display: flex;
    gap: 6px;
    font-size: 11.5px;
    line-height: 1.6;
    color: rgba(30, 48, 79, 0.62);
}

.ehunter-superres-chain-label {
    flex: none;
    color: rgba(30, 48, 79, 0.45);
}

.ehunter-superres-chain-body {
    word-break: break-all;
}

.ehunter-superres-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.ehunter-superres-meta {
    font-size: 11.5px;
    color: rgba(30, 48, 79, 0.5);
}

.ehunter-superres-empty {
    margin: 0;
    font-size: 12.5px;
    color: rgba(30, 48, 79, 0.55);
}

.ehunter-superres-error {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.6;
    color: #c0392b;
}

.ehunter-superres-ok {
    margin: 0;
    font-size: 12.5px;
    color: #1f9d55;
}
</style>
