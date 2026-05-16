<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.notifications')" />
    <view class="content p-32">
      <view class="card">
        <text class="text-muted">notifications 内容留 plan D</text>
      </view>
    </view>
    <TabBar :current="3" />
    <CustomBottomArea />
  </view>
</template>

<script setup lang="ts">
import NavBar from '@/components/nav-bar/nav-bar.vue';
import TabBar from '@/components/tab-bar/tab-bar.vue';
import CustomBottomArea from '@/components/custom-bottom-area/custom-bottom-area.vue';
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: #f5f5f5; padding-bottom: 120rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 32rpx; }
</style>
