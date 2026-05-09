import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { z } from 'zod';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { FormDialog } from '../FormDialog';

const schema = z.object({
  name: z.string().min(2, '至少 2 个字'),
});

describe('FormDialog', () => {
  it('shows zod error message on invalid submit', async () => {
    const onSubmit = vi.fn();
    render(
      <FormDialog
        open={true}
        onOpenChange={() => {}}
        schema={schema}
        defaultValues={{ name: '' }}
        title="新增"
        onSubmit={onSubmit}
        fields={(form) => (
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>名称</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('至少 2 个字')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with valid values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormDialog
        open={true}
        onOpenChange={() => {}}
        schema={schema}
        defaultValues={{ name: '' }}
        title="新增"
        onSubmit={onSubmit}
        fields={(form) => (
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>名称</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      />,
    );
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'lab1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'lab1' }));
  });

  it('keeps dialog open when onSubmit throws', async () => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <FormDialog
        open={true}
        onOpenChange={onOpenChange}
        schema={schema}
        defaultValues={{ name: 'lab1' }}
        title="新增"
        onSubmit={onSubmit}
        fields={(form) => (
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>名称</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
