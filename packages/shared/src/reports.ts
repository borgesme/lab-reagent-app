import type { RoleCode } from './api-types';

export type ReportType =
  | 'usage-trend'
  | 'inventory-turnover'
  | 'purchase-amount'
  | 'controlled-audit';

export type ReportScope = 'self' | 'lab' | 'all';

/** scope === null => 该角色对该报表 403 */
export const REPORT_SCOPE_MATRIX: Record<RoleCode, Record<ReportType, ReportScope | null>> = {
  PLAIN_USER: {
    'usage-trend': 'self',
    'inventory-turnover': null,
    'purchase-amount': null,
    'controlled-audit': null,
  },
  LAB_HEAD: {
    'usage-trend': 'lab',
    'inventory-turnover': 'lab',
    'purchase-amount': 'lab',
    'controlled-audit': 'lab',
  },
  REAGENT_ADMIN: {
    'usage-trend': 'all',
    'inventory-turnover': 'all',
    'purchase-amount': 'all',
    'controlled-audit': 'all',
  },
  SAFETY_OFFICER: {
    'usage-trend': 'all',
    'inventory-turnover': null,
    'purchase-amount': null,
    'controlled-audit': 'all',
  },
  SYS_ADMIN: {
    'usage-trend': 'all',
    'inventory-turnover': 'all',
    'purchase-amount': 'all',
    'controlled-audit': 'all',
  },
};

export interface ResolvedReportScope {
  scope: ReportScope;
  userId: string;
  labId: string | null;
}

export function resolveReportScope(
  user: { id: string; labId: string | null; roles: RoleCode[] },
  type: ReportType,
): ResolvedReportScope | null {
  let best: ReportScope | null = null;
  for (const role of user.roles) {
    const s = REPORT_SCOPE_MATRIX[role]?.[type] ?? null;
    if (s === 'all') return { scope: 'all', userId: user.id, labId: user.labId };
    if (s === 'lab') best = 'lab';
    if (s === 'self' && best === null) best = 'self';
  }
  return best === null ? null : { scope: best, userId: user.id, labId: user.labId };
}

// ---------- Response shapes ----------

export interface UsageTrendSummary {
  totalIssued: string;
  distinctReagents: number;
  avgDailyIssued: string;
}
export interface UsageTrendRow {
  bucket: string;
  qty: string;
  reagentBreakdown?: Array<{ reagentId: string; name: string; qty: string }>;
}
export interface UsageTrendResponse {
  summary: UsageTrendSummary;
  series: UsageTrendRow[];
}

export interface InventoryTurnoverSummary {
  avgTurnoverDays: number;
  lowStockCount: number;
}
export interface InventoryTurnoverRow {
  reagentId: string;
  name: string;
  currentQty: string;
  avgQty: string;
  dailyOut: string;
  turnoverDays: number;
  status: 'ok' | 'low' | 'stale';
}
export interface InventoryTurnoverResponse {
  summary: InventoryTurnoverSummary;
  rows: InventoryTurnoverRow[];
}

export interface PurchaseAmountSummary {
  totalAmount: string;
  batchCount: number;
  pendingBatchCount: number;
}
export interface PurchaseAmountRow {
  bucket: string;
  amount: string;
  batchCount: number;
}
export interface PurchaseAmountResponse {
  summary: PurchaseAmountSummary;
  series: PurchaseAmountRow[];
}

export interface ControlledAuditSummary {
  totalEvents: number;
  distinctActors: number;
}
export interface ControlledAuditRow {
  ts: string;
  action: string;
  reagentName: string;
  actorName: string;
  qty: string;
  beforeQty?: string;
  afterQty?: string;
}
export interface ControlledAuditResponse {
  summary: ControlledAuditSummary;
  rows: ControlledAuditRow[];
}
