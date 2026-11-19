<template>
    <div v-if="challengeState.active" class="cf-layer">
        <div class="cf-panel">
            <header class="cf-head">
                <h3>{{ i18n.cfTitle }}</h3>
                <button type="button" class="cf-close" :title="i18n.cfClose" @click="dismiss">×</button>
            </header>

            <p class="cf-hint">{{ i18n.cfHint }}</p>

            <div class="cf-body">
                <button type="button" class="cf-open" @click="openVerifyPage">
                    {{ i18n.cfOpenExternal }}
                </button>
                <p class="cf-status" :class="{ ok: passed }">
                    <template v-if="passed">{{ i18n.cfPassed }}</template>
                    <template v-else-if="sawResult">{{ i18n.cfPollHint }}</template>
                    <template v-else>{{ i18n.cfWaiting }}</template>
                </p>
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
import { isCloudflareChallengeHtml } from '../../src/platform/cloudflare'

/**
 * 为什么不在弹层里直接嵌 iframe 让用户验证：
 *
 * Cloudflare 的 Turnstile 会检查自己是不是被嵌在别人页面里（top !== self），
 * 在 iframe 里勾选只会失败、重载回挑战页——实测永远验证不过，只有顶层窗口
 * 里的验证才会真正通过并写下 cf_clearance。
 *
 * 所以这里改成：按钮开一个新标签让用户验证，弹层留在原地，定时探测目标地址
 * 是否已经能正常返回，通了就自动收起并让失败的图片重试。
 */

const passed = ref(false)
/** 已经探测过至少一次，用来区分「刚开始」和「一直在等」 */
const sawResult = ref(false)

let probeTimer = 0
let probeDeadline = 0
/**
 * 探测真正开始判定的时间。
 *
 * 用户在弹层里什么都不做时不该探测：GM 请求和浏览器的请求特征不同，Cloudflare
 * 可能压根不挑战它，一探就是 200，弹层会立刻自己关掉、接着又被 403 重开。
 * 所以只有点了「打开验证页面」之后才开始，并且先留几秒给用户在新标签里操作。
 */
let probeStartAt = 0

const PROBE_INTERVAL_MS = 3000
/** 最多探测这么久就停（5 分钟），避免长期挂着打请求 */
const PROBE_MAX_MS = 5 * 60 * 1000

function stopProbing(): void {
    if (probeTimer) {
        window.clearInterval(probeTimer)
        probeTimer = 0
    }
}

/**
 * 探一下目标地址现在能不能正常打开。
 *
 * 用户在新标签完成验证后，cf_clearance 写在同一个域名下，这边再请求拿到的
 * 就不是挑战页了。用 GM 请求而不是 fetch：能拿到完整响应体判断，也不受页面
 * 跨域策略影响。
 */
function probe(): Promise<boolean> {
    return new Promise(resolve => {
        const request = (globalThis as any).GM_xmlhttpRequest
        if (typeof request !== 'function') {
            resolve(false)
            return
        }
        request({
            method: 'GET',
            url: challengeState.url,
            timeout: 8000,
            onload: (res: any) => {
                if (res.status !== 200) {
                    resolve(false)
                    return
                }
                const body = String(res.responseText || '')
                resolve(body.length > 0 && !isCloudflareChallengeHtml(body))
            },
            onerror: () => resolve(false),
            ontimeout: () => resolve(false),
        })
    })
}

async function tick(): Promise<void> {
    if (challengeState.passed || !challengeState.active) {
        stopProbing()
        return
    }
    if (Date.now() < probeStartAt) {
        return
    }
    if (Date.now() < probeStartAt) {
        return
    }
    if (Date.now() > probeDeadline) {
        stopProbing()
        return
    }
    const ok = await probe()
    sawResult.value = true
    if (!ok) {
        return
    }
    stopProbing()
    passed.value = true
    challengeState.passed = true
    // 验证通过：让失败的图片各自重试，不刷新页面
    window.setTimeout(() => {
        store.retryAllToken += 1
        closeCloudflareChallenge()
    }, 600)
}

function startProbing(): void {
    stopProbing()
    passed.value = false
    sawResult.value = false
    probeStartAt = Date.now() + 5000
    probeDeadline = Date.now() + PROBE_MAX_MS
    probeTimer = window.setInterval(() => {
        void tick()
    }, PROBE_INTERVAL_MS)
    void tick()
}

/**
 * 必须由用户点击触发：浏览器会拦截非手势的 window.open。
 * 点过之后才开始探测——用户没打算验证时不探测，避免误判。
 */
function openVerifyPage(): void {
    window.open(challengeState.url, '_blank', 'noopener,width=980,height=760')
    startProbing()
}

function dismiss(): void {
    stopProbing()
    closeCloudflareChallenge()
}

watch(
    () => challengeState.active,
    (active) => {
        if (active) {
            // 只是重置显示状态；探测要等用户点按钮才开始
            stopProbing()
            passed.value = false
            sawResult.value = false
        } else {
            stopProbing()
        }
    },
    { immediate: true },
)

onBeforeUnmount(stopProbing)
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
    width: min(460px, 100%);
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
    line-height: 1.55;
    color: #b6b6bb;
}

.cf-body {
    margin: 0 16px;
    padding: 14px 16px;
    background: #1b1b1d;
    border-radius: 6px;
    text-align: center;
}

.cf-open {
    width: 100%;
    padding: 11px 16px;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    background: #3b6ea5;
    border: none;
    border-radius: 5px;
    cursor: pointer;

    &:hover {
        background: #4680bd;
    }
}

.cf-status {
    margin: 10px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: #8a8a90;

    &.ok {
        color: #6fbf73;
    }
}

.cf-fallback {
    margin: 0;
    padding: 10px 16px 14px;
    font-size: 12px;
    line-height: 1.5;
    color: #7d7d83;
}
</style>
