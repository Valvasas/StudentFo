/**
 * Template email Supabase Auth ala StudentFo (ADR-078): konfirmasi daftar,
 * undangan, tautan masuk, ganti email, setel ulang sandi, kode
 * reautentikasi, dan dua pemberitahuan keamanan.
 *
 * Sumber tunggal → `supabase/templates/*.html` lewat
 * `npm run email:templates`; `auth-email-templates.test.ts` gagal bila berkas
 * yang di-commit tidak sama dengan keluaran modul ini. Isinya Go template
 * GoTrue (`{{ .TokenHash }}`, `{{ .SiteURL }}`, …) — BUKAN template React:
 * Supabase yang merendernya, jadi semua gaya inline & tata letak tabel
 * (Gmail, Outlook, Apple Mail, aplikasi email ponsel).
 *
 * Tautan memakai `token_hash` ke `/auth/callback` (bukan `{{ .ConfirmationURL }}`
 * PKCE): PKCE butuh cookie dari peramban yang SAMA dengan tempat mendaftar,
 * jadi gagal saat email dibuka di ponsel padahal daftar di laptop.
 */

export interface AuthEmailTemplate {
  /** Nama berkas & kunci di Supabase (Authentication → Emails). */
  readonly key: string;
  /** Judul tab di dasbor Supabase — untuk panduan pemasangan. */
  readonly dashboardName: string;
  readonly subject: string;
  readonly html: string;
}

const C = {
  canvas: '#faf8f3',
  panel: '#ffffff',
  line: '#e4dfd3',
  ink: '#1d1b17',
  soft: '#5c574c',
  muted: '#6b6558',
  highlight: '#ffd95a',
  nested: '#f3efe5',
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

/** Sapaan dari metadata akun (`full_name` diisi saat daftar); tanpa nama tetap sopan. */
const GREETING = '{{ if .Data.full_name }}Halo, {{ .Data.full_name }}!{{ else }}Halo!{{ end }}';

function callback(type: string, next: string): string {
  return `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=${type}&next=${encodeURIComponent(next)}`;
}

/** Tombol "anti peluru": sel tabel ber-latar, tetap tombol di Outlook yang mengabaikan padding <a>. */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px">
<tr><td align="center" bgcolor="${C.ink}" style="border-radius:12px">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;border-radius:12px">${label}</a>
</td></tr></table>`;
}

function fallbackLink(href: string): string {
  return `<p style="margin:16px 0 0;font-size:12.5px;line-height:1.6;color:${C.muted}">Tombol tidak berfungsi? Salin tautan ini ke peramban:<br><a href="${href}" style="color:${C.soft};word-break:break-all">${href}</a></p>`;
}

function codeBlock(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 6px">
<tr><td bgcolor="${C.nested}" style="border:1px solid ${C.line};border-radius:12px;padding:14px 22px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:.32em;color:${C.ink}">{{ .Token }}</td></tr></table>`;
}

function layout({ preheader, eyebrow, title, body, footnote }: { preheader: string; eyebrow: string; title: string; body: string; footnote: string }): string {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${C.canvas};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.canvas}">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.canvas}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td style="padding:0 4px 18px;font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-.03em;color:${C.ink}">
<span style="background:${C.highlight};padding:3px 9px;border-radius:8px">StudentFo</span>
</td></tr>
<tr><td bgcolor="${C.panel}" style="background:${C.panel};border:1px solid ${C.line};border-radius:20px;padding:32px 28px;font-family:${FONT};color:${C.ink}">
<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.muted}">${eyebrow}</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;letter-spacing:-.02em;color:${C.ink}">${title}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${C.ink}">${GREETING}</p>
${body}
</td></tr>
<tr><td style="padding:18px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted}">
${footnote}<br>
StudentFo tidak pernah meminta kata sandi, kode OTP, atau transfer uang lewat email. Ragu? Buka situsnya langsung, jangan dari tautan.<br>
<a href="{{ .SiteURL }}" style="color:${C.muted}">StudentFo</a> · info lomba, beasiswa, magang & acara pelajar Indonesia
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

