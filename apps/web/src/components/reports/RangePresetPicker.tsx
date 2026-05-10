'use client';
import * as React from 'react';
import { format, parse } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DateRangeCalendar,
  type DateRangeValue,
} from '@/components/ui/date-range-calendar';

export type RangePreset = '30d' | '90d' | '365d' | 'month' | 'quarter' | 'custom';

const PRESETS: Array<[RangePreset, string]> = [
  ['30d', '近 30 天'],
  ['90d', '近 90 天'],
  ['365d', '近 1 年'],
  ['month', '本月'],
  ['quarter', '本季'],
  ['custom', '自定义'],
];

export interface RangePresetPickerProps {
  range: RangePreset;
  startDate?: string;
  endDate?: string;
  onChange: (next: {
    range: RangePreset;
    startDate?: string;
    endDate?: string;
  }) => void;
  testId?: string;
}

function strToDate(s?: string): Date | undefined {
  if (!s) return undefined;
  return parse(s, 'yyyy-MM-dd', new Date());
}

export function RangePresetPicker({
  range,
  startDate,
  endDate,
  onChange,
  testId,
}: RangePresetPickerProps) {
  const value: DateRangeValue = {
    from: strToDate(startDate),
    to: strToDate(endDate),
  };

  function handlePreset(next: RangePreset) {
    if (next === 'custom') {
      onChange({ range: 'custom', startDate, endDate });
    } else {
      onChange({ range: next, startDate: undefined, endDate: undefined });
    }
  }

  function handleCalendar(r: DateRangeValue) {
    if (r.from && r.to) {
      onChange({
        range: 'custom',
        startDate: format(r.from, 'yyyy-MM-dd'),
        endDate: format(r.to, 'yyyy-MM-dd'),
      });
    }
  }

  return (
    <div data-testid={testId} className="flex items-center gap-2">
      <Select value={range} onValueChange={(v) => handlePreset(v as RangePreset)}>
        <SelectTrigger className="w-32" data-testid={testId ? testId + '-preset' : undefined}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map(([v, label]) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {range === 'custom' && (
        <DateRangeCalendar
          value={value}
          onChange={handleCalendar}
          testId={testId ? testId + '-calendar' : undefined}
        />
      )}
    </div>
  );
}
