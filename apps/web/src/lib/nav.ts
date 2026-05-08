import type { RoleCode, ReportType } from '@app/shared';
import { REPORT_SCOPE_MATRIX } from '@app/shared';

export type IconName =
  | 'LayoutDashboard'
  | 'FlaskConical'
  | 'FileText'
  | 'ShoppingCart'
  | 'CheckSquare'
  | 'Users'
  | 'Beaker'
  | 'KeyRound'
  | 'Boxes'
  | 'PackageOpen'
  | 'BookText'
  | 'Truck'
  | 'BellRing'
  | 'ClipboardList'
  | 'TrendingUp'
  | 'Package'
  | 'BarChart3'
  | 'ShieldAlert';

export interface NavItem {
  href: string;
  icon: IconName;
  label: string;
  /** '*' 即所有登录用户可见；数组按 OR 匹配 */
  roles: '*' | RoleCode[];
  /** 仅报表项使用：当其 reportType 在 REPORT_SCOPE_MATRIX[role] 为 null 时该角色不可见 */
  reportType?: ReportType;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: '工作台',
    items: [
      { href: '/', icon: 'LayoutDashboard', label: '首页', roles: '*' },
    ],
  },
  {
    label: '业务',
    items: [
      { href: '/reagents', icon: 'FlaskConical', label: '试剂百科', roles: '*' },
      { href: '/my/requests', icon: 'FileText', label: '我的申请', roles: '*' },
      { href: '/my/purchases', icon: 'ShoppingCart', label: '我的采购', roles: '*' },
      {
        href: '/approvals',
        icon: 'CheckSquare',
        label: '审批',
        roles: ['LAB_HEAD', 'SAFETY_OFFICER', 'SYS_ADMIN'],
      },
    ],
  },
  {
    label: '管理',
    items: [
      { href: '/admin/users', icon: 'Users', label: '用户', roles: ['SYS_ADMIN'] },
      { href: '/admin/labs', icon: 'Beaker', label: '实验室', roles: ['SYS_ADMIN'] },
      { href: '/admin/roles', icon: 'KeyRound', label: '角色权限', roles: ['SYS_ADMIN'] },
      { href: '/admin/stocks', icon: 'Boxes', label: '库存', roles: ['SYS_ADMIN', 'REAGENT_ADMIN'] },
      { href: '/admin/issues', icon: 'PackageOpen', label: '发放', roles: ['SYS_ADMIN', 'REAGENT_ADMIN'] },
      { href: '/admin/ledger', icon: 'BookText', label: '台账', roles: ['SYS_ADMIN', 'REAGENT_ADMIN'] },
      { href: '/admin/purchases', icon: 'Truck', label: '采购管理', roles: ['SYS_ADMIN', 'REAGENT_ADMIN'] },
      { href: '/admin/alerts/config', icon: 'BellRing', label: '预警配置', roles: ['SYS_ADMIN'] },
      {
        href: '/approvals/purchases',
        icon: 'ClipboardList',
        label: '采购审批',
        roles: ['LAB_HEAD', 'SYS_ADMIN'],
      },
    ],
  },
  {
    label: '报表',
    items: [
      { href: '/reports/usage-trend', icon: 'TrendingUp', label: '领用趋势', roles: '*', reportType: 'usage-trend' },
      { href: '/reports/inventory-turnover', icon: 'Package', label: '库存周转', roles: '*', reportType: 'inventory-turnover' },
      { href: '/reports/purchase-amount', icon: 'BarChart3', label: '采购金额', roles: '*', reportType: 'purchase-amount' },
      { href: '/reports/controlled-audit', icon: 'ShieldAlert', label: '管控审计', roles: '*', reportType: 'controlled-audit' },
    ],
  },
];

function itemAllowed(item: NavItem, roles: RoleCode[]): boolean {
  if (item.reportType) {
    return roles.some(
      (r) => REPORT_SCOPE_MATRIX[r]?.[item.reportType!] != null,
    );
  }
  if (item.roles === '*') return true;
  return item.roles.some((r) => roles.includes(r));
}

export function filterNavByRoles(nav: NavGroup[], roles: RoleCode[]): NavGroup[] {
  return nav
    .map((g) => ({ ...g, items: g.items.filter((i) => itemAllowed(i, roles)) }))
    .filter((g) => g.items.length > 0);
}

/** 平铺所有项，给 Breadcrumb 反查用 */
export function flatNavItems(nav: NavGroup[] = NAV): Array<NavItem & { groupLabel: string }> {
  return nav.flatMap((g) => g.items.map((i) => ({ ...i, groupLabel: g.label })));
}
