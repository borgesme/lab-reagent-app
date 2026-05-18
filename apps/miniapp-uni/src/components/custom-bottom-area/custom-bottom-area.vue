<template>
  <view class="custom-bottom-area" :style="style" />
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';

interface Props {
  bgColor?: string;
}
const props = withDefaults(defineProps<Props>(), {
  bgColor: 'transparent',
});

const safeBottom = ref(0);

onMounted(() => {
  try {
    const insets = uni.getWindowInfo().safeAreaInsets;
    safeBottom.value = insets?.bottom ?? 0;
  } catch {
    safeBottom.value = 0;
  }
});

const style = computed(() => ({
  height: safeBottom.value === 0 ? '0' : `${safeBottom.value * 2}rpx`,
  backgroundColor: props.bgColor,
}));
</script>

<style lang="scss" scoped>
.custom-bottom-area {
  width: 100%;
}
</style>
