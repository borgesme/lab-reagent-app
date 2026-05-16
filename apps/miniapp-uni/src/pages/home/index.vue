<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.home')" />
    <view class="content p-32">
      <view v-if="user" class="card">
        <text class="text-primary block">{{ user.name }}</text>
        <text class="text-muted mt-8 block">{{ user.email }}</text>
      </view>
      <view v-else class="card">
        <text class="text-muted">{{ $t('toast.loginFirst') }}</text>
        <view class="mt-16">
          <u-button type="primary" :text="$t('common.login')" @click="goLogin" />
        </view>
      </view>
      <view class="mt-32 entries">
        <u-cell-group>
          <u-cell :title="$t('tabBar.myRequests')" isLink @click="goMyRequests" />
          <u-cell :title="$t('tabBar.approvals')" isLink @click="goApprovals" />
        </u-cell-group>
      </view>
    </view>
    <TabBar :current="0" />
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

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}
function goMyRequests() {
  uni.switchTab({ url: '/pages/my-requests/index' });
}
function goApprovals() {
  uni.switchTab({ url: '/pages/approvals/index' });
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
.entries {
  background: #fff;
  border-radius: 16rpx;
  overflow: hidden;
}
</style>
