'use server';

import { getLocale } from 'next-intl/server';
import { requireAdmin } from '@/lib/admin';
import { revalidatePath } from 'next/cache';

export async function deleteServer(id: string) {
  const locale = await getLocale();
  const { admin } = await requireAdmin(locale);
  
  const { error } = await admin
    .from('servers')
    .update({ is_deleted: true })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath(`/${locale}/admin/servers`);
}

export async function restoreServer(id: string) {
  const locale = await getLocale();
  const { admin } = await requireAdmin(locale);
  
  const { error } = await admin
    .from('servers')
    .update({ is_deleted: false })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath(`/${locale}/admin/servers/deleted`);
}

export async function deleteAllServers() {
  const locale = await getLocale();
  const { admin } = await requireAdmin(locale);
  
  const { error } = await admin
    .from('servers')
    .delete()
    .not('id', 'is', null);

  if (error) throw new Error(error.message);
  revalidatePath(`/${locale}/admin/servers`);
  revalidatePath(`/${locale}/admin/servers/deleted`);
}
