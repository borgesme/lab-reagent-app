import { describe, it, expect } from 'vitest';
import { NAV, filterNavByRoles } from '../nav';
import type { RoleCode } from '@app/shared';

describe('NAV', () => {
  it('contains 4 top-level groups (工作台/业务/管理/报表)', () => {
    expect(NAV.map((g) => g.label)).toEqual(['工作台', '业务', '管理', '报表']);
  });

  it('报表 group has 4 reports with exact e2e-locked labels', () => {
    const reports = NAV.find((g) => g.label === '报表')!;
    expect(reports.items.map((i) => i.label)).toEqual([
      '领用趋势',
      '库存周转',
      '采购金额',
      '管控审计',
    ]);
  });
});

describe('filterNavByRoles', () => {
  it('PLAIN_USER sees 工作台 + 业务 (excluding 审批) + 报表 (only 领用趋势)', () => {
    const filtered = filterNavByRoles(NAV, ['PLAIN_USER'] as RoleCode[]);
    const labels = filtered.map((g) => g.label);
    expect(labels).toContain('工作台');
    expect(labels).toContain('业务');
    expect(labels).not.toContain('管理');

    const biz = filtered.find((g) => g.label === '业务')!;
    expect(biz.items.map((i) => i.label)).not.toContain('审批');

    const reports = filtered.find((g) => g.label === '报表')!;
    expect(reports.items.map((i) => i.label)).toEqual(['领用趋势']);
  });

  it('SYS_ADMIN sees all 4 groups + all 4 reports', () => {
    const filtered = filterNavByRoles(NAV, ['SYS_ADMIN'] as RoleCode[]);
    expect(filtered.map((g) => g.label)).toEqual(['工作台', '业务', '管理', '报表']);
    const reports = filtered.find((g) => g.label === '报表')!;
    expect(reports.items).toHaveLength(4);
  });

  it('LAB_HEAD sees 审批 in 业务 + 报表 (lab scope = 4 reports)', () => {
    const filtered = filterNavByRoles(NAV, ['LAB_HEAD'] as RoleCode[]);
    const biz = filtered.find((g) => g.label === '业务')!;
    expect(biz.items.map((i) => i.label)).toContain('审批');
    const reports = filtered.find((g) => g.label === '报表')!;
    expect(reports.items.map((i) => i.label)).toEqual([
      '领用趋势',
      '库存周转',
      '采购金额',
      '管控审计',
    ]);
  });

  it('hides empty group', () => {
    const filtered = filterNavByRoles(NAV, ['PLAIN_USER'] as RoleCode[]);
    expect(filtered.find((g) => g.label === '管理')).toBeUndefined();
  });
});
