'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/auth-store';
import { updateMyProfile } from '@/lib/api/me';
import { ChangePasswordDialog } from './ChangePasswordDialog';

const schema = z.object({
  name: z.string().min(1, '姓名不能为空').max(50, '不超过 50 字'),
});
type Values = z.infer<typeof schema>;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 items-start gap-3 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="col-span-2">{children}</div>
    </div>
  );
}

export function ProfileSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const token = useAuth((s) => s.tokens?.accessToken);
  const [pwdOpen, setPwdOpen] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: user?.name ?? '' },
  });

  useEffect(() => {
    if (open && user) form.reset({ name: user.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.name]);

  if (!user) return null;
  const initials = (user.name || user.email).slice(0, 2).toUpperCase();
  const watchedName = form.watch('name');
  const pristine = watchedName === user.name;

  async function onSubmit(values: Values) {
    if (!token) return;
    try {
      const next = await updateMyProfile({ name: values.name }, token);
      setUser({ name: next.name });
      toast.success('个人信息已更新');
    } catch (e: any) {
      toast.error(e.message ?? '更新失败');
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md"
        data-testid="profile-sheet"
      >
        <SheetHeader>
          <SheetTitle>个人信息</SheetTitle>
          <SheetDescription>查看与维护账号资料</SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <div className="text-base font-medium">{user.name}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="space-y-3">
          <Field label="邮箱">{user.email}</Field>
          <Field label="实验室">
            {user.labId ?? <span className="text-muted-foreground">—</span>}
          </Field>
          <Field label="角色">
            <div className="flex flex-wrap gap-1">
              {user.roles.map((r) => (
                <Badge key={r} variant="secondary">
                  {r}
                </Badge>
              ))}
            </div>
          </Field>
        </div>

        <Separator className="my-4" />

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-3"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>姓名</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="profile-name-input"
                      autoComplete="name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              disabled={pristine || form.formState.isSubmitting}
              data-testid="profile-save-name"
            >
              {form.formState.isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              保存
            </Button>
          </form>
        </Form>

        <Separator className="my-4" />

        <div className="space-y-2">
          <div className="text-sm font-medium">安全</div>
          <Button
            variant="outline"
            onClick={() => setPwdOpen(true)}
            data-testid="profile-change-password-btn"
          >
            修改密码
          </Button>
        </div>

        <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
      </SheetContent>
    </Sheet>
  );
}
