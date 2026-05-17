<template>
  <view class="skeleton-list">
    <view v-for="i in count" :key="i" class="skeleton-card">
      <u-skeleton
        :loading="true"
        :animate="true"
        :rows="rows"
        :title="showTitle"
        :avatar="showAvatar"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
interface Props {
  count?: number;
  rows?: number;
  showTitle?: boolean;
  showAvatar?: boolean;
}
withDefaults(defineProps<Props>(), {
  count: 3,
  rows: 2,
  showTitle: true,
  showAvatar: false,
});
</script>

<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.skeleton-card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3;
  margin-top: $mp-spacing-2;
  &:first-child {
    margin-top: 0;
  }
}
</style>
