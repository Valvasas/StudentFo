/**
 * Ruang diskusi contoh (kanvas Ruang Diskusi): satu grup per kegiatan,
 * kanal, utas, balasan. Belum ada tabelnya di database (TASKS.md) — utas
 * bawaan tetap & fiktif, sedangkan utas/balasan/suara pengguna hanya
 * tersimpan di peramban.
 */
export const CHANNELS = [
  { key: 'umum', label: 'Umum' },
  { key: 'info', label: 'Pengumuman' },
  { key: 'tanya', label: 'Tanya panitia' },
  { key: 'tim', label: 'Cari tim' },
  { key: 'materi', label: 'Berbagi materi' },
] as const;
export type ChannelKey = (typeof CHANNELS)[number]['key'];
/** Pengumuman hanya untuk panitia; pengguna memilih dari kanal lain. */
export const POSTABLE_CHANNELS = CHANNELS.filter((channel) => channel.key !== 'info');

export interface DemoReply {
  readonly author: string;
  readonly time: string;
  readonly text: string;
  readonly official?: boolean;
}

export interface DemoThread {
  readonly id: string;
  readonly channel: ChannelKey;
  readonly author: string;
  readonly time: string;
  readonly votes: number;
  readonly title: string;
  readonly body: string;
  readonly official?: boolean;
  readonly pinned?: boolean;
  readonly answered?: boolean;
  readonly replies: readonly DemoReply[];
}

export interface DemoGroup {
  readonly id: string;
  readonly eventSlug: string;
  readonly members: number;
  readonly online: number;
  readonly fresh: number;
  readonly threads: readonly DemoThread[];
}

const PANITIA = 'Panitia';

export const DEMO_GROUPS: readonly DemoGroup[] = [
  {
    id: 'g-kipln',
    eventSlug: 'kompetisi-inovasi-perangkat-lunak-nusantara-2026',
    members: 412,
    online: 23,
    fresh: 3,
    threads: [
      {
        id: 'kipln-1',
        channel: 'info',
        official: true,
        pinned: true,
        author: PANITIA,
        time: '2 jam lalu',
        votes: 64,
        title: 'Template proposal dan panduan penilaian sudah tersedia',
        body: 'Template proposal dan rubrik penilaian ada di situs resmi lomba. Proposal maksimal 10 halaman, format PDF, diunggah ketua tim sebelum pendaftaran ditutup.',
        replies: [
          { author: 'Dimas Arya', time: '1 jam lalu', text: 'Terima kasih panitia. Apakah lampiran wawancara pengguna dihitung dalam batas 10 halaman?' },
          { author: PANITIA, time: '48 menit lalu', text: 'Lampiran tidak dihitung, asalkan diletakkan setelah daftar pustaka.', official: true },
        ],
      },
      {
        id: 'kipln-2',
        channel: 'tanya',
        answered: true,
        author: 'Rani Prameswari',
        time: '5 jam lalu',
        votes: 31,
        title: 'Apakah satu tim boleh lintas kampus?',
        body: 'Dua anggota kami dari kampus berbeda. Apakah diperbolehkan, dan siapa yang harus menjadi ketua?',
        replies: [
          { author: PANITIA, time: '4 jam lalu', text: 'Boleh. Semua anggota wajib mahasiswa aktif, dan ketua bebas dari kampus mana pun.', official: true },
          { author: 'Bagas Nugroho', time: '3 jam lalu', text: 'Berarti surat keterangan aktif dikumpulkan masing-masing anggota ya?' },
        ],
      },
      {
        id: 'kipln-3',
        channel: 'tim',
        author: 'Rani Prameswari',
        time: 'Kemarin',
        votes: 12,
        title: 'Cari 2 anggota: frontend dan analis data',
        body: 'Sudah ada backend dan desainer. Detail tim ada di halaman Cari Tim — rapat dua kali seminggu lewat panggilan video.',
        replies: [{ author: 'Dimas Arya', time: 'Kemarin', text: 'Yang tertarik bisa langsung ajukan gabung di halaman tim ya.' }],
      },
      {
        id: 'kipln-4',
        channel: 'materi',
        author: 'Bagas Nugroho',
        time: '2 hari lalu',
        votes: 40,
        title: 'Kumpulan studi kasus layanan publik untuk referensi',
        body: 'Aku rangkum beberapa studi kasus desain ulang layanan publik beserta metode risetnya. Semoga membantu tahap eksplorasi.',
        replies: [],
      },
    ],
  },
  {
    id: 'g-beasiswa',
    eventSlug: 'beasiswa-unggulan-bakti-pendidikan-2026',
    members: 980,
    online: 41,
    fresh: 1,
    threads: [
      {
        id: 'bea-1',
        channel: 'tanya',
        answered: true,
        author: 'Raka Aditya',
        time: '3 jam lalu',
        votes: 22,
        title: 'Sertifikat lomba tingkat kampus bisa dipakai?',
        body: 'Apakah sertifikat juara tingkat fakultas dihitung sebagai prestasi non-akademik?',
        replies: [{ author: PANITIA, time: '2 jam lalu', text: 'Bisa, dengan bobot lebih kecil dibanding tingkat nasional. Lampirkan semua dalam satu PDF.', official: true }],
      },
    ],
  },
  {
    id: 'g-pelatihan',
    eventSlug: 'pelatihan-desain-antarmuka-berbasis-riset',
    members: 156,
    online: 9,
    fresh: 0,
    threads: [
      {
        id: 'pel-1',
        channel: 'materi',
        official: true,
        author: PANITIA,
        time: '5 jam lalu',
        votes: 18,
        title: 'Berkas latihan sesi pertama',
        body: 'Silakan duplikasi berkas latihan sebelum sesi dimulai. Tautannya juga dikirim ke email peserta.',
        replies: [],
      },
    ],
  },
];

