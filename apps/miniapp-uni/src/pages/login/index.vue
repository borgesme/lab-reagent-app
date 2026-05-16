<template>
  <view class="login p-32">
    <text class="title">登录（占位）</text>
    <view class="mt-32">
      <u-button type="primary" text="进入工作台" @click="goHome" />
    </view>
  </view>
</template>

<script setup lang="ts">
function goHome() {
  uni.reLaunch({ url: '/pages/home/index' });
}
</script>

<style lang="scss" scoped>
.login { min-height: 100vh; }
.title { font-size: 36rpx; font-weight: bold; }
</style>
