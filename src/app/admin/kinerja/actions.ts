'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type ActionErrorCode, toActionErrorCode, withQuery } from '@/lib/action-feedback';
import { checkAdminAccess } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { parseOutboundConfigInput } from '@/lib/outbound-survey';

const EDITOR_PATH = '/admin/kinerja/pertanyaan';

/**
 * Simpan pertanyaan pendataan kinerja (ADR-073). Otorisasi DI DALAM aksi
 * (Server Action = endpoint HTTP; lihat app/admin/actions.ts). Tidak ada
 * peran "moderator" terpisah di skema — moderator StudentFo = peran ADMIN.
 */
export async function saveOutboundConfigAction(formData: FormData): Promise<void> {
  const gate = await checkAdminAccess();
  if (!gate.allowed) redirect('/admin?status=forbidden');

  let error: ActionErrorCode | null = null;
  try {
    const parsed = parseOutboundConfigInput(formData);
    if (!parsed.ok) error = 'invalid_outbound_config';
    else await (await getEventRepository()).saveOutboundSurveyConfig(parsed.value, gate.userId);
  } catch (caught) {
    error = toActionErrorCode(caught);
  }
  if (error) redirect(withQuery(EDITOR_PATH, { error }));
  revalidatePath('/admin/kinerja');
  revalidatePath(EDITOR_PATH);
  redirect(withQuery(EDITOR_PATH, { notice: 'outbound_config_saved' }));
}
