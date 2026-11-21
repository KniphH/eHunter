<template>
<div class="switch" @click="emit('change', !active)">
    <div :class="{ 'track': true, active }"></div>
    <div :class="{ 'thumb': true, active }"></div>
</div>
</template>

<script setup lang="ts">
const props = defineProps<{
  active: boolean
}>()

const emit = defineEmits(['change'])
</script>

<style lang="scss" scoped>
@import "../../style/_responsive";
@import "../../style/_variables";

* div {
    display: flex;
}
.switch {
    /* 宿主站点（Bootstrap 等）会改 input/div 的盒模型与间距，开关会被推偏。
       18comic 上就出现了「滑块跑到轨道外面」的错位，这里把尺寸和定位钉死。 */
    width: 28px !important;
    min-width: 28px !important;
    max-width: 28px !important;
    height: 20px !important;
    flex: 0 0 auto !important;
    margin: auto 15px !important;
    padding: 0 !important;
    position: relative !important;
    box-sizing: content-box !important;
    cursor: pointer;
    > .track {
        height: 14px !important;
        width: 100% !important;
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 0 !important;
        border-radius: 30px;
        background: $switch_track_disabled_color;
        transition: all .45s cubic-bezier(.23,1,.32,1);
        &.active {
           background: $switch_track_enabled_color;
        }
    }
    > .thumb {
        position: absolute !important;
        width: 20px !important;
        height: 20px !important;
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        background: $switch_thumb_disabled_color;
        border-radius: 50%;
        transition: all 0.45s cubic-bezier(.23,1,.32,1);
        left: 0;
        top: 50%;
        transform: translate(-50%, -50%);
        box-shadow: 0 1px 6px rgba(0,0,0,.117647), 0 1px 4px rgba(0,0,0,.117647);
        &.active {
            background: $switch_thumb_enabled_color;
            left: 100%;
        }
    }
}
</style>