const p = (text: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${C.soft}">${text}</p>`;
const NOT_YOU = 'Bukan kamu yang meminta? Abaikan saja email ini — tidak ada yang berubah di akunmu.';

const confirmUrl = callback('email', '/');
const inviteUrl = callback('invite', '/reset-password');
const magicUrl = callback('email', '/');
const recoveryUrl = callback('recovery', '/reset-password');
const changeUrl = callback('email_change', '/profile/settings/keamanan');

export const AUTH_EMAIL_TEMPLATES: readonly AuthEmailTemplate[] = [
  {
    key: 'confirmation',
    dashboardName: 'Confirm signup',
    subject: 'Satu langkah lagi: konfirmasi email StudentFo-mu',
    html: layout({
      preheader: 'Konfirmasi emailmu supaya akun StudentFo bisa dipakai.',
      eyebrow: 'Konfirmasi akun',
      title: 'Selamat datang di StudentFo',
      body: `${p('Tinggal satu langkah: konfirmasi bahwa {{ .Email }} memang milikmu. Setelah itu kamu bisa menyimpan lomba, melacak pendaftaran, dan mencari tim.')}
${button(confirmUrl, 'Konfirmasi email')}
${p('Tautan ini berlaku sekali pakai dan kedaluwarsa dalam 24 jam.')}
${fallbackLink(confirmUrl)}`,
      footnote: `Kamu menerima email ini karena alamat ini dipakai untuk mendaftar di StudentFo. ${NOT_YOU}`,
    }),
  },
  {
    key: 'invite',
    dashboardName: 'Invite user',
    subject: 'Kamu diundang bergabung ke StudentFo',
    html: layout({
      preheader: 'Terima undangan dan buat kata sandi akunmu.',
      eyebrow: 'Undangan',
      title: 'Kamu diundang ke StudentFo',
      body: `${p('Seseorang dari tim StudentFo mengundang {{ .Email }} untuk bergabung. Terima undangannya, lalu buat kata sandi untuk akunmu.')}
${button(inviteUrl, 'Terima undangan')}
${fallbackLink(inviteUrl)}`,
      footnote: `Tidak mengenal undangan ini? ${NOT_YOU}`,
    }),
  },
  {
    key: 'magic_link',
    dashboardName: 'Magic link',
    subject: 'Tautan masuk ke StudentFo',
    html: layout({
      preheader: 'Masuk ke StudentFo tanpa kata sandi.',
      eyebrow: 'Masuk',
      title: 'Masuk dengan satu ketukan',
      body: `${p('Gunakan tombol di bawah untuk masuk ke akun StudentFo {{ .Email }}. Tautan hanya berlaku sekali dan sebentar.')}
${button(magicUrl, 'Masuk ke StudentFo')}
${fallbackLink(magicUrl)}`,
      footnote: NOT_YOU,
    }),
  },
  {
    key: 'email_change',
    dashboardName: 'Change email address',
    subject: 'Konfirmasi alamat email baru StudentFo-mu',
    html: layout({
      preheader: 'Konfirmasi perubahan alamat email akunmu.',
      eyebrow: 'Keamanan akun',
      title: 'Konfirmasi email baru',
      body: `${p('Ada permintaan mengganti email akun StudentFo dari <strong style="color:#1d1b17">{{ .Email }}</strong> menjadi <strong style="color:#1d1b17">{{ .NewEmail }}</strong>.')}
${button(changeUrl, 'Konfirmasi email baru')}
${p('Setelah dikonfirmasi, kamu masuk memakai alamat baru.')}
${fallbackLink(changeUrl)}`,
      footnote: `Bukan kamu? Jangan tekan tombolnya, lalu ganti kata sandimu dari Pengaturan → Keamanan — seseorang mungkin tahu kata sandimu.`,
    }),
  },
  {
    key: 'recovery',
    dashboardName: 'Reset password',
    subject: 'Setel ulang kata sandi StudentFo',
    html: layout({
      preheader: 'Buat kata sandi baru untuk akunmu.',
      eyebrow: 'Lupa kata sandi',
      title: 'Buat kata sandi baru',
      body: `${p('Kami menerima permintaan menyetel ulang kata sandi untuk {{ .Email }}. Tekan tombol di bawah, lalu ketik kata sandi baru dua kali.')}
${button(recoveryUrl, 'Setel ulang kata sandi')}
${p('Tautan berlaku sekali dan kedaluwarsa dalam 1 jam. Kata sandi lamamu tetap berlaku sampai kamu menggantinya.')}
${fallbackLink(recoveryUrl)}`,
      footnote: `Tidak merasa meminta? ${NOT_YOU}`,
    }),
  },
  {
    key: 'reauthentication',
    dashboardName: 'Reauthentication',
    // Kode TIDAK di subjek: subjek tampil di notifikasi layar kunci ponsel.
    subject: 'Kode verifikasi StudentFo',
    html: layout({
      preheader: 'Kode untuk memastikan ini benar kamu.',
      eyebrow: 'Verifikasi',
      title: 'Kode verifikasimu',
      body: `${p('Masukkan kode ini di StudentFo untuk melanjutkan tindakan yang butuh konfirmasi ulang:')}
${codeBlock()}
${p('Kode berlaku beberapa menit. Jangan berikan ke siapa pun — termasuk yang mengaku dari StudentFo.')}`,
      footnote: `Tidak sedang melakukan apa-apa di StudentFo? Abaikan kode ini dan pertimbangkan mengganti kata sandimu.`,
    }),
  },
  {
    key: 'password_changed_notification',
    dashboardName: 'Password changed (notifikasi keamanan)',
    subject: 'Kata sandi StudentFo-mu baru saja diganti',
    html: layout({
      preheader: 'Pemberitahuan keamanan untuk akunmu.',
      eyebrow: 'Pemberitahuan keamanan',
      title: 'Kata sandimu diganti',
      body: `${p('Kata sandi akun StudentFo {{ .Email }} baru saja diganti. Kalau ini kamu, tidak perlu melakukan apa-apa.')}
${button('{{ .SiteURL }}/forgot-password', 'Bukan aku — amankan akun')}`,
      footnote: 'Email ini dikirim otomatis setiap kali kata sandi akunmu berubah.',
    }),
  },
  {
    key: 'email_changed_notification',
    dashboardName: 'Email address changed (notifikasi keamanan)',
    subject: 'Email akun StudentFo-mu sudah diganti',
    html: layout({
      preheader: 'Pemberitahuan keamanan untuk akunmu.',
      eyebrow: 'Pemberitahuan keamanan',
      title: 'Email akunmu diganti',
      body: `${p('Email akun StudentFo-mu diganti dari {{ .OldEmail }} menjadi {{ .Email }}. Kalau ini kamu, tidak perlu melakukan apa-apa.')}
${p('Bukan kamu? Balas email ini atau hubungi kami lewat halaman Tentang secepatnya.')}`,
      footnote: 'Email ini dikirim ke alamat lama setiap kali alamat email akunmu berubah.',
    }),
  },
];
