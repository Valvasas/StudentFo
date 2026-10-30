import { formatDateTimeId } from '@/lib/deadline';
import type { DeadlineDispatch } from '@/types/domain';

/**
 * Email pengingat tenggat (ADR-062 #6). Murni — dirakit dari data antrean
 * dispatch, tanpa I/O, supaya isi & header wajibnya bisa diuji.
 */
export interface OutgoingEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly headers: Readonly<Record<string, string>>;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!);
}

/** Baris subjek tidak boleh memuat pemisah baris (injeksi header) dan dibatasi panjangnya. */
function oneLine(value: string, max: number): string {
  const flat = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function daysLeftPhrase(daysLeft: number): string {
  if (daysLeft <= 0) return 'hari ini';
  if (daysLeft === 1) return 'besok';
  return `${daysLeft} hari lagi`;
}

export function renderDeadlineEmail(
  dispatch: DeadlineDispatch & { readonly recipient: { readonly email: string } },
  links: { readonly eventUrl: string; readonly unsubscribeUrl: string; readonly oneClickUrl: string; readonly settingsUrl: string },
): OutgoingEmail {
  const firstName = oneLine(dispatch.recipient.fullName ?? '', 60).split(' ')[0] || 'kamu';
  const title = oneLine(dispatch.event.title, 160);
  const organizer = oneLine(dispatch.event.organizer, 120);
  const when = formatDateTimeId(dispatch.event.deadlineAt);
  const phrase = daysLeftPhrase(dispatch.event.daysLeft);

  const text = [
    `Halo ${firstName},`,
    '',
    `Pendaftaran "${title}" (${organizer}) ditutup ${phrase}: ${when} WIB.`,
    '',
    `Lihat kegiatan & daftar: ${links.eventUrl}`,
    '',
    '—',
    'Kamu menerima email ini karena menyalakan pengingat tenggat lewat email di StudentFo,',
    'untuk kegiatan yang kamu simpan atau lacak.',
    `Berhenti menerima: ${links.unsubscribeUrl}`,
    `Atur di akunmu: ${links.settingsUrl}`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="id"><body style="margin:0;padding:24px;background:#faf8f3;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1d1b17">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e4dfd3;border-radius:16px;padding:28px">
<p style="margin:0 0 12px;font-size:15px">Halo ${escapeHtml(firstName)},</p>
<p style="margin:0 0 6px;font-size:13px;color:#5c574c;text-transform:uppercase;letter-spacing:.04em">Tenggat ${escapeHtml(phrase)}</p>
<h1 style="margin:0 0 6px;font-size:20px;line-height:1.3">${escapeHtml(title)}</h1>
<p style="margin:0 0 16px;font-size:14px;color:#5c574c">${escapeHtml(organizer)} · ditutup ${escapeHtml(when)} WIB</p>
<a href="${escapeHtml(links.eventUrl)}" style="display:inline-block;background:#1d1b17;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:10px">Lihat kegiatan</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6b6558">Kamu menerima email ini karena menyalakan pengingat tenggat lewat email di StudentFo untuk kegiatan yang kamu simpan atau lacak. <a href="${escapeHtml(links.unsubscribeUrl)}" style="color:#6b6558">Berhenti menerima</a> · <a href="${escapeHtml(links.settingsUrl)}" style="color:#6b6558">Atur di akunmu</a></p>
</div></body></html>`;

  return {
    to: dispatch.recipient.email,
    subject: oneLine(`Tenggat ${phrase}: ${title}`, 140),
    text,
    html,
    // RFC 8058: tombol "Berhenti langganan" bawaan Gmail/Yahoo memanggil URL
    // POST ini — tanpanya pengirim massal ditolak/ditandai spam sejak 2024.
    headers: {
      'List-Unsubscribe': `<${links.oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