export const DISCOVER_SLUGS = ['lomba-karya-tulis-ilmiah-energi-terbarukan', 'program-magang-analis-data-kuartal-ii', 'konferensi-mahasiswa-kesehatan-masyarakat-2026'] as const;

/**
 * Grup "Temukan grup" yang sudah diikuti menjadi grup sungguhan (tanpa utas
 * contoh): masuk ke "Grup kamu", bisa dibuka, dan bisa diisi utas. Tanpa
 * ini tombol Gabung hanya mengganti label — jalan buntu yang terasa rusak.
 */
export const discoverGroupId = (slug: string) => `d-${slug}`;
const DISCOVER_MEMBERS = [86, 214, 57] as const;
export const DISCOVER_GROUPS: readonly DemoGroup[] = DISCOVER_SLUGS.map((slug, index) => ({
  id: discoverGroupId(slug),
  eventSlug: slug,
  members: DISCOVER_MEMBERS[index] ?? 50,
  online: 0,
  fresh: 0,
  threads: [],
}));

export interface DiscussionState {
  readonly votes: readonly string[];
  readonly joined: readonly string[];
  readonly threads: Readonly<Record<string, readonly DemoThread[]>>;
  readonly replies: Readonly<Record<string, readonly DemoReply[]>>;
}

export const DISCUSSIONS_KEY = 'sf-demo-discussions';
export const EMPTY_DISCUSSIONS: DiscussionState = { votes: [], joined: [], threads: {}, replies: {} };
export const TITLE_MAX = 120;
export const BODY_MAX = 1000;

const str = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : null);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 200) : []);

function parseReply(raw: unknown): DemoReply | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const text = str(value.text, BODY_MAX);
  const author = str(value.author, 80);
  const time = str(value.time, 20);
  return text && author && time ? { text, author, time } : null;
}

/** Validasi isi localStorage. Pengguna tidak bisa menyamar jadi panitia: `official` selalu dibuang. */
export function parseDiscussions(raw: unknown): DiscussionState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return EMPTY_DISCUSSIONS;
  const value = raw as Record<string, unknown>;
  const groupIds = new Set([...DEMO_GROUPS, ...DISCOVER_GROUPS].map((group) => group.id));
  const channelKeys = new Set<string>(POSTABLE_CHANNELS.map((channel) => channel.key));

  const threads: Record<string, DemoThread[]> = {};
  const storedThreads = typeof value.threads === 'object' && value.threads !== null ? (value.threads as Record<string, unknown>) : {};
  for (const [groupId, list] of Object.entries(storedThreads)) {
    if (!groupIds.has(groupId) || !Array.isArray(list)) continue;
    threads[groupId] = list
      .map((item): DemoThread | null => {
        if (typeof item !== 'object' || item === null) return null;
        const entry = item as Record<string, unknown>;
        const id = str(entry.id, 40);
        const title = str(entry.title, TITLE_MAX);
        const body = str(entry.body, BODY_MAX);
        const author = str(entry.author, 80);
        const time = str(entry.time, 20);
        const channel = typeof entry.channel === 'string' && channelKeys.has(entry.channel) ? (entry.channel as ChannelKey) : null;
        if (!id?.startsWith('u-') || !title || body === null || !author || !time || !channel) return null;
        return { id, title, body, author, time, channel, votes: 0, replies: [] };
      })
      .filter((item): item is DemoThread => item !== null)
      .slice(0, 50);
  }

  const replies: Record<string, DemoReply[]> = {};
  const storedReplies = typeof value.replies === 'object' && value.replies !== null ? (value.replies as Record<string, unknown>) : {};
  for (const [threadId, list] of Object.entries(storedReplies)) {
    if (!Array.isArray(list) || threadId.length > 40) continue;
    replies[threadId] = list.map(parseReply).filter((item): item is DemoReply => item !== null).slice(0, 100);
  }

  return { votes: strings(value.votes), joined: strings(value.joined).filter((slug) => (DISCOVER_SLUGS as readonly string[]).includes(slug)), threads, replies };
}
