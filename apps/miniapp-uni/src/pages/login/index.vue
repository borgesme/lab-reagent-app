<template>
  <view class="page">
    <NavBar :title="$t('common.login')" />
    <view class="content p-32">
      <view class="card">
        <u-form labelPosition="top">
          <u-form-item :label="$t('form.email')">
            <u-input v-model="form.email" placeholder="admin@lab.local" />
          </u-form-item>
          <u-form-item :label="$t('form.password')">
            <u-input
              v-model="form.password"
              type="password"
              placeholder="admin123"
            />
          </u-form-item>
        </u-form>
        <view class="mt-32">
          <u-button
            type="primary"
            :text="$t('common.login')"
            :loading="loading"
            @click="onLogin"
          />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import NavBar from '@/components/nav-bar/nav-bar.vue';
import { useAuth } from '@/stores/auth';
import { i18n } from '@/locale';
import * as authApi from '@/api/modules/auth';

const auth = useAuth();
const form = reactive({ email: 'admin@lab.local', password: 'admin123' });
const loading = ref(false);

async function onLogin() {
  loading.value = true;
  try {
    const tokens = await authApi.login(form);
    auth.setTokens(tokens);
    const u = await authApi.me();
    auth.setSession(tokens, u);
    uni.showToast({ title: i18n.global.t('toast.success'), icon: 'success' });
    setTimeout(() => uni.navigateTo({ url: '/pages/home/index' }), 300);
  } catch {
    /* api/request.ts 已 toast */
  } finally {
    loading.value = false;
  }
}
</script>

<style lang="scss" scoped>
.page {
  min-height: 100vh;
  background: #f5f5f5;
}
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
}
</style>
