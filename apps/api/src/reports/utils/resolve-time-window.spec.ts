import { BadRequestException } from '@nestjs/common';
import { resolveTimeWindow } from './resolve-time-window';

describe('resolveTimeWindow', () => {
  const now = new Date('2026-05-15T10:00:00Z');

  it("range='30d' returns last 30 days", () => {
    const r = resolveTimeWindow({ range: '30d' }, now);
    expect(r.to.toISOString()).toBe('2026-05-15T10:00:00.000Z');
    expect(r.from.toISOString()).toBe('2026-04-15T10:00:00.000Z');
  });

  it("range='month' returns this calendar month", () => {
    const r = resolveTimeWindow({ range: 'month' }, now);
    expect(r.from.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it("range='custom' requires startDate+endDate", () => {
    expect(() => resolveTimeWindow({ range: 'custom' }, now)).toThrow(
      BadRequestException,
    );
  });

  it("range='custom' with valid dates", () => {
    const r = resolveTimeWindow(
      { range: 'custom', startDate: '2026-01-01', endDate: '2026-01-31' },
      now,
    );
    expect(r.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-01-31T23:59:59.999Z');
  });

  it('rejects span > 365 days', () => {
    expect(() =>
      resolveTimeWindow(
        { range: 'custom', startDate: '2024-01-01', endDate: '2026-01-01' },
        now,
      ),
    ).toThrow(/REPORT_RANGE_TOO_WIDE/);
  });

  it('rejects endDate < startDate', () => {
    expect(() =>
      resolveTimeWindow(
        { range: 'custom', startDate: '2026-05-01', endDate: '2026-01-01' },
        now,
      ),
    ).toThrow(/REPORT_RANGE_INVALID/);
  });
});
