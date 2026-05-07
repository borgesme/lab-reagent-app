'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-store';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const tokens = useAuth((s) => s.tokens);
  const hydrated = useAuth((s) => s.hydrated);
  const router = useRouter();
  useEffect(() => {
    if (hydrated && !tokens) router.replace('/login');
  }, [hydrated, tokens, router]);
  if (!hydrated || !tokens) return null;
  return <>{children}</>;
}
