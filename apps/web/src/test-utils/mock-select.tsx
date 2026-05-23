/**
 * 共享的 Radix Select mock —— Radix Select 在 jsdom 中无法工作 (portal + pointer events)。
 * 这个 mock 把 <Select>/<SelectTrigger>/<SelectContent>/<SelectItem> 整体替换成 native <select>，
 * 让 userEvent.selectOptions(...) 直接可用。
 *
 * 用法 (在测试文件顶部):
 *   import { createSelectMock } from '@/test-utils/mock-select';
 *   vi.mock('@/components/ui/select', () => createSelectMock());
 *
 * 生成的 <select> 会自动继承 <SelectTrigger> 上的 `data-testid` —— 因此调用方无需任何参数，
 * 测试里照常 `screen.getByTestId('xxx-trigger-testid')` 就能拿到 native select 元素。
 *
 * 如果页面源码没在 SelectTrigger 上设 `data-testid`，可显式传入 `testId`：
 *   vi.mock('@/components/ui/select', () => createSelectMock({
 *     testId: 'my-purchases-form-reagent',
 *     placeholder: '选择试剂',
 *   }));
 */
import * as React from 'react';

export interface SelectMockOptions {
  /** 当 Select.value 为空字符串/undefined 时显示的占位 option label。默认 '请选择'。 */
  placeholder?: string;
  /** 强制 native <select> 用这个 data-testid（覆盖从 SelectTrigger 嗅探到的值）。
   *  适用于页面源码没有给 SelectTrigger 设 data-testid 的场景。 */
  testId?: string;
}

export function createSelectMock(opts: SelectMockOptions = {}) {
  const placeholder = opts.placeholder ?? '请选择';
  const overrideTestId = opts.testId;

  function Select({ value, onValueChange, children }: any) {
    // 收集 children 树里所有的 SelectItem
    const items: { value: string; label: any }[] = [];
    // 嗅探 SelectTrigger 上的 data-testid（如果有），传递给 native <select>
    let triggerTestId: string | undefined;

    function visit(nodes: any) {
      React.Children.forEach(nodes, (child: any) => {
        if (!child || typeof child !== 'object') return;
        const c: any = child;
        if (c.type && c.type.__isSelectItem) {
          items.push({ value: c.props.value, label: c.props.children });
          return;
        }
        if (c.type && c.type.__isSelectTrigger) {
          if (c.props && c.props['data-testid']) {
            triggerTestId = c.props['data-testid'];
          }
        }
        if (c.props && c.props.children) {
          visit(c.props.children);
        }
      });
    }
    visit(children);

    return (
      <select
        data-testid={overrideTestId ?? triggerTestId}
        value={value ?? ''}
        onChange={(e) => onValueChange?.(e.target.value)}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {items.map((it) => (
          <option key={it.value} value={it.value}>
            {it.label}
          </option>
        ))}
      </select>
    );
  }

  function SelectTrigger({ children }: any) {
    return <>{children}</>;
  }
  (SelectTrigger as any).__isSelectTrigger = true;

  function SelectContent({ children }: any) {
    return <>{children}</>;
  }
  function SelectValue() {
    return null;
  }
  function SelectItem({ children }: any) {
    return <>{children}</>;
  }
  (SelectItem as any).__isSelectItem = true;

  return { Select, SelectTrigger, SelectContent, SelectValue, SelectItem };
}
