<template>
  <view class="page">
    <NavBar :title="$t('pageTitle.home')" />
    <view class="content p-24">
      <view v-if="user" class="card user-card">
        <text class="user-name block">{{ user.name }}</text>
        <text class="user-email block">{{ user.email }}</text>
        <text class="user-lab block">
          {{ $t('common.unassigned') }}{{ user.labId ? ` · ${user.labId}` : '' }}
        </text>
      </view>
      <view v-else class="card">
        <text class="text-muted">{{ $t('toast.loginFirst') }}</text>
        <view class="mt-16">
          <u-button type="primary" :text="$t('common.login')" @click="goLogin" />
        </view>
      </view>

      <view v-if="user && unread > 0" class="mt-16 unread" @click="goNotifications">
        <text class="unread-text">未读消息</text>
        <u-badge :value="unread" :max="99" type="error" />
      </view>

      <view v-if="user" class="mt-32 card">
        <u-search
          v-model="keyword"
          :placeholder="$t('pageTitle.search')"
          :showAction="true"
          :actionText="$t('pageTitle.search')"
          @search="goSearch"
          @custom="goSearch"
        />
      </view>

      <view class="mt-32 entries">
        <u-cell-group>
          <u-cell
            :title="$t('pageTitle.myRequests')"
            isLink
            @click="goMyRequests"
          />
          <u-cell
            v-if="isApprover"
            :title="$t('pageTitle.approvals')"
            isLink
            @click="goApprovals"
          />
          <u-cell
            :title="$t('pageTitle.search')"
            isLink
            @click="goSearchPage"
          />
          <u-cell
            v-if="hasReportScope"
            :title="$t('pageTitle.reportSummary')"
            isLink
            @click="goReportSummary"
          />
        </u-cell-group>
      </view>
    </view>
    <TabBar :current="0" />
    <CustomBottomArea />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import NavBar from '@/components/nav-bar/nav-bar.vue';
import TabBar from '@/components/tab-bar/tab-bar.vue';
import CustomBottomArea from '@/components/custom-bottom-area/custom-bottom-area.vue';
import { useAuth } from '@/stores/auth';
import * as notificationsApi from '@/api/modules/notifications';
import {
  resolveReportScope,
  type ReportType,
  type RoleCode,
} from '@app/shared';

const auth = useAuth();
const user = computed(() => auth.user);
const keyword = ref('');
const unread = ref(0);

const APPROVER_ROLES: RoleCode[] = [
  'LAB_HEAD',
  'REAGENT_ADMIN',
  'SAFETY_OFFICER',
  'SYS_ADMIN',
];

const REPORT_TYPES: ReportType[] = [
  'usage-trend',
  'inventory-turnover',
  'purchase-amount',
  'controlled-audit',
];

const isApprover = computed(() => {
  const roles = user.value?.roles ?? [];
  return roles.some((r) => APPROVER_ROLES.includes(r));
});

const hasReportScope = computed(() => {
  const u = user.value;
  if (!u) return false;
  return REPORT_TYPES.some(
    (t) =>
      resolveReportScope(
        { id: u.id, labId: u.labId ?? null, roles: u.roles },
        t,
      ) != null,
  );
});

async function refreshUnread() {
  if (!user.value) {
    unread.value = 0;
    return;
  }
  try {
    const list = await notificationsApi.list(true);
    unread.value = list?.length ?? 0;
  } catch {
    /* 401 已 toast */
  }
}

onShow(() => refreshUnread());

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' });
}
function goMyRequests() {
  uni.reLaunch({ url: '/pages/my-requests/index' });
}
function goApprovals() {
  uni.reLaunch({ url: '/pages/approvals/index' });
}
function goSearchPage() {
  uni.navigateTo({ url: '/pages/search/index' });
}
function goReportSummary() {
  uni.navigateTo({ url: '/pages/report-summary/index' });
}
function goNotifications() {
  uni.reLaunch({ url: '/pages/notifications/index' });
}
function goSearch() {
  const q = keyword.value.trim();
  uni.navigateTo({
    url: `/pages/search/index${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  });
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
  padding: $mp-spacing-3;
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
.user-lab {
  margin-top: $mp-spacing-1;
  font-size: $mp-text-sm;
  color: rgba(255, 255, 255, 0.75);
}
.block {
  display: block;
}
.entries {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  overflow: hidden;
}
.unread {
  background: $mp-color-card;
  border-radius: $mp-radius-md;
  padding: $mp-spacing-3 $mp-spacing-4;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.unread-text {
  font-size: $mp-text-md;
}
</style>
