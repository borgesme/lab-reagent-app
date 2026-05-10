import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RangePresetPicker } from '../RangePresetPicker';

describe('RangePresetPicker', () => {
  it('renders preset Select with current value', () => {
    render(
      <RangePresetPicker range="30d" onChange={() => {}} testId="t" />,
    );
    expect(screen.getByText('近 30 天')).toBeInTheDocument();
  });

  it('calls onChange when preset switches to 90d (clears dates)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<RangePresetPicker range="30d" onChange={onChange} testId="t" />);
    await user.click(screen.getByTestId('t-preset'));
    await user.click(await screen.findByText('近 90 天'));
    expect(onChange).toHaveBeenCalledWith({
      range: '90d',
      startDate: undefined,
      endDate: undefined,
    });
  });

  it('renders DateRangeCalendar trigger when range is custom', () => {
    render(
      <RangePresetPicker
        range="custom"
        startDate="2026-04-01"
        endDate="2026-04-30"
        onChange={() => {}}
        testId="t"
      />,
    );
    const calBtn = screen.getByTestId('t-calendar');
    expect(calBtn).toBeInTheDocument();
    expect(calBtn).toHaveTextContent('2026-04-01');
    expect(calBtn).toHaveTextContent('2026-04-30');
  });

  it('does not render Calendar when range is not custom', () => {
    render(<RangePresetPicker range="30d" onChange={() => {}} testId="t" />);
    expect(screen.queryByTestId('t-calendar')).toBeNull();
  });
});
