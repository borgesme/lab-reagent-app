<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.mine')" />
    <view class="content p-32">
      <view v-if="user" class="card">
        <text class="text-primary block">{{ user.name }}</text>
        <text class="text-muted mt-8 block">{{ user.email }}</text>
      </view>
      <view v-else class="card">
        <text class="text-muted">{{ $t('toast.loginFirst') }}</text>
      </view>
      <view v-if="user" class="mt-32 card">
        <u-button :text="$t('common.logout')" @click="logout" />
      </view>
      <view class="mt-32 hint">
        <text class="text-muted">mine 页正式版留 plan D（含改密、语言切换、报表入口等）</text>
      </view>
    </view>
    <TabBar :current="4" />
    <CustomBottomArea />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import NavBar from '@/components/nav-bar/nav-bar.vue';
import TabBar from '@/components/tab-bar/tab-bar.vue';
import CustomBottomArea from '@/components/custom-bottom-area/custom-bottom-area.vue';
import { useAuth } from '@/stores/auth';

const auth = useAuth();
const user = computed(() => auth.user);

function logout() {
  auth.clear();
  uni.reLaunch({ url: '/pages/login/index' });
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: 120rpx;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
}
.block {
  display: block;
}
.hint {
  text-align: center;
}
</style>
