import { describe, expect, it } from 'vitest';
import {
  dateInputToDeadlineIso,
  fromStoredPayload,
  HONEYPOT_FIELD,
  isLikelyBot,
  isSubmissionRateLimited,
  parsePriceInput,
  parseSubmissionForm,
  stripMarkup,
  SUBMISSION_RATE_LIMIT,
  toStoredPayload,
} from './submission-schema';

// 10 Jan 2026, 20:00 WIB.
const NOW = new Date('2026-01-10T13:00:00Z');

function validForm(overrides: Record<string, string | string[]> = {}): FormData {
  const values: Record<string, string | string[]> = {
    email: 'Panitia@Kampus.ac.id',
    title: '  Lomba   Esai Nasional 2026 ',
    organizer: 'BEM Universitas Contoh',
    description: '',
    eventType: 'LOMBA',
    registrationLink: 'https://kampus.ac.id/daftar',
    sourceUrl: '',
    educationLevels: ['D4_S1', 'D4_S1', 'S2'],
    categorySlugs: ['sosial'],
    location: '',
    deadlineDate: '2026-02-01',
    costType: 'unknown',
    ...overrides,
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
  }
  return form;
}

describe('dateInputToDeadlineIso', () => {
  it('mengubah tanggal jadi 23:59 WIB di hari itu', () => {
    expect(dateInputToDeadlineIso('2026-02-01')).toBe('2026-02-01T16:59:00.000Z');
  });

  it('menolak format asing dan tanggal yang tidak ada', () => {
    expect(dateInputToDeadlineIso('01/02/2026')).toBeNull();
    expect(dateInputToDeadlineIso('2026-02-31')).toBeNull();
  });
});

describe('parseSubmissionForm', () => {
  it('menerima kiriman valid dan menormalkan isinya', () => {
    const result = parseSubmissionForm(validForm(), NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.submittedByEmail).toBe('panitia@kampus.ac.id');
    expect(result.data.title).toBe('Lomba Esai Nasional 2026');
    expect(result.data.description).toBeNull();
    expect(result.data.sourceUrl).toBeNull();
    expect(result.data.educationLevels).toEqual(['D4_S1', 'S2']);
    expect(result.data.deadlineAt).toBe('2026-02-01T16:59:00.000Z');
  });

  it('menolak tautan non-http — cegah javascript: masuk ke katalog', () => {
    const result = parseSubmissionForm(validForm({ registrationLink: 'javascript:alert(1)' }), NOW);
    expect(result.success).toBe(false);
  });

  it('menolak tenggat yang sudah lewat, tapi menerima tenggat hari ini', () => {
    expect(parseSubmissionForm(validForm({ deadlineDate: '2026-01-09' }), NOW).success).toBe(false);
    expect(parseSubmissionForm(validForm({ deadlineDate: '2026-01-10' }), NOW).success).toBe(true);
  });

  it('menolak tahun yang kemungkinan salah ketik', () => {
    expect(parseSubmissionForm(validForm({ deadlineDate: '2062-01-10' }), NOW).success).toBe(false);
  });

  it('mewajibkan minimal satu jenjang dan jenis kegiatan yang dikenal', () => {
    expect(parseSubmissionForm(validForm({ educationLevels: [] }), NOW).success).toBe(false);
    expect(parseSubmissionForm(validForm({ eventType: 'KONSER' }), NOW).success).toBe(false);
  });
});

describe('honeypot', () => {
  it('menandai form yang kolom tersembunyinya terisi', () => {
    expect(isLikelyBot(validForm())).toBe(false);
    expect(isLikelyBot(validForm({ [HONEYPOT_FIELD]: 'http://spam.example' }))).toBe(true);
  });
});

describe('stripMarkup', () => {
  it('membuang tag & komentar HTML, tapi tidak memakan tanda "<" biasa', () => {
    expect(stripMarkup('<b>Lomba</b> <a href="https://x.example">Esai</a><!-- x -->')).toBe(' Lomba Esai ');
    expect(stripMarkup('Syarat IPK < 3,5 dan usia > 17')).toBe('Syarat IPK < 3,5 dan usia > 17');
    expect(stripMarkup('<script>alert(1)</script>')).toBe(' alert(1) ');
  });

  it('membuang karakter kendali & pembalik arah teks (U+202E), mempertahankan baris baru', () => {
    expect(stripMarkup('kampus\u202Efdp.exe')).toBe('kampusfdp.exe');
    expect(stripMarkup('baris 1\nbaris\u200B 2')).toBe('baris 1\nbaris 2');
  });
});

describe('parsePriceInput', () => {
  it('membaca format rupiah yang lazim diketik', () => {
    expect(parsePriceInput('Rp 150.000')).toBe(150000);
    expect(parsePriceInput('150000')).toBe(150000);
    expect(parsePriceInput('Rp150.000,00')).toBe(150000);
    expect(parsePriceInput('150.000,50')).toBe(150000);
  });

  it('kosong = nominal belum diumumkan; nol, huruf saja, dan nominal absurd ditolak', () => {
    expect(parsePriceInput('  ')).toBeNull();
    expect(parsePriceInput('0')).toBe('invalid');
    expect(parsePriceInput('gratis')).toBe('invalid');
    expect(parsePriceInput('99999999999')).toBe('invalid');
  });
});

