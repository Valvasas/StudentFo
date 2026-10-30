import type { Metadata } from 'next';
import { ContactNote, InlineLink, LegalDocument, privacyStatus, type LegalSection } from '@/components/legal/legal-document';
import { ACCOUNT_SIDEBAR_COOKIE } from '@/lib/account-sidebar';
import { MOTION_STORAGE_KEY, THEME_STORAGE_KEY } from '@/lib/appearance';
import { demoFeaturesEnabled } from '@/lib/demo-features';
import { DEMO_SESSION_COOKIE } from '@/lib/demo/session';
import type { LegalDocumentStatus } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Kebijakan cookie',
  description: 'Cookie dan penyimpanan peramban yang dipakai StudentFo: nama, tujuan, masa berlaku, dan cara mengaturnya. Tanpa iklan dan pelacak.',
};

const SUMMARY = [
  'StudentFo hanya memakai cookie yang dibutuhkan agar kamu tetap masuk, situs tetap aman, dan pilihan tampilanmu diingat.',
  'Tidak ada cookie iklan, analitik pihak ketiga, atau pelacak lintas situs.',
  'Karena itu kami tidak menampilkan spanduk persetujuan cookie — tidak ada yang perlu kamu tolak.',
];

type Category = 'Wajib' | 'Preferensi';

interface StorageItem {
  readonly names: readonly string[];
  readonly purpose: string;
  readonly lifetime: string;
  readonly category: Category;
}

const COOKIES: readonly StorageItem[] = [
  {
    names: ['sb-…-auth-token'],
    purpose:
      'Menjaga kamu tetap masuk. Bisa terpecah menjadi beberapa bagian (.0, .1). Tidak bisa dibaca JavaScript (HttpOnly), hanya dikirim lewat HTTPS.',
    lifetime: 'Diperbarui setiap kamu memakai situs, paling lama 400 hari; dihapus saat kamu keluar',
    category: 'Wajib',
  },
  {
    names: ['sb-…-auth-token-code-verifier'],
    purpose: 'Mengamankan proses masuk dengan Google (PKCE) supaya sesi tidak bisa dibajak di tengah jalan.',
    lifetime: 'Hanya selama proses masuk',
    category: 'Wajib',
  },
  {
    names: [ACCOUNT_SIDEBAR_COOKIE],
    purpose: 'Mengingat apakah menu samping halaman akun kamu lipat atau buka. Baru dipasang saat kamu menekan tombolnya.',
    lifetime: '1 tahun',
    category: 'Preferensi',
  },
];

const DEMO_COOKIES: readonly StorageItem[] = [
  {
    names: [DEMO_SESSION_COOKIE],
    purpose: 'Sesi akun demo di situs pratinjau ini. Tidak ada di situs utama.',
    lifetime: '7 hari',
    category: 'Wajib',
  },
];

const BROWSER_STORAGE: readonly StorageItem[] = [
  {
    names: [THEME_STORAGE_KEY, MOTION_STORAGE_KEY],
    purpose: 'Tema terang/gelap dan pilihan mengurangi gerak (localStorage).',
    lifetime: 'Sampai kamu mengatur ulang di Pengaturan atau membersihkan data situs',
    category: 'Preferensi',
  },
  {
    names: ['sf-deck-view'],
    purpose: 'Pilihan tampilan tumpukan atau semua kartu di pencocokan tim (localStorage).',
    lifetime: 'Sampai kamu mengubahnya atau membersihkan data situs',
    category: 'Preferensi',
  },
  {
    names: ['sf-deck-skip:…', 'sf-seeker-draft:…', 'sf-deck-hinted'],
    purpose:
      'Kartu yang kamu lewati (hanya penanda orangnya), draf kartu pemainmu supaya tidak hilang bila penyimpanan gagal, dan tanda petunjuk geser sudah tampil (sessionStorage).',
    lifetime: 'Hilang saat tab ditutup; draf juga dihapus begitu kartumu tersimpan',
    category: 'Wajib',
  },
];

const DEMO_STORAGE: readonly StorageItem[] = [
  {
    names: ['sf-demo-…'],
    purpose: 'Isi fitur pratinjau (pesan, ruang diskusi, profil tambahan) akun demo (localStorage).',
    lifetime: 'Sampai data demo diatur ulang atau data situs dibersihkan',
    category: 'Preferensi',
  },
];

