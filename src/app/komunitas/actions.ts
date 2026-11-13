'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { toActionErrorCode, withQuery, type ActionErrorCode } from '@/lib/action-feedback';
import { requireUser } from '@/lib/auth';
import { isCommunityId, parseCommunityPostForm, parseCommunityReply } from '@/lib/community';
import { getEventRepository } from '@/lib/data';
import { formText } from '@/lib/form-data';
import { REPORT_REASONS, type ReportReason } from '@/types/domain';

/**
 * Aksi Komunitas (ADR-087). Otorisasi DI DALAM setiap aksi (`requireUser`) —
 * Server Action adalah endpoint HTTP yang bisa dipanggil langsung. Hasil
 * dikabarkan lewat kode tertutup di URL (ADR-019); tujuan kembali dihitung
 * dari id yang sudah divalidasi, tidak pernah diambil dari path di form.
 */

const FEED = '/komunitas';
const NEW_POST = '/komunitas/baru';
const threadPath = (postId: string) => `/komunitas/${postId}`;

/** Tujuan kembali: utas yang ada id-nya (tervalidasi), selain itu lini masa. */
function threadOrFeed(formData: FormData): string {
  const postId = formText(formData, 'postId');
  return isCommunityId(postId) ? threadPath(postId) : FEED;
}

export async function createCommunityPostAction(formData: FormData): Promise<void> {
  const eventSlug = formText(formData, 'kegiatan').trim();
  const back = withQuery(NEW_POST, { kegiatan: /^[a-z0-9-]{1,255}$/.test(eventSlug) ? eventSlug : undefined });
  const user = await requireUser(back);
  const parsed = parseCommunityPostForm(formData);
  if (!parsed.ok) redirect(withQuery(back, { error: parsed.problem === 'contact' ? 'community_contact_blocked' : 'invalid_community_post' }));

  let postId: string | null = null;
  let failure: ActionErrorCode | null = null;
  try {
    postId = await (await getEventRepository()).createCommunityPost({ id: user.id, fullName: user.fullName }, parsed.value);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure || !postId) redirect(withQuery(back, { error: failure ?? 'unknown' }));
  revalidatePath(FEED);
  redirect(withQuery(threadPath(postId), { notice: 'community_post_created' }));
}

export async function replyCommunityPostAction(formData: FormData): Promise<void> {
  const postId = formText(formData, 'postId');
  if (!isCommunityId(postId)) redirect(FEED);
  const back = threadPath(postId);
  const user = await requireUser(back);
  const parsed = parseCommunityReply(formText(formData, 'body'));
  if (!parsed.ok) redirect(`${withQuery(back, { error: parsed.problem === 'contact' ? 'community_contact_blocked' : 'invalid_community_reply' })}#balas`);

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).replyToCommunityPost({ id: user.id, fullName: user.fullName }, postId, parsed.value);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(`${withQuery(back, { error: failure })}#balas`);
  revalidatePath(back);
  redirect(`${withQuery(back, { notice: 'community_reply_sent' })}#balasan-terbaru`);
}

export async function toggleCommunityHelpfulAction(formData: FormData): Promise<void> {
  const back = threadOrFeed(formData);
  const user = await requireUser(back);
  const kind = formText(formData, 'kind') === 'reply' ? 'reply' : 'post';
  const id = formText(formData, 'id');
  if (!isCommunityId(id)) redirect(back);

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).toggleCommunityHelpful(user.id, { kind, id });
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  // Kembali ke tulisan yang ditandai, bukan ke puncak utas.
  redirect(`${failure ? withQuery(back, { error: failure }) : back}#${kind === 'reply' ? `balasan-${id}` : 'postingan'}`);
}

export async function deleteCommunityPostAction(formData: FormData): Promise<void> {
  const back = threadOrFeed(formData);
  const user = await requireUser(back);
  const postId = formText(formData, 'postId');
  if (!isCommunityId(postId)) redirect(FEED);

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).deleteCommunityPost(user.id, postId);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(withQuery(back, { error: failure }));
  revalidatePath(FEED);
  redirect(withQuery(FEED, { notice: 'community_post_deleted' }));
}

export async function deleteCommunityReplyAction(formData: FormData): Promise<void> {
  const back = threadOrFeed(formData);
  const user = await requireUser(back);
  const replyId = formText(formData, 'replyId');
  if (!isCommunityId(replyId)) redirect(back);

  let postId: string | null = null;
  let failure: ActionErrorCode | null = null;
  try {
    postId = await (await getEventRepository()).deleteCommunityReply(user.id, replyId);
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure || !postId) redirect(withQuery(back, { error: failure ?? 'unknown' }));
  revalidatePath(threadPath(postId));
  redirect(`${withQuery(threadPath(postId), { notice: 'community_reply_deleted' })}#balasan`);
}

export async function reportCommunityContentAction(formData: FormData): Promise<void> {
  const back = threadOrFeed(formData);
  const user = await requireUser(back);
  const kind = formText(formData, 'kind') === 'reply' ? 'reply' : 'post';
  const id = formText(formData, 'id');
  const rawReason = formText(formData, 'reason');
  const reason = (REPORT_REASONS as readonly string[]).includes(rawReason) ? (rawReason as ReportReason) : null;
  if (!isCommunityId(id)) redirect(back);
  if (!reason) redirect(withQuery(back, { error: 'invalid_report' }));

  let failure: ActionErrorCode | null = null;
  try {
    await (await getEventRepository()).reportCommunityContent(user.id, {
      kind,
      id,
      reason,
      details: formText(formData, 'details').trim().slice(0, 1000) || null,
    });
  } catch (error) {
    failure = toActionErrorCode(error);
  }
  if (failure) redirect(withQuery(back, { error: failure }));
  // Postingan yang dilaporkan bisa tersembunyi otomatis: kembali ke lini masa, bukan ke utas yang mungkin 404.
  redirect(withQuery(kind === 'post' ? FEED : back, { notice: 'report_sent' }));
}
