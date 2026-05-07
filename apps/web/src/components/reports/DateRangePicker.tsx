'use client';
import { useState } from 'react';

export type RangePreset = '30d' | '90d' | '365d' | 'month' | 'quarter' | 'custom';

interface Props {
  range: RangePreset;
  startDate?: string;
  endDate?: string;
  onChange: (next: {
    range: RangePreset;
    startDate?: string;
    endDate?: string;
  }) => void;
}

const PRESETS: Array<[RangePreset, string]> = [
  ['30d', '近 30 天'],
  ['90d', '近 90 天'],
  ['365d', '近 1 年'],
  ['month', '本月'],
  ['quarter', '本季'],
  ['custom', '自定义'],
];

export function DateRangePicker({ range, startDate, endDate, onChange }: Props) {
  const [s, setS] = useState(startDate ?? '');
  const [e, setE] = useState(endDate ?? '');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="rounded border px-2 py-1"
        value={range}
        onChange={(ev) =>
          onChange({ range: ev.target.value as RangePreset, startDate: s, endDate: e })
        }
      >
        {PRESETS.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      {range === 'custom' && (
        <>
          <input
            type="date"
            className="rounded border px-2 py-1"
            value={s}
            onChange={(ev) => {
              setS(ev.target.value);
              onChange({ range, startDate: ev.target.value, endDate: e });
            }}
          />
          <span>至</span>
          <input
            type="date"
            className="rounded border px-2 py-1"
            value={e}
            onChange={(ev) => {
              setE(ev.target.value);
              onChange({ range, startDate: s, endDate: ev.target.value });
            }}
          />
        </>
      )}
    </div>
  );
}
