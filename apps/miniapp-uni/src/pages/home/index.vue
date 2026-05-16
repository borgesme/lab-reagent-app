<template>
  <view class="home p-32">
    <text class="title">miniapp-uni 占位首页</text>
    <view class="mt-32">
      <u-button type="primary" :text="$t('spike.hello')" @click="onTap" />
    </view>
    <view class="mt-16">
      <u-button :text="'env: ' + appEnv" @click="toggleLocale" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { env } from '@/config/env';

const { locale } = useI18n();
const appEnv = env.appEnv;

function onTap() {
  uni.showToast({ title: 'OK', icon: 'success' });
}

function toggleLocale() {
  locale.value = locale.value === 'zh-CN' ? 'en' : 'zh-CN';
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
