'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const tokens = useAuth((s) => s.tokens);
  const router = useRouter();
  useEffect(() => {
    if (!tokens) router.replace('/login');
  }, [tokens, router]);
  if (!tokens) return null;
  return <>{children}</>;
}
