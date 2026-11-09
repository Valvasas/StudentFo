/**
 * Jenis satuan pendidikan di direktori tempat studi (ADR-076). Modul tanpa
 * data — aman diimpor komponen klien; datanya sendiri (±45 ribu baris) hanya
 * di server (`lib/institutions.ts`).
 */
export const INSTITUTION_KINDS = ['PTN', 'PTS', 'PTK', 'SMA', 'SMK', 'MA', 'SLB'] as const;
export type InstitutionKind = (typeof INSTITUTION_KINDS)[number];

export const INSTITUTION_KIND_LABEL: Record<InstitutionKind, string> = {
  PTN: 'PTN',
  PTS: 'PTS',
  PTK: 'Kedinasan',
  SMA: 'SMA',
  SMK: 'SMK',
  MA: 'MA',
  SLB: 'SLB',
};

export function isCampusKind(kind: InstitutionKind): boolean {
  return kind === 'PTN' || kind === 'PTS' || kind === 'PTK';
}

/** Hasil pencarian yang dikirim ke peramban — tanpa alamat, cukup untuk dikenali. */
export interface InstitutionHit {
  readonly id: string;
  readonly name: string;
  /** Singkatan resmi/lazim yang dikurasi (UI, ITB, UGM); null bila tidak ada yang pasti. */
  readonly short: string | null;
  readonly kind: InstitutionKind;
  readonly negeri: boolean;
  /** "Kota Depok, Jawa Barat" — null bila sumber tidak mencatat lokasinya dengan benar. */
  readonly region: string | null;
}

/** NPSN sekolah (8 digit) atau kode PT PDDikti (6 digit). */
export const INSTITUTION_ID = /^[0-9A-Z]{5,12}$/;

/** "Universitas Indonesia (UI)" — bentuk tampilan di profil, lobi, dan kartu koneksi. */
export function institutionDisplayName(name: string, short: string | null | undefined): string {
  if (!short) return name;
  // "Politeknik Statistika STIS" sudah memuat singkatannya — tidak ditulis dua kali.
  const inName = name.split(/[\s()-]+/).some((word) => word.toLowerCase() === short.toLowerCase());
  return inName ? name : `${name} (${short})`;
}
