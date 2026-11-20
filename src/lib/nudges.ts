import type { TeamStatusKey } from '@/lib/registration-form';
import type { EventType, LobbyIntent } from '@/types/domain';

/**
 * Tawaran kontekstual (ADR-094) — "langkah berikutnya" yang dihitung dari
 * keadaan pengguna, bukan iklan yang sama untuk semua orang. Pola yang sama
 * dengan "Langkah awal" (ADR-086): dihitung saat render dari data yang sudah
 * ada, tidak disimpan, dan paling banyak beberapa butir supaya tetap terbaca.
 *
 * Sumber konteks utama: jawaban "Status tim" di formulir pendaftaran —
 * pendaftar yang belum punya tim diantar ke pencocokan partner & tim terbuka,
 * yang kurang anggota ke "Buka lowongan tim", dan semuanya ke lobi lomba
 * dengan niat yang sudah terisi.
 */
export type NudgeIcon = 'handshake' | 'users' | 'user-plus' | 'door' | 'share';

export interface Nudge {
  readonly key: string;
  readonly icon: NudgeIcon;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly cta: string;
}

export interface RegistrationNudgeFacts {
  readonly eventSlug: string;
  readonly eventType: EventType | null;
  /** Pendaftaran masih hidup (bukan dibatalkan/ditolak). */
  readonly active: boolean;
  /** Tenggat belum lewat — tim & lobi masih bermakna. */
  readonly eventOpen: boolean;
  readonly teamStatus: TeamStatusKey | null;
  /** Tim terbuka (masih ada kursi) untuk acara ini; null = tidak dihitung. */
  readonly openTeams: number | null;
}

/** Niat lobi yang sepadan dengan status tim (ADR-071 ↔ ADR-094). */
export const LOBBY_INTENT_FOR_TEAM: Record<TeamStatusKey, LobbyIntent> = {
  seeking: 'CARI_TIM',
  recruiting: 'CARI_ANGGOTA',
  complete: 'SIAP',
};

export const MAX_NUDGES = 3;

const enc = encodeURIComponent;

export function lobbyHref(eventSlug: string, teamStatus: TeamStatusKey | null): string {
  const base = `/lobi/${enc(eventSlug)}`;
  return teamStatus ? `${base}?niat=${LOBBY_INTENT_FOR_TEAM[teamStatus]}` : base;
}

/** Sesudah mendaftar lewat formulir StudentFo (halaman pendaftaran & halaman acara). */
export function nudgesAfterRegistration(facts: RegistrationNudgeFacts): Nudge[] {
  if (!facts.active || !facts.eventOpen) return [];
  const slug = enc(facts.eventSlug);
  const nudges: Nudge[] = [];
  const isCompetition = facts.eventType === 'LOMBA';
  const openTeams = facts.openTeams ?? 0;

  if (facts.teamStatus === 'seeking') {
    nudges.push({
      key: 'cari-partner',
      icon: 'handshake',
      title: 'Kamu belum punya tim — ayo cari partner',
      body: 'Pencocokan keahlian menunjukkan pelajar yang melengkapi kemampuanmu. Ajak jadi partner; kalian terhubung begitu ajakan diterima.',
      href: '/teams/cocok',
      cta: 'Cari partner yang cocok',
    });
    if (openTeams > 0) {
      nudges.push({
        key: 'tim-terbuka',
        icon: 'users',
        title: `${openTeams.toLocaleString('id-ID')} tim sedang mencari anggota`,
        body: 'Tim untuk lomba ini yang masih punya kursi kosong. Lamar yang cocok dengan keahlianmu.',
        href: `/teams?kegiatan=${slug}`,
        cta: 'Lihat tim terbuka',
      });
    }
  } else if (facts.teamStatus === 'recruiting') {
    nudges.push({
      key: 'buka-lowongan',
      icon: 'user-plus',
      title: 'Lengkapi timmu',
      body: 'Buka lowongan tim untuk lomba ini supaya pelajar yang mencari tim bisa melamar — atau cari kandidat sendiri lewat pencocokan.',
      href: `/teams/baru?kegiatan=${slug}`,
      cta: 'Buka lowongan tim',
    });
  }

  if (isCompetition) {
    const intentCopy: Record<TeamStatusKey, string> = {
      seeking: 'Masuk sebagai “Mencari tim” supaya sesama peserta yang kurang anggota menemukanmu.',
      recruiting: 'Masuk sebagai “Timku butuh anggota” — peserta yang mencari tim melihat kartumu.',
      complete: 'Kenali peserta lain dan ajak teman setim terhubung di StudentFo.',
    };
    nudges.push({
      key: 'lobi',
      icon: 'door',
      title: 'Lobi lomba sudah terbuka untukmu',
      body: facts.teamStatus ? intentCopy[facts.teamStatus] : 'Ruang khusus peserta yang sudah mendaftar: lihat siapa saja yang ikut dan cari rekan.',
      href: lobbyHref(facts.eventSlug, facts.teamStatus),
      cta: 'Masuk lobi',
    });
  }

  nudges.push({
    key: 'ajak-teman',
    icon: 'share',
    title: 'Ajak teman ikut',
    body: 'Kirim acara ini ke koneksimu di StudentFo — mereka dikabari lewat notifikasi.',
    href: `/events/${slug}/bagikan`,
    cta: 'Ajak koneksi',
  });

  return nudges.slice(0, MAX_NUDGES);
}

export interface TeamEventNudgeFacts {
  readonly eventSlug: string;
  readonly openTeams: number | null;
  readonly signedIn: boolean;
}

/** Kartu "Lomba ini diikuti per tim" di halaman acara: angka nyata membuat ajakannya terasa hidup. */
export function teamEventInvite({ eventSlug, openTeams, signedIn }: TeamEventNudgeFacts): { text: string; primary: Nudge; secondary: Nudge | null } {
  const slug = enc(eventSlug);
  const count = openTeams ?? 0;
  const text =
    count > 0
      ? `Lomba ini diikuti per tim. ${count.toLocaleString('id-ID')} tim sedang mencari anggota — gabung, atau temukan partner lewat pencocokan keahlian.`
      : 'Lomba ini diikuti per tim. Belum punya tim? Cari partner lewat pencocokan keahlian, atau buka timmu sendiri.';
  const browse: Nudge = { key: 'tim-terbuka', icon: 'users', title: 'Tim terbuka', body: '', href: `/teams?kegiatan=${slug}`, cta: count > 0 ? `Lihat ${count} tim` : 'Cari tim' };
  const match: Nudge = { key: 'cari-partner', icon: 'handshake', title: 'Cari partner', body: '', href: '/teams/cocok', cta: 'Cari partner' };
  // Pencocokan butuh akun; tamu cukup diberi pintu ke daftar tim (gerbang anggota yang menangani sisanya).
  return { text, primary: count > 0 ? browse : signedIn ? match : browse, secondary: signedIn ? (count > 0 ? match : browse) : null };
}
