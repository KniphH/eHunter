<template>
    <div v-if="challengeState.active" class="cf-layer">
        <div class="cf-panel">
            <header class="cf-head">
                <h3>{{ i18n.cfTitle }}</h3>
                <button type="button" class="cf-close" :title="i18n.cfClose" @click="dismiss">×</button>
            </header>

            <p class="cf-hint" :class="{ ok: challengeState.passed }">
                <template v-if="challengeState.passed">{{ i18n.cfPassed }}</template>
                <template v-else>{{ i18n.cfHint }}</template>
            </p>

            <p class="cf-fallback">{{ i18n.cfFallback }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { i18n } from '../store/i18n'
import { challengeState, dismissChallenge } from '../store/challenge'

/**
 * 只做提示，不做交互。
 *
 * 真正的验证页是自动弹出的**顶层**标签页（见 store/challenge.ts）：
 * Cloudflare 的 Turnstile 不允许在 iframe 里完成，只有顶层窗口才有效。
 * 那边验证通过后，这边探测到就自己收起，用户不需要点任何按钮。
 */
function dismiss(): void {
    dismissChallenge()
}
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
    width: min(420px, 100%);
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
    padding: 14px 16px 8px;

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
    margin: 0 16px;
    padding: 12px 14px;
    font-size: 13px;
    line-height: 1.6;
    color: #c8c8cd;
    background: #1b1b1d;
    border-radius: 6px;

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
