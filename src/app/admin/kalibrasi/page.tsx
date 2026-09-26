import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Scale, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { checkAdminAccess } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { calibrate, MIN_SIGNALS_FOR_SUGGESTION, type WeightSuggestion } from '@/lib/recommendation-calibration';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Kalibrasi rekomendasi',
  robots: { index: false, follow: false },
};

const WINDOW_DAYS = 90;

const COMPONENT_LABEL: Record<string, string> = {
  category: 'Kecocokan minat',
  education: 'Kecocokan jenjang',
  deadline: 'Kedekatan tenggat',
  recency: 'Kebaruan',
  popularity: 'Popularitas',
};

function formatWeight(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(2);
}

function SuggestionTable<K extends string>({ id, title, data }: { id: string; title: string; data: WeightSuggestion<K> }) {
  const keys = Object.keys(data.current) as K[];
  // min-w-0: item grid tidak menyusut di bawah lebar tabel tanpanya, dan
  // overflow-x-auto di dalamnya tidak pernah aktif (layar 320px melebar).
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-card border border-line bg-panel p-5 shadow-card">
      <h2 id={id} className="text-xl">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted">
        {data.signals.toLocaleString('id-ID')} sinyal
        {!data.sufficient &&
          ` — belum cukup (minimal ${MIN_SIGNALS_FOR_SUGGESTION}); saran bobot tidak ditampilkan.`}
      </p>
      {/* Bisa digulir ke samping di layar sempit → harus bisa difokus supaya
          pengguna keyboard juga bisa menggulirnya (WCAG 2.1.1). */}
      <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label={`Tabel bobot ${title}`}>
        <table className="w-full min-w-[420px] text-left text-sm">
          <caption className="sr-only">
            Bobot saat ini, saran bobot, dan selisih rata-rata komponen untuk {title}
          </caption>
          <thead className="text-ink-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">Komponen</th>
              <th scope="col" className="py-2 pr-4 font-medium">Bobot kini</th>
              <th scope="col" className="py-2 pr-4 font-medium">Saran</th>
              <th scope="col" className="py-2 font-medium">Lift</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key} className="border-t border-line">
                <th scope="row" className="py-2 pr-4 font-medium">{COMPONENT_LABEL[key] ?? key}</th>
                <td className="py-2 pr-4 tabular-nums">{formatWeight(data.current[key])}</td>
                <td className="py-2 pr-4 tabular-nums">{formatWeight(data.suggested?.[key])}</td>
                <td className="py-2 tabular-nums">{data.lift[key].toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Laporan kalibrasi bobot rekomendasi (ADR-032). Hanya MEMBACA dan
 * menyarankan; bobot tetap konstanta di `src/lib/recommendation.ts` yang
 * diubah lewat commit + ADR. Menerapkan otomatis dari data yang bias posisi
 * akan mengunci peringkat pada apa pun yang kebetulan sedang di atas.
 */
export default async function CalibrationPage() {
  const gate = await checkAdminAccess();
  if (!gate.allowed) {
    return (
      <div className="container-page flex flex-col items-center gap-3 py-24 text-center">
        <ShieldCheck aria-hidden className="size-10 text-ink-faint" />
        <h1 className="text-2xl">Akses terbatas</h1>
        <p className="max-w-md text-ink-muted">Laporan kalibrasi hanya untuk akun berperan admin.</p>
        {gate.reason === 'unauthenticated' && (
          <Button asChild>
            <Link href="/login?next=%2Fadmin%2Fkalibrasi">Masuk</Link>
          </Button>
        )}
      </div>
    );
  }

  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const repository = await getEventRepository();
  const { signals, events } = await repository.listCalibrationData(since);
  const report = calibrate(signals, events);

  return (
    <div className="container-page py-8">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-1 text-sm text-brand-text hover:underline">
        <ArrowLeft aria-hidden className="size-4" /> Kembali ke antrean
      </Link>
      <header className="mb-6 mt-2">
        <h1 className="flex items-center gap-2 text-3xl">
          <Scale aria-hidden className="size-7 text-ink-muted" />
          Kalibrasi rekomendasi
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Sinyal simpan & klik &quot;Daftar&quot; {WINDOW_DAYS} hari terakhir dibandingkan dengan kegiatan lain yang
          tayang pada saat yang sama. <strong className="font-semibold">Lift</strong> = rata-rata komponen pada
          kegiatan yang dipilih dikurangi rata-rata pada yang tidak dipilih.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <SuggestionTable id="kalibrasi-personal" title="Profil lengkap (personal)" data={report.personal} />
        <SuggestionTable id="kalibrasi-cold-start" title="Tanpa profil (cold start)" data={report.coldStart} />
      </div>

      <section className="mt-8 max-w-3xl rounded-card border border-caution-line bg-caution-soft p-5 text-sm text-caution">
        <h2 className="text-base font-semibold">Baca sebelum mengubah bobot</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Bias posisi belum dikoreksi: kartu teratas lebih sering diklik karena posisinya, dan posisinya
            ditentukan bobot yang sekarang. Saran cenderung menguatkan bobot lama — pakai sebagai arah.
          </li>
          <li>Popularitas memakai jumlah simpan saat ini, bukan saat sinyal terjadi.</li>
          <li>
            Ubah bobot di <code>src/lib/recommendation.ts</code> lewat commit, catat angka laporan ini di
            ADR baru, dan pertahankan test &quot;bobot berjumlah 1&quot;.
          </li>
        </ul>
      </section>
    </div>
  );
}
