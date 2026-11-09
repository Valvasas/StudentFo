import { KeyRound } from 'lucide-react';

/**
 * Pengganti panel moderasi saat `SUPABASE_SERVICE_ROLE_KEY` belum diisi.
 * Hanya pernah dilihat admin yang lolos gerbang (non-admin tetap 404, ADR-057),
 * jadi aman menyebut nama variabelnya — nilainya tidak pernah ditampilkan.
 */
export function AdminSetupNotice() {
  return (
    <div className="container-page py-10">
      <section aria-labelledby="admin-setup" className="mx-auto flex max-w-2xl flex-col gap-4 rounded-[20px] border border-line bg-panel p-6 sm:p-8">
        <KeyRound aria-hidden className="size-7 text-ink-muted" />
        <h1 id="admin-setup" className="text-2xl">
          Panel moderasi belum tersambung ke database
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Antrean moderasi, laporan, dan kinerja postingan membaca data lintas pengguna, jadi butuh kunci{' '}
          <code className="rounded-sm bg-panel-nested px-1.5 py-0.5 text-[13.5px]">SUPABASE_SERVICE_ROLE_KEY</code> di server.
          Kunci itu belum diisi di lingkungan ini.
        </p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[14.5px] leading-relaxed text-ink-soft">
          <li>Supabase → Project Settings → API Keys → salin kunci <em>service_role</em> dari project yang dipakai situs ini.</li>
          <li>Vercel → Settings → Environment Variables → tambah <code>SUPABASE_SERVICE_ROLE_KEY</code> (tandai Sensitive).</li>
          <li>Deploy ulang. Halaman ini otomatis berganti menjadi panel moderasi.</li>
        </ol>
        <p className="text-[13px] text-ink-muted">
          Fitur pengguna biasa — termasuk mengirim kegiatan lewat /submit — tetap berjalan tanpa kunci ini.
        </p>
      </section>
    </div>
  );
}
