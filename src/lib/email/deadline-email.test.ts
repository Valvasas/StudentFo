import { describe, expect, it } from 'vitest';
import { daysLeftPhrase, renderDeadlineEmail } from './deadline-email';

const links = {
  eventUrl: 'https://studentfo.test/events/lomba-x',
  unsubscribeUrl: 'https://studentfo.test/berhenti-email?token=t',
  oneClickUrl: 'https://studentfo.test/api/email/berhenti?token=t',
  settingsUrl: 'https://studentfo.test/profile/settings#pengingat-email',
};

const dispatch = {
  notificationId: 'n1',
  type: 'DEADLINE_H1' as const,
  message: 'besok',
  createdAt: '2026-10-30T00:00:00Z',
  recipient: { userId: 'u1', email: 'ana@contoh.id', fullName: 'Ana Putri' },
  event: { id: 'e1', slug: 'lomba-x', title: 'Lomba <b>X</b> & "Y"', organizer: 'BEM\r\nBcc: korban@x', deadlineAt: '2026-10-31T16:59:00Z', daysLeft: 1 },
};

describe('renderDeadlineEmail', () => {
  it('subjek satu baris & dibatasi; teks menyebut kapan, tautan kegiatan, dan cara berhenti', () => {
    const email = renderDeadlineEmail(dispatch, links);
    expect(email.to).toBe('ana@contoh.id');
    expect(email.subject).toBe('Tenggat besok: Lomba <b>X</b> & "Y"');
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.text).toContain('Halo Ana,');
    expect(email.text).toContain('BEM Bcc: korban@x');
    expect(email.text).toContain(links.eventUrl);
    expect(email.text).toContain(`Berhenti menerima: ${links.unsubscribeUrl}`);
  });

  it('HTML meng-escape isi dari pengirim kiriman (judul bisa ditulis siapa pun)', () => {
    const { html } = renderDeadlineEmail(dispatch, links);
    expect(html).toContain('Lomba &lt;b&gt;X&lt;/b&gt; &amp; &quot;Y&quot;');
    expect(html).not.toContain('<b>X</b>');
    expect(html).toContain(`href="${links.unsubscribeUrl}"`);
  });

  it('header berhenti satu klik RFC 8058', () => {
    expect(renderDeadlineEmail(dispatch, links).headers).toEqual({
      'List-Unsubscribe': `<${links.oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('nama kosong tidak menghasilkan "Halo ,"', () => {
    expect(renderDeadlineEmail({ ...dispatch, recipient: { ...dispatch.recipient, fullName: null } }, links).text).toContain('Halo kamu,');
  });
});

describe('daysLeftPhrase', () => {
  it('hari ini / besok / n hari lagi', () => {
    expect(daysLeftPhrase(0)).toBe('hari ini');
    expect(daysLeftPhrase(1)).toBe('besok');
    expect(daysLeftPhrase(3)).toBe('3 hari lagi');
  });
});
