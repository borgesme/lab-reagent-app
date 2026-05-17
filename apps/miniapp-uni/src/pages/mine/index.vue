<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.mine')" />
    <view class="content p-24">
      <view v-if="user" class="card user-card">
        <text class="user-name block">{{ user.name }}</text>
        <text class="user-email block">{{ user.email }}</text>
        <text class="user-roles block">{{ rolesLabel }}</text>
      </view>
      <view v-else class="card">
        <text class="text-muted">{{ $t('toast.loginFirst') }}</text>
        <view class="mt-16">
          <u-button type="primary" :text="$t('common.login')" @click="goLogin" />
        </view>
      </view>

      <view v-if="user" class="mt-16 cell-card">
        <u-cell-group :border="false">
          <u-cell
            :title="$t('mine.editProfile')"
            isLink
            @click="openEditProfile"
          />
          <u-cell
            :title="$t('mine.changePassword')"
            isLink
            @click="openChangePassword"
          />
          <u-cell
            :title="$t('mine.language')"
            :value="localeLabel"
            isLink
            @click="languageShow = true"
          />
          <u-cell
            :title="$t('mine.about')"
            isLink
            @click="aboutShow = true"
          />
        </u-cell-group>
      </view>

      <view v-if="user" class="mt-32">
        <u-button
          type="error"
          :text="$t('common.logout')"
          @click="logoutShow = true"
        />
      </view>
    </view>
    <TabBar :current="4" />
    <CustomBottomArea />

    <u-popup
      :show="editProfileShow"
      mode="bottom"
      :round="16"
      :safeAreaInsetBottom="true"
      @close="editProfileShow = false"
    >
      <view class="popup-body">
        <text class="popup-title">{{ $t('mine.editProfile') }}</text>
        <u-form labelPosition="top" :model="profileForm" class="mt-16">
          <u-form-item :label="$t('form.name')">
            <u-input
              v-model="profileForm.name"
              :placeholder="$t('form.name')"
            />
          </u-form-item>
        </u-form>
        <view class="popup-actions">
          <u-button
            :text="$t('common.cancel')"
            @click="editProfileShow = false"
          />
          <u-button
            type="primary"
            :text="$t('common.save')"
            :loading="saving"
            @click="saveProfile"
          />
        </view>
      </view>
    </u-popup>

    <u-popup
      :show="changePassShow"
      mode="bottom"
      :round="16"
      :safeAreaInsetBottom="true"
      @close="changePassShow = false"
    >
      <view class="popup-body">
        <text class="popup-title">{{ $t('mine.changePassword') }}</text>
        <u-form labelPosition="top" :model="passwordForm" labelWidth="auto" class="mt-16">
          <u-form-item :label="$t('form.oldPassword')">
            <u-input
              v-model="passwordForm.oldPassword"
              type="password"
              :placeholder="$t('form.oldPassword')"
            />
          </u-form-item>
          <u-form-item :label="$t('form.newPassword')">
            <u-input
              v-model="passwordForm.newPassword"
              type="password"
              :placeholder="$t('form.newPassword')"
            />
          </u-form-item>
          <u-form-item :label="$t('form.confirmPassword')">
            <u-input
              v-model="passwordForm.confirmPassword"
              type="password"
              :placeholder="$t('form.confirmPassword')"
            />
          </u-form-item>
        </u-form>
        <view class="popup-actions">
          <u-button
            :text="$t('common.cancel')"
            @click="changePassShow = false"
          />
          <u-button
            type="primary"
            :text="$t('common.save')"
            :loading="saving"
            @click="savePassword"
          />
        </view>
      </view>
    </u-popup>

    <u-action-sheet
      :show="languageShow"
      :actions="languageActions"
      :cancelText="$t('common.cancel')"
      @select="onLocaleSelect"
      @close="languageShow = false"
    />

    <u-modal
      :show="aboutShow"
      :title="$t('mine.about')"
      :content="$t('mine.aboutContent')"
      :showCancelButton="false"
      @confirm="aboutShow = false"
    />

    <u-modal
      :show="logoutShow"
      :title="$t('common.logout')"
      :content="$t('mine.confirmLogout')"
      :showCancelButton="true"
      @confirm="confirmLogout"
      @cancel="logoutShow = false"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import NavBar from '@/components/nav-bar/nav-bar.vue';
