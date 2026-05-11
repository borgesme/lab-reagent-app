'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiBaseUrl } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-store';
import type { AuthTokens } from '@app/shared';

const schema = z
  .object({
    currentPassword: z.string().min(1, '请输入当前密码'),
    newPassword: z.string().min(8, '至少 8 位'),
    confirmPassword: z.string().min(1, '请确认新密码'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: '确认密码不一致',
  });

type Values = z.infer<typeof schema>;

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const token = useAuth((s) => s.tokens?.accessToken);
  const setTokens = useAuth((s) => s.setTokens);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(values: Values) {
    if (!token) return;
    const res = await fetch(`${apiBaseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    });
    if (res.status === 401) {
      form.setError('currentPassword', { message: '当前密码不正确' });
      return;
    }
    if (!res.ok) {
      toast.error(`修改失败 (${res.status})`);
      return;
    }
    const data = (await res.json()) as AuthTokens;
    setTokens(data);
    toast.success('密码已修改，其他设备需要重新登录');
    form.reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="change-password-dialog"
      >
        <DialogHeader>
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription>
            修改后将自动退出其他设备的登录状态。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>当前密码</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      data-testid="pwd-current"
                      autoComplete="current-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>新密码</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      data-testid="pwd-new"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>确认新密码</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      data-testid="pwd-confirm"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={form.formState.isSubmitting}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                data-testid="pwd-submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                提交
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
