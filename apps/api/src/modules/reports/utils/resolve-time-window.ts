import { BadRequestException } from '@nestjs/common';

export interface TimeWindow {
  from: Date;
  to: Date;
}

export interface TimeWindowQuery {
  range?: '30d' | '90d' | '365d' | 'month' | 'quarter' | 'custom';
  startDate?: string;
  endDate?: string;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SPAN_MS = 365 * ONE_DAY_MS;

export function resolveTimeWindow(
  q: TimeWindowQuery,
  now: Date = new Date(),
): TimeWindow {
  const range = q.range ?? '30d';

  if (range === 'custom') {
    if (!q.startDate || !q.endDate) {
      throw new BadRequestException({
        code: 'REPORT_RANGE_INVALID',
        message: 'REPORT_RANGE_INVALID: custom range requires startDate and endDate',
      });
    }
    const from = new Date(`${q.startDate}T00:00:00.000Z`);
    const to = new Date(`${q.endDate}T23:59:59.999Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException({
        code: 'REPORT_RANGE_INVALID',
        message: 'REPORT_RANGE_INVALID: invalid date string',
      });
    }
    if (to.getTime() < from.getTime()) {
      throw new BadRequestException({
        code: 'REPORT_RANGE_INVALID',
        message: 'REPORT_RANGE_INVALID: endDate < startDate',
      });
    }
    if (to.getTime() - from.getTime() > MAX_SPAN_MS) {
      throw new BadRequestException({
        code: 'REPORT_RANGE_TOO_WIDE',
        message: 'REPORT_RANGE_TOO_WIDE: span > 365 days',
      });
    }
    return { from, to };
  }

  if (range === '30d')
    return { from: new Date(now.getTime() - 30 * ONE_DAY_MS), to: now };
  if (range === '90d')
    return { from: new Date(now.getTime() - 90 * ONE_DAY_MS), to: now };
  if (range === '365d')
    return { from: new Date(now.getTime() - 365 * ONE_DAY_MS), to: now };

  if (range === 'month') {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from, to: now };
  }
  if (range === 'quarter') {
    const q0 = Math.floor(now.getUTCMonth() / 3) * 3;
    const from = new Date(Date.UTC(now.getUTCFullYear(), q0, 1));
    return { from, to: now };
  }

  throw new BadRequestException({
    code: 'REPORT_RANGE_INVALID',
    message: `REPORT_RANGE_INVALID: unknown range ${range}`,
  });
}
