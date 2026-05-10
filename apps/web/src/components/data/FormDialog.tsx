'use client';
import * as React from 'react';
import { useForm, type UseFormReturn, type DefaultValues, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import type { z, ZodType } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { Button } from '@/components/ui/button';

export interface FormDialogProps<S extends ZodType<any, any, any>> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schema: S;
  defaultValues: z.infer<S>;
  onSubmit: (values: z.infer<S>) => Promise<void>;
  title: string;
  description?: string;
  submitLabel?: string;
  cancelLabel?: string;
  testId?: string;
  fields: (form: UseFormReturn<z.infer<S>>) => React.ReactNode;
}

export function FormDialog<S extends ZodType<any, any, any>>({
  open,
  onOpenChange,
  schema,
  defaultValues,
  onSubmit,
  title,
  description,
  submitLabel = '保存',
  cancelLabel = '取消',
  testId,
  fields,
}: FormDialogProps<S>) {
  const form = useForm<z.infer<S>>({
    resolver: zodResolver(schema) as unknown as Resolver<z.infer<S>>,
    defaultValues: defaultValues as DefaultValues<z.infer<S>>,
  });

  React.useEffect(() => {
    if (open) {
      form.reset(defaultValues as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(defaultValues)]);

  async function handleSubmit(values: z.infer<S>) {
    try {
      await onSubmit(values);
    } catch {
      // caller handles toast; dialog stays open
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            {fields(form)}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={form.formState.isSubmitting}
                data-testid={testId ? testId + '-cancel' : undefined}
              >
                {cancelLabel}
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                data-testid={testId ? testId + '-submit' : undefined}
              >
                {form.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