import TabBar from '@/components/tab-bar/tab-bar.vue';
import CustomBottomArea from '@/components/custom-bottom-area/custom-bottom-area.vue';
import { useAuth } from '@/stores/auth';
import { i18n, setLocale, type LocaleKey } from '@/locale';
import * as authApi from '@/api/modules/auth';

const auth = useAuth();
const user = computed(() => auth.user);
const rolesLabel = computed(() => (user.value?.roles ?? []).join(' / ') || '—');

const localeLabel = computed(() =>
  (i18n.global.locale as any).value === 'en' ? 'English' : '简体中文',
);

const editProfileShow = ref(false);
const changePassShow = ref(false);
const languageShow = ref(false);
const aboutShow = ref(false);
const logoutShow = ref(false);
const saving = ref(false);

const profileForm = reactive({ name: '' });
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const languageActions = computed(() => [
  { name: '简体中文', locale: 'zh-CN' as LocaleKey },
  { name: 'English', locale: 'en' as LocaleKey },
]);

function openEditProfile() {
  profileForm.name = user.value?.name ?? '';
  editProfileShow.value = true;
}

function openChangePassword() {
  passwordForm.oldPassword = '';
  passwordForm.newPassword = '';
  passwordForm.confirmPassword = '';
  changePassShow.value = true;
}

async function saveProfile() {
  if (!profileForm.name.trim()) {
    uni.showToast({ title: i18n.global.t('form.name'), icon: 'none' });
    return;
  }
  saving.value = true;
  try {
    const updated = await authApi.updateMe({ name: profileForm.name.trim() });
    auth.setUser(updated as any);
    uni.showToast({
      title: i18n.global.t('toast.success'),
      icon: 'success',
    });
    editProfileShow.value = false;
  } catch {
    /* 401 已 toast */
  } finally {
    saving.value = false;
  }
}

async function savePassword() {
  if (
    !passwordForm.oldPassword ||
    !passwordForm.newPassword ||
    !passwordForm.confirmPassword
  ) {
    return;
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    uni.showToast({
      title: i18n.global.t('form.passwordMismatch'),
      icon: 'none',
    });
    return;
  }
  saving.value = true;
  try {
    await authApi.changePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    });
    uni.showToast({
      title: i18n.global.t('form.passwordChanged'),
      icon: 'success',
    });
    changePassShow.value = false;
  } catch {
    /* 401 已 toast */
  } finally {
    saving.value = false;
  }
}

function onLocaleSelect(item: { locale: LocaleKey }) {
  setLocale(item.locale);
  languageShow.value = false;
}

function confirmLogout() {
  auth.clear();
  logoutShow.value = false;
  uni.reLaunch({ url: '/pages/login/index' });
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}
</script>

<style lang="scss" scoped>
@import '@/styles/tokens.scss';
.page {
  min-height: 100vh;
  background: $mp-color-bg;
  padding-bottom: 120rpx;
}
.card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-4; // mine 头部 user-card 保留 32rpx
}
.user-card {
  background: linear-gradient(
    135deg,
    $mp-color-primary 0%,
    $mp-color-primary-dark 100%
  );
  color: #fff;
}
.user-name {
  font-size: $mp-text-xl;
  font-weight: bold;
  color: #fff;
}
.user-email {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-base;
  color: rgba(255, 255, 255, 0.85);
}
.user-roles {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-sm;
  color: rgba(255, 255, 255, 0.75);
}
.cell-card {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  overflow: hidden;
}
.block {
  display: block;
}
.popup-body {
  padding: $mp-spacing-4;
}
.popup-title {
  font-size: $mp-text-md;
  font-weight: 600;
  color: $mp-color-text-primary;
}
.popup-actions {
  display: flex;
  gap: $mp-spacing-2;
  margin-top: $mp-spacing-4;
}
.popup-actions :deep(.u-button) {
  flex: 1;
}
</style>
