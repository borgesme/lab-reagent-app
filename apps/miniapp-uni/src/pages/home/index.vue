<template>
  <view class="home p-32">
    <text class="title">{{ $t('pageTitle.home') }}</text>

    <view v-if="user" class="mt-32 card">
      <text class="text-primary">{{ user.name }}</text>
      <text class="text-muted mt-8 block">{{ user.email }}</text>
      <view class="mt-16">
        <u-button type="primary" :text="'调用 auth.me()'" @click="refreshMe" />
      </view>
      <view class="mt-16">
        <u-button :text="$t('common.logout')" @click="logout" />
      </view>
    </view>

    <view v-else class="mt-32 card">
      <u-form labelPosition="top">
        <u-form-item label="Email">
          <u-input v-model="form.email" placeholder="admin@lab.local" />
        </u-form-item>
        <u-form-item label="Password">
          <u-input v-model="form.password" type="password" placeholder="admin123" />
        </u-form-item>
      </u-form>
      <view class="mt-16">
        <u-button
          type="primary"
          :text="$t('common.login')"
          :loading="loading"
          @click="onLogin"
        />
      </view>
    </view>

    <view class="mt-32">
      <u-button :text="'switch locale (' + locale + ')'" @click="toggleLocale" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { useAuth } from '@/stores/auth';
import { i18n, setLocale } from '@/locale';
import * as authApi from '@/api/modules/auth';

const auth = useAuth();
const user = computed(() => auth.user);

const form = reactive({ email: 'admin@lab.local', password: 'admin123' });
const loading = ref(false);

const locale = computed(() => i18n.global.locale.value);

async function onLogin() {
  loading.value = true;
  try {
    const tokens = await authApi.login(form);
    auth.setTokens(tokens);
    const u = await authApi.me();
    auth.setSession(tokens, u);
    uni.showToast({ title: i18n.global.t('toast.success'), icon: 'success' });
  } catch {
    /* api/request.ts 已 toast */
  } finally {
    loading.value = false;
  }
}

async function refreshMe() {
  try {
    const u = await authApi.me();
    auth.setUser(u);
  } catch {
    /* api/request.ts 已 toast */
  }
}

function logout() {
  auth.clear();
  uni.showToast({ title: i18n.global.t('toast.success'), icon: 'success' });
}

function toggleLocale() {
  setLocale(locale.value === 'zh-CN' ? 'en' : 'zh-CN');
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
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
}
.block {
  display: block;
}
</style>
