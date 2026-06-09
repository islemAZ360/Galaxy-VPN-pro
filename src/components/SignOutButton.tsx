'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from '@/i18n/routing';
import { useTransition } from 'react';

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => {
        const supabase = createClient();
        startTransition(async () => {
          await supabase.auth.signOut();
          router.replace('/');
          router.refresh();
        });
      }}
      className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5"
    >
      {label}
    </button>
  );
}
