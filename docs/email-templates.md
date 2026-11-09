# Template email StudentFo (Supabase Auth) — ADR-078

Email konfirmasi daftar, lupa kata sandi, ganti email, undangan, tautan masuk,
kode verifikasi, dan dua pemberitahuan keamanan dikirim **oleh Supabase Auth**,
bukan oleh aplikasi. Isinya diatur di dasbor Supabase — repo ini menyimpan
versi rapi ala StudentFo supaya bisa ditempel & ditinjau lewat diff.

- Sumber: `src/lib/email/auth-email-templates.ts` (satu layout untuk semua).
- Hasil: `supabase/templates/*.html` — **jangan diedit tangan**; ubah sumbernya
  lalu `npm run email:templates`. `auth-email-templates.test.ts` gagal bila
  berkas & sumber berbeda.

## Memasang (pemilik, sekali per project: staging lalu produksi)

1. Supabase → **Authentication → URL Configuration**
   - *Site URL* = alamat situs (mis. `https://studentfo.vercel.app`, nanti `https://studentfo.com`). Template memakai `{{ .SiteURL }}`.
   - *Redirect URLs* memuat `https://<domain>/**`.
2. Supabase → **Authentication → Emails → Templates**. Untuk tiap baris di
   bawah: tempel *Subject*, lalu buka berkas HTML-nya, salin seluruh isinya ke
   *Message body (HTML)*, simpan.
3. (Disarankan, Fase 1.7 `docs/peluncuran.md`) SMTP kustom lewat Resend dengan
   pengirim `StudentFo <halo@domain>` — email bawaan Supabase dibatasi beberapa
   email per jam dan sering masuk spam.
4. Uji: daftar akun baru, "Lupa kata sandi", dan ganti email — buka tautannya
   di **perangkat lain** (ponsel) untuk memastikan alur `token_hash` bekerja.

| Tab di Supabase | Subject | Berkas |
|---|---|---|
| Confirm signup | `Satu langkah lagi: konfirmasi email StudentFo-mu` | `supabase/templates/confirmation.html` |
| Invite user | `Kamu diundang bergabung ke StudentFo` | `supabase/templates/invite.html` |
| Magic link | `Tautan masuk ke StudentFo` | `supabase/templates/magic_link.html` |
| Change email address | `Konfirmasi alamat email baru StudentFo-mu` | `supabase/templates/email_change.html` |
| Reset password | `Setel ulang kata sandi StudentFo` | `supabase/templates/recovery.html` |
| Reauthentication | `Kode verifikasi StudentFo` | `supabase/templates/reauthentication.html` |
| Password changed (notifikasi keamanan) | `Kata sandi StudentFo-mu baru saja diganti` | `supabase/templates/password_changed_notification.html` |
| Email address changed (notifikasi keamanan) | `Email akun StudentFo-mu sudah diganti` | `supabase/templates/email_changed_notification.html` |

Dua baris terakhir adalah *Security notifications* — nyalakan dulu sakelarnya
di tab yang sama.

## Kenapa `token_hash`, bukan `{{ .ConfirmationURL }}`

`ConfirmationURL` memakai PKCE: kode verifier tersimpan sebagai cookie di
peramban tempat orang mendaftar. Membuka email di ponsel padahal mendaftar di
laptop = "tautan tidak valid". Tautan `token_hash` diverifikasi di server oleh
`/auth/callback` (`verifyOtp`) dan bekerja di perangkat mana pun.
