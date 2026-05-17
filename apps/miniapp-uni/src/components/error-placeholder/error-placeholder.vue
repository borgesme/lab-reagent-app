<template>
  <view class="error-placeholder">
    <text class="error-icon">⚠</text>
    <text class="error-text block">
      {{ message || $t('toast.requestFailed') }}
    </text>
    <view class="retry-wrap">
      <u-button
        size="mini"
        :text="$t('common.retry')"
        @click="$emit('retry')"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
interface Props {
  message?: string;
}
defineProps<Props>();
defineEmits<{ retry: [] }>();
</script>

<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.error-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $mp-spacing-6 0;
}
.error-icon {
  font-size: $mp-text-2xl;
  color: $mp-color-error;
}
.error-text {
  margin-top: $mp-spacing-2;
  font-size: $mp-text-base;
  color: $mp-color-text-tertiary;
}
.retry-wrap {
  margin-top: $mp-spacing-2;
}
.block {
  display: block;
}
</style>
