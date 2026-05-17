<template>
  <view class="nav-bar-fixed" :style="containerStyle">
    <view class="nav-bar-content" :style="contentStyle">
      <view class="nav-bar-left" :style="leftSlotStyle">
        <slot name="left">
          <view v-if="showBack" class="nav-bar-back" @click="onBack">
            <!-- <text class="nav-bar-back-icon">‹</text> -->
            <up-icon name="arrow-left" size="16"></up-icon>
          </view>
        </slot>
      </view>
      <view class="nav-bar-center">
        <slot>
          <text class="nav-bar-title">{{ title }}</text>
        </slot>
      </view>
      <view class="nav-bar-right" :style="rightSlotStyle">
        <slot name="right" />
      </view>
    </view>
  </view>
  <view :style="placeholderStyle" />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useWxCapsuleRect } from '@/hooks/useWxCapsuleRect';

interface Props {
  title?: string;
  showBack?: boolean;
  bgColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  showBack: false,
  bgColor: '#ffffff',
});

const { statusBarHeight, navBarHeight, rect, capsuleRightSpace, update } =
  useWxCapsuleRect();

onMounted(() => update());
onShow(() => update());

const totalHeight = computed(() => statusBarHeight.value + navBarHeight.value);

const containerStyle = computed(() => ({
  height: `${totalHeight.value}px`,
  backgroundColor: props.bgColor,
}));

const contentStyle = computed(() => ({
  paddingTop: `${statusBarHeight.value}px`,
  height: `${navBarHeight.value}px`,
}));

const rightSlotStyle = computed(() => {
  if (!rect.value) return {} as Record<string, string>;
  return { paddingRight: `${capsuleRightSpace.value}px` };
});

const leftSlotStyle = computed(() => ({
  paddingLeft: '12px',
}));

const placeholderStyle = computed(() => ({
  height: `${totalHeight.value}px`,
}));

function onBack() {
  uni.navigateBack();
}
</script>

<style lang="scss" scoped>
.nav-bar-fixed {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 999;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.04);
}
.nav-bar-content {
  display: flex;
  align-items: center;
}
.nav-bar-left,
.nav-bar-right {
  display: flex;
  align-items: center;
  min-width: 80rpx;
}
.nav-bar-center {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}
.nav-bar-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1f2937;
}
.nav-bar-back {
  width: 60rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.nav-bar-back-icon {
  font-size: 48rpx;
  color: #1f2937;
  line-height: 1;
}
</style>
