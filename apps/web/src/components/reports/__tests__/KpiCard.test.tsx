import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from '../KpiCard';

describe('KpiCard', () => {
  it('renders value when provided', () => {
    render(<KpiCard label="总数" value={1234} testId="kpi" />);
    expect(screen.getByTestId('kpi-value')).toHaveTextContent('1234');
  });

  it('renders em-dash when value is undefined', () => {
    render(<KpiCard label="总数" value={undefined} testId="kpi" />);
    expect(screen.getByTestId('kpi-value')).toHaveTextContent('—');
  });

  it('renders Skeleton when loading=true (no value span)', () => {
    const { container } = render(
      <KpiCard label="总数" value={1234} loading testId="kpi" />,
    );
    expect(screen.queryByTestId('kpi-value')).toBeNull();
    expect(container.querySelector('[data-slot="skeleton"], .animate-pulse')).toBeTruthy();
  });

  it('renders up arrow and emerald color when delta > 0', () => {
    const { container } = render(
      <KpiCard label="总数" value={100} delta={12.5} testId="kpi" />,
    );
    expect(container.textContent).toContain('+12.5%');
    expect(container.querySelector('.text-emerald-600')).toBeTruthy();
  });

  it('renders down arrow and destructive color when delta < 0', () => {
    const { container } = render(
      <KpiCard label="总数" value={100} delta={-5} testId="kpi" />,
    );
    expect(container.textContent).toContain('-5.0%');
    expect(container.querySelector('.text-destructive')).toBeTruthy();
  });
});
