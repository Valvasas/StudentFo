/**
 * Percakapan contoh untuk halaman Pesan (kanvas Pesan). Belum ada tabel
 * pesan di database (TASKS.md), jadi isinya tetap dan fiktif — nama dan
 * penyelenggaranya diambil dari data contoh supaya konsisten dengan
 * halaman lain. Pesan yang diketik pengguna hanya tersimpan di peramban.
 */
export type ConversationKind = 'Tim' | 'Penyelenggara' | 'Pribadi';

export interface DemoMessage {
  readonly from: string; // 'me' = pengguna
  readonly time: string;
  readonly text: string;
  readonly file?: { readonly size: string };
}

export interface DemoConversation {
  readonly id: string;
  readonly name: string;
  readonly kind: ConversationKind;
  readonly official?: boolean;
  readonly eventSlug?: string;
  readonly sub: string;
  readonly time: string;
  readonly unread: number;
  readonly members?: readonly (readonly [name: string, role: string])[];
  readonly messages: readonly DemoMessage[];
  /** Balasan contoh yang muncul setelah pengguna mengirim pesan pertama. */
  readonly reply: DemoMessage;
  readonly quick: readonly string[];
}

export const CONVERSATION_FILTERS = ['Semua', 'Belum dibaca', 'Tim', 'Penyelenggara', 'Pribadi'] as const;
export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number];

export const DEMO_CONVERSATIONS: readonly DemoConversation[] = [
  {
    id: 'tim-hackathon',
    name: 'Tim hackathon',
    kind: 'Tim',
    eventSlug: 'kompetisi-inovasi-perangkat-lunak-nusantara-2026',
    sub: 'Rani, Dimas, dan kamu',
    time: '10.05',
    unread: 2,
    members: [
      ['Rani Prameswari', 'Ketua · Backend'],
      ['Dimas Arya', 'Desainer'],
    ],
    messages: [
      { from: 'Rani Prameswari', time: '09.12', text: 'Pagi semua. Panitia sudah membagikan template proposal, aku taruh juga di ruang diskusi.' },
      { from: 'Dimas Arya', time: '09.20', text: 'Oke, aku mulai bagian latar belakang. Kamu bisa pegang alur pengguna?' },
      { from: 'me', time: '09.31', text: 'Bisa. Aku susun alur dari hasil wawancara minggu lalu, targetnya Kamis.' },
      { from: 'Rani Prameswari', time: '10.02', text: 'Mantap. Jangan lupa pendaftaran tutup pukul 23.59 WIB.' },
      { from: 'Dimas Arya', time: '10.05', text: 'template-proposal-v2.pdf', file: { size: '1,2 MB' } },
    ],
    reply: { from: 'Dimas Arya', time: '', text: 'Siap, nanti aku cek alurnya sebelum kita gabung ke proposal.' },
    quick: ['Siap, aku kerjakan', 'Kita rapat jam berapa?', 'Sudah aku unggah'],
  },
  {
    id: 'panitia-kipln',
    name: 'Universitas Nusantara Digital',
    kind: 'Penyelenggara',
    official: true,
    eventSlug: 'kompetisi-inovasi-perangkat-lunak-nusantara-2026',
    sub: 'Panitia lomba',
    time: '08.40',
    unread: 1,
    messages: [
      {
        from: 'Panitia Kompetisi',
        time: '08.40',
        text: 'Halo, terima kasih sudah bertanya. Surat keterangan aktif boleh dalam format PDF atau JPG, maksimal 2 MB.',
      },
    ],
    reply: { from: 'Panitia Kompetisi', time: '', text: 'Sama-sama. Informasi resmi lainnya selalu kami umumkan di situs lomba.' },
    quick: ['Baik, terima kasih', 'Apakah bisa diunggah ulang?'],
  },
  {
    id: 'bagas',
    name: 'Bagas Nugroho',
    kind: 'Pribadi',
    sub: 'Karya tulis ilmiah',
    time: 'Kemarin',
    unread: 0,
    messages: [
      { from: 'Bagas Nugroho', time: '19.22', text: 'Hai, aku lihat profilmu di Cari Tim. Tertarik gabung tim karya tulis energi terbarukan?' },
      { from: 'me', time: '19.40', text: 'Halo Bagas! Tertarik, boleh ceritakan pembagian tugasnya?' },
      { from: 'Bagas Nugroho', time: '19.43', text: 'Boleh, nanti malam aku kirim kerangkanya ya.' },
    ],
    reply: { from: 'Bagas Nugroho', time: '', text: 'Kerangkanya sudah aku taruh di halaman tim. Kabari ya kalau cocok.' },
    quick: ['Makasih, aku lihat dulu', 'Kamu kosong hari Sabtu?'],
  },
  {
    id: 'rekrutmen-data',
    name: 'PT Data Rekacipta Mandiri',
    kind: 'Penyelenggara',
    official: true,
    eventSlug: 'program-magang-analis-data-kuartal-ii',
    sub: 'Tim rekrutmen',
    time: 'Sen',
    unread: 0,
    messages: [{ from: 'Tim Rekrutmen', time: '14.00', text: 'Terima kasih atas minatnya. Jadwal tes online diumumkan lewat email setelah pendaftaran ditutup.' }],
    reply: { from: 'Tim Rekrutmen', time: '', text: 'Tes berlangsung 60 menit dan bisa dikerjakan dari laptop.' },
    quick: ['Terima kasih, saya siap', 'Berapa lama tesnya?'],
  },
];

export const MESSAGES_KEY = 'sf-demo-messages';
export const MESSAGE_MAX = 1000;

export type StoredMessages = Readonly<Record<string, readonly DemoMessage[]>>;

/** Hanya percakapan yang dikenal, hanya pesan berbentuk benar, dipotong panjangnya. */
export function parseStoredMessages(raw: unknown): StoredMessages {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const value = raw as Record<string, unknown>;
  const result: Record<string, DemoMessage[]> = {};
  for (const conversation of DEMO_CONVERSATIONS) {
    const list = value[conversation.id];
    if (!Array.isArray(list)) continue;
    result[conversation.id] = list
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .filter((item) => typeof item.text === 'string' && typeof item.from === 'string' && typeof item.time === 'string')
      .map((item) => ({ from: String(item.from).slice(0, 80), time: String(item.time).slice(0, 10), text: String(item.text).slice(0, MESSAGE_MAX) }))
      .slice(-100);
  }
  return result;
}
