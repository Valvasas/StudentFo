import { NETWORK_LIMITS } from '@/lib/network';
import type { Match } from '@/lib/matchmaking';
import { firstParam, type RawSearchParams } from '@/lib/search-params';

/**
 * "Cari rekan tim" di halaman lomba (ADR-098): pencocokan keahlian yang
 * SUDAH ada (`rankCandidates`, ADR-057) dibawa ke tempat orang memutuskan
 * ikut lomba — fitur sosial tidak berdiri terpisah dari kegiatannya.
 */
export const TEAM_FINDER_LIMIT = 3;

/** `?rekan=lintas` — hanya calon rekan dari kampus/sekolah lain. Tautan biasa, jalan tanpa JavaScript. */
export const CROSS_CAMPUS_PARAM = 'rekan';
export const CROSS_CAMPUS_VALUE = 'lintas';

export function parseCrossCampus(params: RawSearchParams): boolean {
  return firstParam(params[CROSS_CAMPUS_PARAM]) === CROSS_CAMPUS_VALUE;
}

export interface TeamFinderOptions {
  readonly eventCategories: readonly string[];
  readonly viewerInstitutionId: string | null;
  readonly institutionOf: (userId: string) => string | null;
  readonly crossCampus: boolean;
  readonly limit?: number;
}

/**
 * Urutan `rankCandidates` dipertahankan; yang minatnya beririsan dengan
 * bidang lomba ini naik ke depan (partisi stabil). Saringan kampus lain
 * butuh kampus KEDUA pihak — yang tidak diketahui tidak dianggap "lain".
 */
export function pickTeamFinderMatches(matches: readonly Match[], options: TeamFinderOptions): readonly Match[] {
  const pool = options.crossCampus
    ? matches.filter((match) => {
        const theirs = options.institutionOf(match.candidate.person.userId);
        return Boolean(options.viewerInstitutionId && theirs && theirs !== options.viewerInstitutionId);
      })
    : matches;
  const relevant = (match: Match) => match.candidate.person.interests.some((interest) => options.eventCategories.includes(interest));
  return [...pool.filter(relevant), ...pool.filter((match) => !relevant(match))].slice(0, options.limit ?? TEAM_FINDER_LIMIT);
}

/** Pesan ajakan terhubung — dijepit ke batas pesan koneksi supaya tidak ditolak `invalid_connection_message`. */
export function teamInviteMessage(eventTitle: string): string {
  const text = `Halo! Aku lagi cari rekan tim untuk ${eventTitle.trim()} di StudentFo. Keahlianmu pas dengan yang kami butuhkan — mau setim?`;
  return Array.from(text).slice(0, NETWORK_LIMITS.messageMax).join('');
}

/**
 * Ajakan lewat WhatsApp = tautan BAGIKAN (`wa.me/?text=`), bukan pesan ke
 * nomor calon rekan: StudentFo tidak pernah memegang atau menampilkan nomor
 * HP pengguna. Penerimanya dipilih pengirim di WhatsApp sendiri.
 */
export function whatsappInviteHref(eventTitle: string, eventUrl: string): string {
  const text = `Ayo setim di ${eventTitle.trim()}! Detail & pendaftarannya di StudentFo: ${eventUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
