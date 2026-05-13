import ExcelJS from 'exceljs';
import type {
  UsageTrendResponse,
  InventoryTurnoverResponse,
  PurchaseAmountResponse,
  ControlledAuditResponse,
  ReportType,
} from '@app/shared';

type AnyPayload =
  | UsageTrendResponse
  | InventoryTurnoverResponse
  | PurchaseAmountResponse
  | ControlledAuditResponse;

const SHEET_TITLES: Record<ReportType, string> = {
  'usage-trend': '领用趋势',
  'inventory-turnover': '库存周转',
  'purchase-amount': '采购金额',
  'controlled-audit': '管控审计',
};

export async function exportXlsx(
  type: ReportType,
  payload: AnyPayload,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const detail = wb.addWorksheet(SHEET_TITLES[type]);
  const summary = wb.addWorksheet('概览');

  const records = flatten(type, payload);
  if (records.length > 0) {
    detail.columns = Object.keys(records[0]).map((key) => ({
      header: key,
      key,
    }));
    detail.addRows(records);
    detail.getRow(1).font = { bold: true };
    detail.views = [{ state: 'frozen', ySplit: 1 }];
    detail.columns.forEach((col) => {
      const headerLen = (col.header as string).length;
      const maxData = records.reduce(
        (m, r) => Math.max(m, String(r[col.key as string] ?? '').length),
        headerLen,
      );
      col.width = Math.min(Math.max(maxData + 2, 8), 30);
    });
  }

  summary.columns = [
    { header: 'metric', key: 'metric', width: 22 },
    { header: 'value', key: 'value', width: 22 },
  ];
  summary.getRow(1).font = { bold: true };
  for (const [k, v] of Object.entries((payload as any).summary ?? {})) {
    summary.addRow({ metric: k, value: String(v) });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function flatten(type: ReportType, p: AnyPayload): Array<Record<string, unknown>> {
  if (type === 'usage-trend') {
    return (p as UsageTrendResponse).series.map((row) => ({
      bucket: row.bucket,
      qty: row.qty,
    }));
  }
  if (type === 'inventory-turnover') {
    return (p as InventoryTurnoverResponse).rows.map((row) => ({ ...row }));
  }
  if (type === 'purchase-amount') {
    return (p as PurchaseAmountResponse).series.map((row) => ({ ...row }));
  }
  return (p as ControlledAuditResponse).rows.map((row) => ({
    ...row,
    beforeQty: row.beforeQty ?? '',
    afterQty: row.afterQty ?? '',
  }));
}
