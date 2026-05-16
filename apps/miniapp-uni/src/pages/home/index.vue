<template>
  <view class="home p-32">
    <text class="title">miniapp-uni 占位首页</text>
    <view class="mt-32">
      <u-button type="primary" :text="$t ? 'Primary 按钮' : '主按钮'" @click="onTap" />
    </view>
    <view class="mt-16">
      <u-button :text="'env: ' + appEnv" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { env } from '@/config/env';

const appEnv = env.appEnv;

function onTap() {
  uni.showToast({ title: 'OK', icon: 'success' });
}
</script>

<style lang="scss" scoped>
.home {
  min-height: 100vh;
}
.title {
  font-size: 36rpx;
  font-weight: bold;
}
</style>