describe('parseSubmissionForm — biaya, panduan, verifikasi', () => {
  it('gratis → isFree true tanpa nominal, meski kolom nominal sempat terisi', () => {
    const result = parseSubmissionForm(validForm({ costType: 'free', priceAmount: '50000' }), NOW);
    expect(result.success && result.data).toMatchObject({ isFree: true, priceAmount: null });
  });

  it('berbayar dengan/tanpa nominal; nominal rusak ditandai di kolom priceAmount', () => {
    expect(parseSubmissionForm(validForm({ costType: 'paid', priceAmount: 'Rp 25.000' }), NOW)).toMatchObject({
      success: true,
      data: { isFree: false, priceAmount: 25000 },
    });
    expect(parseSubmissionForm(validForm({ costType: 'paid' }), NOW)).toMatchObject({
      success: true,
      data: { isFree: false, priceAmount: null },
    });
    const broken = parseSubmissionForm(validForm({ costType: 'paid', priceAmount: 'seikhlasnya' }), NOW);
    expect(broken.success).toBe(false);
    if (!broken.success) expect(broken.error.issues.map((issue) => issue.path[0])).toContain('priceAmount');
  });

  it('"belum tahu" disimpan sebagai null, bukan ditebak gratis', () => {
    const result = parseSubmissionForm(validForm(), NOW);
    expect(result.success && result.data.isFree).toBeNull();
  });

  it('status biaya wajib salah satu pilihan yang dikenal', () => {
    expect(parseSubmissionForm(validForm({ costType: 'mungkin' }), NOW).success).toBe(false);
  });

  it('buku panduan wajib https (CHECK di database); bukti boleh http', () => {
    expect(parseSubmissionForm(validForm({ guidebookUrl: 'http://kampus.ac.id/panduan.pdf' }), NOW).success).toBe(false);
    expect(parseSubmissionForm(validForm({ guidebookUrl: 'javascript:alert(1)' }), NOW).success).toBe(false);
    const ok = parseSubmissionForm(
      validForm({ guidebookUrl: 'https://kampus.ac.id/panduan.pdf', proofLink: 'http://kampus.ac.id/sk-panitia' }),
      NOW,
    );
    expect(ok.success && ok.data).toMatchObject({
      guidebookUrl: 'https://kampus.ac.id/panduan.pdf',
      proofLink: 'http://kampus.ac.id/sk-panitia',
    });
  });

  it('markup di judul/penyelenggara/kontak dibuang SEBELUM batas panjang dicek', () => {
    const result = parseSubmissionForm(
      validForm({ title: '<b>Lomba</b> <i>Esai</i> Nasional', organizerContact: '<a href="x">0812</a>' }),
      NOW,
    );
    expect(result.success && result.data).toMatchObject({ title: 'Lomba Esai Nasional', organizerContact: '0812' });
    // "<b></b><i>x</i>" = 15 karakter mentah, tapi hanya 1 karakter teks → gagal minimal 6.
    expect(parseSubmissionForm(validForm({ title: '<b></b><i>x</i>' }), NOW).success).toBe(false);
  });
});

describe('payload tersimpan', () => {
  it('kiriman lama (sebelum kolom biaya ada) tetap terbaca, biayanya "belum diketahui"', () => {
    const legacy = {
      title: 'Lomba Lama', organizer: 'Panitia Lama', description: null, event_type: 'LOMBA',
      registration_link: 'https://lama.example', source_url: null, education_levels: ['D4_S1'],
      category_slugs: [], location: null, is_online: true, deadline_at: '2026-02-01T16:59:00.000Z',
    };
    expect(fromStoredPayload(legacy)).toMatchObject({ isFree: null, priceAmount: null, guidebookUrl: null, organizerContact: null });
  });

  it('bolak-balik toStoredPayload → fromStoredPayload tanpa kehilangan data', () => {
    const parsed = parseSubmissionForm(
      validForm({ costType: 'paid', priceAmount: '75000', guidebookUrl: 'https://a.example/p.pdf', organizerContact: 'IG @panitia' }),
      NOW,
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const { submittedByEmail: _email, ...payload } = parsed.data;
    expect(fromStoredPayload(toStoredPayload(payload))).toEqual(payload);
  });

  it('payload yang dikirim langsung lewat API dengan bentuk asing dibaca sebagai null', () => {
    expect(fromStoredPayload({ title: 'x' })).toBeNull();
    expect(fromStoredPayload('<script>')).toBeNull();
    expect(fromStoredPayload(null)).toBeNull();
  });
});

describe('batas laju kiriman', () => {
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
  const sent = (email: string, m: number, status: 'PENDING' | 'APPROVED' = 'PENDING') => ({
    submittedByEmail: email,
    status,
    createdAt: minutesAgo(m),
  });

  it('email yang sama tertahan setelah 3 kiriman dalam satu jam, tanpa peduli huruf besar', () => {
    const recent = [sent('a@b.co', 5), sent('A@B.co', 20), sent('a@b.co', 50)];
    expect(isSubmissionRateLimited(recent, 'a@B.CO', NOW)).toBe(true);
    expect(isSubmissionRateLimited(recent, 'lain@b.co', NOW)).toBe(false);
  });

  it('kiriman di luar jendela 60 menit tidak dihitung', () => {
    const recent = [sent('a@b.co', 5), sent('a@b.co', 20), sent('a@b.co', 61)];
    expect(isSubmissionRateLimited(recent, 'a@b.co', NOW)).toBe(false);
  });

  it('rem global hanya menghitung kiriman yang masih PENDING', () => {
    const flood = Array.from({ length: SUBMISSION_RATE_LIMIT.globalPending }, (_, i) =>
      sent(`bot${i}@spam.co`, 10),
    );
    expect(isSubmissionRateLimited(flood, 'jujur@kampus.ac.id', NOW)).toBe(true);

    const reviewed = flood.map((s) => ({ ...s, status: 'APPROVED' as const }));
    expect(isSubmissionRateLimited(reviewed, 'jujur@kampus.ac.id', NOW)).toBe(false);
  });
});
