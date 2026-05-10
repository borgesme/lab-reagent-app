'use client';
import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface DateRangeValue {
  from?: Date;
  to?: Date;
}

export interface DateRangeCalendarProps {
  value?: DateRangeValue;
  onChange?: (range: DateRangeValue) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  testId?: string;
}

export function DateRangeCalendar({
  value,
  onChange,
  placeholder = '选择日期范围',
  className,
  buttonClassName,
  disabled,
  testId,
}: DateRangeCalendarProps) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (value?.from && value?.to) {
      setOpen(false);
    }
  }, [value?.from, value?.to]);

  const label = !value?.from
    ? <span className="text-muted-foreground">{placeholder}</span>
    : !value?.to
    ? format(value.from, 'yyyy-MM-dd')
    : `${format(value.from, 'yyyy-MM-dd')} — ${format(value.to, 'yyyy-MM-dd')}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          data-testid={testId}
          className={cn(
            'w-72 justify-start text-left font-normal',
            !value?.from && 'text-muted-foreground',
            buttonClassName,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-auto p-0', className)} align="start">
        <Calendar
          mode="range"
          selected={value as any}
          onSelect={(r: any) => onChange?.(r ?? {})}
          numberOfMonths={2}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
