<template>
  <u-navbar
    v-bind="$attrs"
    :title="title"
    :bg-color="bgColor"
    :fixed="fixed"
    :placeholder="placeholder"
    :safe-area-inset-top="safeAreaInsetTop"
    :title-style="titleStyle"
    :left-icon="showBack ? 'arrow-left' : ''"
    :auto-back="showBack"
  >
    <template #right>
      <view class="nav-bar-right" :style="rightStyle">
        <slot name="right" />
      </view>
    </template>
  </u-navbar>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useWxCapsuleRect } from '@/hooks/useWxCapsuleRect';

interface Props {
  title?: string;
  bgColor?: string;
  placeholder?: boolean;
  fixed?: boolean;
  safeAreaInsetTop?: boolean;
  showBack?: boolean;
  titleStyle?: string | object;
}

withDefaults(defineProps<Props>(), {
  title: '',
  bgColor: '#ffffff',
  placeholder: true,
  fixed: true,
  safeAreaInsetTop: true,
  showBack: false,
  titleStyle: () => ({
    fontSize: '32rpx',
    fontWeight: 600,
    color: '#1f2937',
  })
});

const { capsuleRightSpace, update } = useWxCapsuleRect();

onMounted(() => update());
onShow(() => update());

const rightStyle = computed(() => {
  if (!capsuleRightSpace.value) return {};
  return { paddingRight: `${capsuleRightSpace.value}px` };
});
</script>

<style lang="scss" scoped></style>
