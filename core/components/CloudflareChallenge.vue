<template>
    <div v-if="challengeState.active" class="cf-layer">
        <div class="cf-panel">
            <header class="cf-head">
                <h3>{{ i18n.cfTitle }}</h3>
                <button type="button" class="cf-close" :title="i18n.cfClose" @click="dismiss">×</button>
            </header>
            <p class="cf-hint">
                <template v-if="challengeState.passed">{{ i18n.cfPassed }}</template>
                <template v-else-if="timedOut">{{ i18n.cfTimeout }}</template>
                <template v-else>{{ i18n.cfHint }}</template>
            </p>
            <div class="cf-frame-wrap">
                <iframe
                    ref="frameRef"
                    :name="CHALLENGE_FRAME_NAME"
                    class="cf-frame"
                    :src="challengeState.url"
                    @load="onFrameLoad"></iframe>
            </div>
            <div class="cf-actions">
                <span class="cf-fallback">{{ i18n.cfFallback }}</span>
                <button type="button" class="cf-btn" @click="openExternal">{{ i18n.cfOpenExternal }}</button>
                <button type="button" class="cf-btn primary" @click="finish">{{ i18n.cfReload }}</button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { i18n } from '../store/i18n'
import { store } from '../store/app'
import { challengeState, closeCloudflareChallenge, saveResumeIndex } from '../store/challenge'
import { CHALLENGE_FRAME_NAME, isCloudflareChallengeTitle } from '../../src/platform/cloudflare'

const frameRef = ref<HTMLIFrameElement | null>(null)
const timedOut = ref(false)

let pollTimer = 0
let timeoutTimer = 0

function stopWatching(): void {
    if (pollTimer) {
        window.clearInterval(pollTimer)
        pollTimer = 0
    }
    if (timeoutTimer) {
        window.clearTimeout(timeoutTimer)
        timeoutTimer = 0
    }
}

/**
 * iframe 与主页面同源，可以直接读 contentDocument。
 * 挑战页标题是 "Just a moment..."，用户在 iframe 里点完勾选后 Cloudflare
 * 会把它重定向到真实页面，标题变了就说明通过了。
 */
function checkFrame(): void {
    const frame = frameRef.value
    if (!frame || challengeState.passed) {
        return
    }
    let doc: Document | null = null
    try {
        doc = frame.contentDocument
    } catch {
        return
    }
    if (!doc || !doc.title) {
        return
    }
    if (isCloudflareChallengeTitle(doc.title)) {
        return
    }
    // 标题变了还要看正文，跳过中间的空跳转页
    if ((doc.body?.innerText || '').length < 150) {
        return
    }
    stopWatching()
    challengeState.passed = true
    // 给用户看一眼"已验证"，然后带着阅读位置重载
    window.setTimeout(finish, 700)
}

function onFrameLoad(): void {
    checkFrame()
}

function startWatching(): void {
    stopWatching()
    timedOut.value = false
    pollTimer = window.setInterval(checkFrame, 800)
    timeoutTimer = window.setTimeout(() => {
        timedOut.value = true
    }, 60000)
}

function finish(): void {
    saveResumeIndex(store.curViewIndex)
    window.location.reload()
}

function dismiss(): void {
    stopWatching()
    closeCloudflareChallenge()
}

function openExternal(): void {
    window.open(challengeState.url, '_blank', 'noopener')
}

watch(
    () => challengeState.active,
    (active) => {
        if (active) {
            startWatching()
        } else {
            stopWatching()
        }
    },
    { immediate: true },
)

onBeforeUnmount(stopWatching)
</script>

<style lang="scss" scoped>
.cf-layer {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(0, 0, 0, 0.72);
}

.cf-panel {
    display: flex;
    flex-direction: column;
    width: min(560px, 100%);
    max-height: 90vh;
    overflow: hidden;
    background: #2a2a2c;
    color: #eee;
    border-radius: 8px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.cf-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 10px;

    h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
    }
}

.cf-close {
    width: 28px;
    height: 28px;
    font-size: 20px;
    line-height: 1;
    color: #bbb;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
    }
}

.cf-hint {
    margin: 0 16px 12px;
    font-size: 13px;
    line-height: 1.5;
    color: #a8a8ad;
}

.cf-frame-wrap {
    flex: 1;
    min-height: 320px;
    margin: 0 16px;
    overflow: hidden;
    background: #1b1b1d;
    border-radius: 6px;
}

.cf-frame {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 320px;
    border: none;
}

.cf-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: flex-end;
    padding: 12px 16px 16px;
}

.cf-fallback {
    flex: 1 1 100%;
    order: -1;
    margin-bottom: 2px;
    font-size: 12px;
    line-height: 1.5;
    color: #8a8a90;
}

.cf-btn {
    padding: 7px 14px;
    font-size: 13px;
    color: #ddd;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 5px;
    cursor: pointer;

    &:hover {
        background: rgba(255, 255, 255, 0.14);
    }

    &.primary {
        color: #fff;
        background: #3b6ea5;
        border-color: #3b6ea5;

        &:hover {
            background: #4680bd;
        }
    }
}
</style>
