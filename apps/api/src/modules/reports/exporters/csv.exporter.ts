import { stringify } from 'csv-stringify/sync';
import type {
  UsageTrendResponse,
  InventoryTurnoverResponse,
  PurchaseAmountResponse,
  ControlledAuditResponse,
  ReportType,
} from '@app/shared';

const BOM = '﻿';

type AnyPayload =
  | UsageTrendResponse
  | InventoryTurnoverResponse
  | PurchaseAmountResponse
  | ControlledAuditResponse;

export function exportCsv(type: ReportType, payload: AnyPayload): string {
  const records = flatten(type, payload);
  const csv = stringify(records, { header: true });
  return BOM + csv;
}

function flatten(type: ReportType, p: AnyPayload): Array<Record<string, unknown>> {
  if (type === 'usage-trend') {
    return (p as UsageTrendResponse).series.map((row) => ({
      bucket: row.bucket,
      qty: row.qty,
    }));
  }
  if (type === 'inventory-turnover') {
    return (p as InventoryTurnoverResponse).rows.map((row) => ({
      reagentId: row.reagentId,
      name: row.name,
      currentQty: row.currentQty,
      avgQty: row.avgQty,
      dailyOut: row.dailyOut,
      turnoverDays: row.turnoverDays,
      status: row.status,
    }));
  }
  if (type === 'purchase-amount') {
    return (p as PurchaseAmountResponse).series.map((row) => ({
      bucket: row.bucket,
      amount: row.amount,
      batchCount: row.batchCount,
    }));
  }
  return (p as ControlledAuditResponse).rows.map((row) => ({
    ts: row.ts,
    action: row.action,
    reagentName: row.reagentName,
    actorName: row.actorName,
    qty: row.qty,
    beforeQty: row.beforeQty ?? '',
    afterQty: row.afterQty ?? '',
  }));
}