function StorageList({ items, label }: { items: readonly StorageItem[]; label: string }) {
  return (
    // Dibungkus <div>: bab dokumen memberi gaya poin pada <ul> anak langsungnya.
    <div>
      <ul aria-label={label} className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item.names[0]} className="flex flex-col gap-2 rounded-card border border-line px-4 py-3.5 text-[14.5px] leading-relaxed">
            <p className="flex items-start justify-between gap-3">
              <span className="flex flex-wrap gap-1.5">
                {item.names.map((name) => (
                  <code key={name} className="rounded-sm bg-panel-nested px-1.5 py-0.5 font-mono text-[13px] font-medium text-ink [overflow-wrap:anywhere]">
                    {name}
                  </code>
                ))}
              </span>
              <span className="shrink-0 rounded-pill border border-line-strong px-2.5 py-0.5 text-[12px] font-semibold text-ink-soft">{item.category}</span>
            </p>
            <p>{item.purpose}</p>
            <p className="text-[13.5px] text-ink-muted">
              <span className="font-semibold text-ink-soft">Masa berlaku:</span> {item.lifetime}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function sections(status: LegalDocumentStatus): readonly LegalSection[] {
  const cookies = demoFeaturesEnabled ? [...COOKIES, ...DEMO_COOKIES] : COOKIES;
  const storage = demoFeaturesEnabled ? [...BROWSER_STORAGE, ...DEMO_STORAGE] : BROWSER_STORAGE;
  return [
    {
      title: 'Apa itu cookie',
      body: (
        <>
          <p>
            Cookie adalah berkas kecil yang disimpan peramban dan dikirim kembali ke situs yang memasangnya. Penyimpanan peramban (localStorage
            dan sessionStorage) mirip, tetapi tetap di perangkatmu dan tidak dikirim ke server kami.
          </p>
          <p>
            Kebijakan ini adalah lampiran <InlineLink href="/privacy-policy">Kebijakan privasi</InlineLink>: pengelola, dasar pemrosesan, dan
            hakmu sama dengan yang dijelaskan di sana. Kami membagi cookie dan penyimpanan ke dua jenis:
          </p>
          <ul>
            <li>
              <strong>Wajib</strong> — tanpanya kamu tidak bisa masuk atau situs tidak aman. Tidak bisa dimatikan dari StudentFo.
            </li>
            <li>
              <strong>Preferensi</strong> — mengingat pilihan yang kamu buat sendiri. Baru dipasang saat kamu memilih.
            </li>
          </ul>
        </>
      ),
    },
    {
      title: 'Cookie yang kami pasang',
      body: (
        <>
          <p>Bagian &ldquo;…&rdquo; pada nama berisi kode proyek basis data kami.</p>
          <StorageList items={cookies} label="Cookie StudentFo" />
        </>
      ),
    },
    {
      title: 'Penyimpanan peramban',
      body: (
        <>
          <p>Disimpan di perangkatmu saja dan tidak pernah dikirim ke server kami:</p>
          <StorageList items={storage} label="Penyimpanan peramban StudentFo" />
        </>
      ),
    },
    {
      title: 'Cookie pihak lain',
      body: (
        <ul>
          <li>
            <strong>Cloudflare Turnstile</strong> — pemeriksa anti-bot yang tampil di formulir daftar, lupa sandi, kirim ulang konfirmasi, dan
            kirim kegiatan. Ia berjalan di bingkai milik Cloudflare (challenges.cloudflare.com) dan dapat memasang cookie keamanan di domain
            Cloudflare untuk membedakan manusia dari bot. Tidak dipakai untuk iklan atau pelacakan.
          </li>
          <li>
            <strong>Google</strong> — bila kamu memilih masuk dengan Google, kamu sejenak berada di situs Google, yang memakai cookie-nya sendiri.
          </li>
          <li>
            <strong>Situs penyelenggara</strong> — tombol daftar dan buku panduan membuka situs penyelenggara. Pratinjau buku panduan di halaman
            kegiatan baru dimuat dari situs penyelenggara saat kamu membukanya; situs itu dapat memasang cookie-nya sendiri.
          </li>
        </ul>
      ),
    },
    {
      title: 'Mengatur dan menghapus',
      body: (
        <>
          <ul>
            <li>
              <strong>Keluar</strong> dari akun menghapus cookie sesi.
            </li>
            <li>
              Pilihan tema dan gerak bisa diatur ulang dari <InlineLink href="/profile/settings">Pengaturan</InlineLink>.
            </li>
            <li>
              Semua cookie dan penyimpanan situs ini bisa dihapus dari pengaturan peramban (biasanya di menu Privasi → Data situs). Memblokir cookie
              wajib membuat kamu tidak bisa masuk.
            </li>
          </ul>
          <p>
            Bila kelak kami ingin memakai cookie analitik atau jenis lain yang tidak wajib, kami akan meminta persetujuanmu lebih dulu dan
            memperbarui daftar di atas.
          </p>
        </>
      ),
    },
    {
      title: 'Kontak',
      body: <ContactNote status={status} />,
    },
  ];
}

/**
 * Kebijakan cookie (ADR-060). Daftar di atas harus cocok dengan kode: setiap
 * cookie/kunci penyimpanan baru wajib ditambahkan di sini dan `LEGAL_REVISION`
 * dinaikkan. Nama yang punya konstanta diambil dari konstanta itu supaya
 * penggantian nama tidak diam-diam membuat dokumen ini basi.
 *
 * Sengaja tanpa spanduk persetujuan: semua cookie wajib atau dipasang atas
 * tindakan pengguna sendiri. Spanduk untuk itu hanya melatih orang menekan
 * "Setuju" tanpa membaca — keputusan ditinjau ulang bila ada cookie opsional.
 */
export default function CookiePolicyPage() {
  const status = privacyStatus();
  return (
    <LegalDocument
      current="cookie"
      title="Kebijakan cookie"
      status={status}
      readMinutes={4}
      summary={SUMMARY}
      sections={sections(status)}
      prefix="kc-"
    />
  );
}
