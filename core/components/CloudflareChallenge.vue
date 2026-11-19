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
            <p class="cf-fallback">{{ i18n.cfFallback }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { i18n } from '../store/i18n'
import { store } from '../store/app'
import { challengeState, closeCloudflareChallenge } from '../store/challenge'
import { CHALLENGE_FRAME_NAME, CHALLENGE_SELECTOR, isCloudflareChallengeTitle } from '../../src/platform/cloudflare'

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
    if (!doc) {
        return
    }
    /*
     * 主判据是**挑战标志物还在不在**，不是标题。
     * 验证页里一定有一个指向 challenges.cloudflare.com 的 iframe 和一个
     * name="cf-turnstile-response" 的隐藏 input（见 src/platform/cloudflare.ts
     * 的 CHALLENGE_SELECTOR）。用户点完勾选后 Cloudflare 整页跳转到真实内容，
     * 这些节点就没了 —— 那一刻才算通过。
     */
    if (doc.querySelector(CHALLENGE_SELECTOR) || isCloudflareChallengeTitle(doc.title || '')) {
        return
    }
    // 标志没了还要有正文，跳过中间的空跳转页
    if ((doc.body?.innerText || '').length < 120) {
        return
    }
    pass()
}

/** iframe 主文档加载了几次（子资源加载不会触发这个） */
let frameLoadCount = 0

/**
 * iframe 加载完成的判定。
 *
 * 主判据是**加载次数**，不读文档内容：
 * 第一次加载是 Cloudflare 的挑战页；用户点完勾选后，Cloudflare 会把它
 * 跳转回真实页面，于是出现第二次 load。这一刻就可以收工了——
 * 读 contentDocument 在真机上并不可靠（沙箱/跨域一律拿不到，等于永远等不到）。
 *
 * 不能用「加载完 N 秒就收」这种兜底：读不到文档时无从判断是不是挑战页，
 * 一刀切会把还在验证中的用户直接踹出去。只认确定信号——
 * 加载次数到 2，或者能读到标题且已经不是挑战页。
 */
function onFrameLoad(): void {
    frameLoadCount += 1
    if (frameLoadCount >= 2) {
        pass()
        return
    }
    checkFrame()
}

function pass(): void {
    if (challengeState.passed) {
        return
    }
    stopWatching()
    challengeState.passed = true
    // 收起弹层，让失败的图片各自重试；不刷新页面
    window.setTimeout(finish, 400)
}

function startWatching(): void {
    stopWatching()
    timedOut.value = false
    pollTimer = window.setInterval(checkFrame, 800)
    timeoutTimer = window.setTimeout(() => {
        timedOut.value = true
    }, 60000)
}

/**
 * 验证通过后**不刷新页面**。
 *
 * 每个图片页本来就有失败重试机制，这里只要递一个令牌，让失败的那些立刻重来一次。
 * 刷新整页既没必要，又会在请求仍被拒时再次触发验证层，来回循环直到把站点打成频率限制。
 */
function finish(): void {
    store.retryAllToken += 1
    closeCloudflareChallenge()
}

function dismiss(): void {
    stopWatching()
    closeCloudflareChallenge()
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

.cf-fallback {
    margin: 0;
    padding: 10px 16px 14px;
    font-size: 12px;
    line-height: 1.5;
    color: #8a8a90;
}
</style>
