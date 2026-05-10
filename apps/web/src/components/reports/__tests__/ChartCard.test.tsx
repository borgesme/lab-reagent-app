import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChartCard } from '../ChartCard';

describe('ChartCard', () => {
  it('renders title and children when no special state', () => {
    render(
      <ChartCard title="趋势" testId="cc">
        <div data-testid="chart-body">CHART</div>
      </ChartCard>,
    );
    expect(screen.getByText('趋势')).toBeInTheDocument();
    expect(screen.getByTestId('chart-body')).toBeInTheDocument();
  });

  it('renders Skeleton when loading=true (no children)', () => {
    const { container } = render(
      <ChartCard title="趋势" loading testId="cc">
        <div data-testid="chart-body">CHART</div>
      </ChartCard>,
    );
    expect(screen.queryByTestId('chart-body')).toBeNull();
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders ErrorState when error is set', () => {
    render(
      <ChartCard title="趋势" error="boom" testId="cc">
        <div data-testid="chart-body">CHART</div>
      </ChartCard>,
    );
    expect(screen.queryByTestId('chart-body')).toBeNull();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('renders EmptyState when empty=true', () => {
    render(
      <ChartCard title="趋势" empty testId="cc">
        <div data-testid="chart-body">CHART</div>
      </ChartCard>,
    );
    expect(screen.queryByTestId('chart-body')).toBeNull();
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });
});
