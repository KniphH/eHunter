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
     * 状态机：必须**先看到过挑战元素**，才把「元素消失」当成验证通过。
     *
     * 关键点：验证页是脚本渲染的，iframe 刚加载的那几百毫秒里 Turnstile 的
     * 节点还没插进来。这时候查不到元素，如果直接判「通过」，弹层会在用户
     * 还没看到勾选框时就自己关掉——紧接着请求又 403，再弹一次，来回抽风。
     */
    const hasChallengeElement = Boolean(doc.querySelector(CHALLENGE_SELECTOR))
        || isCloudflareChallengeTitle(doc.title || '')
    if (hasChallengeElement) {
        sawChallengeElement = true
        return
    }
    if (!sawChallengeElement) {
        // 还没见过元素：继续等，绝不判通过
        return
    }
    // 见过元素，现在没了 —— 这才是「验证完成」
    if ((doc.body?.innerText || '').length < 120) {
        return
    }
    pass()
}

/**
 * 是否已经看到过挑战元素。
 *
 * 只有 true 之后，「元素消失」才意味着验证完成；false 期间查不到元素
 * 一律当作「还在加载」，不关闭弹层。
 */
let sawChallengeElement = false

/**
 * iframe 每次主文档加载完成（子资源不触发）。
 *
 * 这里只做一次检测，**不**因为"第二次加载"就判定通过：
 * 挑战页内部也可能跳转，直接放行同样会误关。是否通过统一交给 checkFrame
 * 的状态机判断。
 */
function onFrameLoad(): void {
    checkFrame()
    scheduleIdleCheck()
}

/**
 * 兜底：iframe 加载完 10 秒，如果从头到尾都没出现过挑战元素，
 * 说明这个地址本来就不需要验证（403 可能只是 XHR 被挑战），
 * 这时才收起来；出现过元素的情况一律等它消失。
 */
function scheduleIdleCheck(): void {
    window.setTimeout(() => {
        if (challengeState.passed || challengeState.active === false) {
            return
        }
        if (sawChallengeElement) {
            return
        }
        const frame = frameRef.value
        try {
            const doc = frame?.contentDocument
            if (doc && (doc.body?.innerText || '').length > 120 && !doc.querySelector(CHALLENGE_SELECTOR)) {
                pass()
            }
        } catch {
            // 读不到就继续挂着，宁可让用户手动关，也不要误判
        }
    }, 10000)
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
    sawChallengeElement = false
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
