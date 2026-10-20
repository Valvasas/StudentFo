import { distanceBetweenCitiesKm, distanceLabel } from '@/lib/geo';
import type { RawSearchParams } from '@/lib/search-params';
import { firstParam } from '@/lib/search-params';
import {
  EDUCATION_LEVELS,
  SKILL_DOMAIN_LABEL,
  TEAM_SKILL_SLUGS,
  skillDomain,
  skillLabel,
  type Achievement,
  type EducationLevel,
  type PortfolioDigest,
  type SkillDomain,
  type TeamCandidate,
  type TeamSeekerProfile,
  type TeamSkillSlug,
} from '@/types/domain';

/**
 * Pencocokan tim/partner (ADR-057). Logika MURNI — tanpa I/O dan tanpa jam —
 * supaya urutan hasil di mode seed identik dengan produksi dan bisa diuji
 * deterministik. Repository hanya menyediakan kandidat; peringkatnya dihitung
 * di sini, atas jendela kandidat terbatas (pola ADR-021).
 *
 * Prinsip yang membedakannya dari "orang dengan minat sama": tim bagus itu
 * SALING MELENGKAPI. Kecocokan keahlian mengukur apakah kandidat membawa yang
 * kamu cari (dan yang belum ada padamu), bukan seberapa mirip kalian.
 */

export const MATCH_COMPONENTS = ['skills', 'mutual', 'distance', 'portfolio', 'interests', 'level'] as const;
export type MatchComponentKey = (typeof MATCH_COMPONENTS)[number];

/** Jumlah bobot = 1. Mengubahnya = mengubah urutan hasil: sesuaikan uji dan catat di ADR. */
export const MATCH_WEIGHTS: Readonly<Record<MatchComponentKey, number>> = {
  skills: 0.34,
  mutual: 0.12,
  distance: 0.18,
  portfolio: 0.16,
  interests: 0.14,
  level: 0.06,
};

export const MATCH_COMPONENT_LABEL: Readonly<Record<MatchComponentKey, string>> = {
  skills: 'Keahlian',
  mutual: 'Saling butuh',
  distance: 'Jarak',
  portfolio: 'Portofolio',
  interests: 'Minat',
  level: 'Jenjang',
};

/**
 * Gaya tim = cara memandang portofolio:
 *  - seimbang: pengalaman membantu, tetapi bukan segalanya;
 *  - juara: carilah yang paling berpengalaman;
 *  - belajar: carilah yang sepantaran denganmu supaya sama-sama tumbuh.
 */
export const MATCH_STYLES = ['seimbang', 'juara', 'belajar'] as const;
export type MatchStyle = (typeof MATCH_STYLES)[number];

export const MATCH_STYLE_LABEL: Readonly<Record<MatchStyle, { label: string; hint: string }>> = {
  seimbang: { label: 'Seimbang', hint: 'Pengalaman membantu, tapi bukan segalanya' },
  juara: { label: 'Cari yang berpengalaman', hint: 'Utamakan portofolio dan prestasi' },
  belajar: { label: 'Sama-sama belajar', hint: 'Utamakan yang sepantaran denganmu' },
};

/** Bobot capaian untuk kekuatan portofolio. Entri tanpa hasil yang dilaporkan tetap bernilai kecil. */
const ACHIEVEMENT_WEIGHT: Readonly<Record<Achievement, number>> = {
  JUARA_1: 1,
  JUARA_2: 0.85,
  JUARA_3: 0.75,
  JUARA_HARAPAN: 0.6,
  FINALIS: 0.55,
  PENERIMA: 0.5,
  BERSERTIFIKAT: 0.3,
  PESERTA: 0.2,
};
const NO_RESULT_WEIGHT = 0.1;
/**
 * Hanya lima entri terbaik yang dihitung, dan tiap entri berikutnya bernilai
 * 75% dari yang sebelumnya: capaian TERBAIK mendominasi. Tanpa peluruhan,
 * lima ikut-serta biasa (5 × 0,2) menyamai satu juara 1.
 */
const PORTFOLIO_TOP_ENTRIES = 5;
const PORTFOLIO_POSITION_DECAY = 0.75;
const PORTFOLIO_SATURATION = 1.8;

const ACHIEVEMENT_TEXT: Readonly<Record<Achievement, string>> = {
  JUARA_1: 'Juara 1',
  JUARA_2: 'Juara 2',
  JUARA_3: 'Juara 3',
  JUARA_HARAPAN: 'Juara harapan',
  FINALIS: 'Finalis',
  PENERIMA: 'Penerima',
  BERSERTIFIKAT: 'Bersertifikat',
  PESERTA: 'Peserta',
};

const WINNER_ACHIEVEMENTS: readonly Achievement[] = ['JUARA_1', 'JUARA_2', 'JUARA_3', 'JUARA_HARAPAN'];

/** Peluruhan jarak: ±120 km masih 0,71; ±540 km 0,21. Skala ditetapkan agar "satu pulau" masih terasa dekat. */
const DISTANCE_DECAY_KM = 350;
/** Kota yang sama (≤ 15 km antar titik pusat) dihitung sempurna. */
const SAME_CITY_KM = 15;
/** Lantai bila keduanya bersedia kerja daring: tim jarak jauh bisa jalan, jadi jarak tak boleh jadi vonis. */
const REMOTE_FLOOR = 0.5;
const UNKNOWN_DISTANCE_SCORE = 0.3;

export interface MatchViewer {
  readonly userId: string;
  readonly educationLevel: EducationLevel | null;
  readonly major: string | null;
  readonly interests: readonly string[];
  readonly profile: Pick<TeamSeekerProfile, 'city' | 'skills' | 'seeking' | 'remoteOk'>;
  readonly portfolio: PortfolioDigest;
}

export const DISTANCE_CHOICES = [25, 100, 500] as const;
export const PORTFOLIO_FILTERS = ['semua', 'ada', 'juara'] as const;
export type PortfolioFilter = (typeof PORTFOLIO_FILTERS)[number];

export interface MatchFilters {
  /** null = tanpa batas jarak. */
  readonly maxDistanceKm: number | null;
  /** Yang bersedia kerja daring lolos walau jauh (hanya bila keduanya bersedia). */
  readonly includeRemote: boolean;
  /** Kandidat harus punya SALAH SATU keahlian ini; kosong = tanpa saringan. */
  readonly skills: readonly TeamSkillSlug[];
  readonly portfolio: PortfolioFilter;
  readonly sameLevel: boolean;
}

export const DEFAULT_MATCH_FILTERS: MatchFilters = {
  maxDistanceKm: null,
  includeRemote: true,
  skills: [],
  portfolio: 'semua',
  sameLevel: false,
};

export const MATCH_RESULT_LIMIT = 12;

/** Kartu per tampilan: enam dulu, lalu "Tampilkan lebih banyak" menambah enam, sampai 24. */
export const MATCH_PAGE_SIZE = 6;
export const MATCH_SHOWN_CHOICES = [6, 12, 18, 24] as const;

/**
 * Jendela kandidat per pencarian: bawaan 200, batas atas 400 — cermin
 * `list_team_candidates()` (di bawah `max_rows` PostgREST = 1000, ADR-021).
 */
export const MATCH_CANDIDATE_WINDOW = { default: 200, max: 400 } as const;

/** Terapkan jendela dengan aturan SQL yang sama: kosong/NaN → bawaan, lalu jepit ke 1..max. */
export function clampCandidateWindow(limit: number | null | undefined): number {
  const requested = limit === null || limit === undefined || !Number.isFinite(limit) ? MATCH_CANDIDATE_WINDOW.default : Math.trunc(limit);
  return Math.min(Math.max(requested, 1), MATCH_CANDIDATE_WINDOW.max);
}

export interface MatchComponent {
  readonly key: MatchComponentKey;
  readonly label: string;
  /** 0..1 */
  readonly score: number;
  readonly weight: number;
}

export const CHEMISTRIES = ['duo-pelengkap', 'satu-kota', 'jagoan', 'satu-frekuensi', 'sama-sama-belajar', 'kandidat'] as const;
export type Chemistry = (typeof CHEMISTRIES)[number];

export const CHEMISTRY_TEXT: Readonly<Record<Chemistry, { label: string; hint: string }>> = {
  'duo-pelengkap': { label: 'Duo Pelengkap', hint: 'Kalian saling mencari keahlian satu sama lain' },
  'satu-kota': { label: 'Satu Kota', hint: 'Bisa langsung kerja bareng tatap muka' },
  jagoan: { label: 'Jagoan Berpengalaman', hint: 'Portofolionya meyakinkan' },
  'satu-frekuensi': { label: 'Satu Frekuensi', hint: 'Minat dan bidangnya sejalan' },
  'sama-sama-belajar': { label: 'Sama-sama Belajar', hint: 'Sepantaran, tumbuh bersama' },
  kandidat: { label: 'Kandidat Menarik', hint: 'Layak dikenalan dulu' },
};

export interface Match {
  readonly candidate: TeamCandidate;
  /** 0..100, bulat. */
  readonly score: number;
  readonly components: readonly MatchComponent[];
  /** Alasan terkuat (maks. 3), siap tampil. */
  readonly reasons: readonly string[];
  readonly chemistry: Chemistry;
  /** Jarak antarkota, kelipatan 5 km; null bila salah satu kota belum diisi. */
  readonly distanceKm: number | null;
  /** Keahlian yang kamu cari dan ia punya persis. */
  readonly matchedSeeking: readonly TeamSkillSlug[];
  readonly sharedInterests: readonly string[];
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];
const domainsOf = (skills: readonly string[]): Set<SkillDomain> =>
  new Set(skills.map((skill) => skillDomain(skill)).filter((domain): domain is SkillDomain => domain !== null));

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} dan ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, dan ${items.at(-1)}`;
}

/**
 * Kekuatan portofolio 0..1: jenuh (1 − e^(−poin/1,8)) supaya satu juara
 * sudah terasa kuat dan penumpukan entri biasa tidak menembus langit-langit.
 */
export function portfolioStrength(digest: PortfolioDigest): number {
  const weights = digest.achievements
    .map((achievement) => (achievement === null ? NO_RESULT_WEIGHT : ACHIEVEMENT_WEIGHT[achievement]))
    .sort((a, b) => b - a)
    .slice(0, PORTFOLIO_TOP_ENTRIES);
  const points = weights.reduce((sum, weight, position) => sum + weight * PORTFOLIO_POSITION_DECAY ** position, 0);
  return clamp01(1 - Math.exp(-points / PORTFOLIO_SATURATION));
}

function bestAchievement(digest: PortfolioDigest): Achievement | null {
  let best: Achievement | null = null;
  for (const achievement of digest.achievements) {
    if (achievement !== null && (best === null || ACHIEVEMENT_WEIGHT[achievement] > ACHIEVEMENT_WEIGHT[best])) best = achievement;
  }
  return best;
}

/**
 * "3 portofolio publik · terbaik Juara 1 (laporan sendiri)" / null bila kosong.
 * Hasil lomba dilaporkan pemilik profil dan belum diverifikasi penyelenggara
 * (ADR-046), jadi kartu yang dipakai orang untuk memilih rekan tidak boleh
 * menyajikannya seperti fakta terverifikasi.
 */
export function describePortfolio(digest: PortfolioDigest): string | null {
  if (digest.count === 0) return null;
  const best = bestAchievement(digest);
  return best ? `${digest.count} portofolio publik · terbaik ${ACHIEVEMENT_TEXT[best]} (laporan sendiri)` : `${digest.count} kegiatan sudah diikuti`;
}

/** Apakah `owned` memenuhi kebutuhan `wanted`: 1 persis, 0,5 sebidang, 0 tidak. */
function coverage(wanted: readonly string[], owned: readonly string[]): { score: number; exact: TeamSkillSlug[] } {
  if (wanted.length === 0) return { score: 0, exact: [] };
  const ownedSet = new Set(owned);
  const ownedDomains = domainsOf(owned);
  const exact: TeamSkillSlug[] = [];
  let total = 0;
  for (const skill of unique(wanted)) {
    if (ownedSet.has(skill)) {
      total += 1;
      if (TEAM_SKILL_SLUGS.includes(skill as TeamSkillSlug)) exact.push(skill as TeamSkillSlug);
    } else {
      const domain = skillDomain(skill);
      if (domain && ownedDomains.has(domain)) total += 0.5;
    }
  }
  return { score: total / unique(wanted).length, exact };
}

function complement(viewerSkills: readonly string[], candidateSkills: readonly string[]): { score: number; newDomains: SkillDomain[] } {
  const candidateDomains = domainsOf(candidateSkills);
  if (candidateDomains.size === 0) return { score: 0, newDomains: [] };
  const viewerDomains = domainsOf(viewerSkills);
  const newDomains = [...candidateDomains].filter((domain) => !viewerDomains.has(domain));
  const breadth = Math.min(1, unique(candidateSkills).length / 3);
  return { score: 0.75 * (newDomains.length / candidateDomains.size) + 0.25 * breadth, newDomains };
}

export function distanceScore(distanceKm: number | null, remoteBoth: boolean): number {
  const base = distanceKm === null ? UNKNOWN_DISTANCE_SCORE : distanceKm <= SAME_CITY_KM ? 1 : Math.exp(-distanceKm / DISTANCE_DECAY_KM);
  return remoteBoth ? Math.max(base, REMOTE_FLOOR) : base;
}

function levelScore(a: EducationLevel | null, b: EducationLevel | null): number {
  if (a === null || b === null || a === 'UMUM' || b === 'UMUM') return a === b && a !== null ? 1 : 0.5;
  const gap = Math.abs(EDUCATION_LEVELS.indexOf(a) - EDUCATION_LEVELS.indexOf(b));
  return 1 / (1 + gap);
}

const normalizeMajor = (value: string | null) => (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

function interestScore(viewer: MatchViewer, candidate: TeamCandidate): { score: number; shared: string[] } {
  const mine = unique(viewer.interests);
  const theirs = new Set(candidate.person.interests);
  const shared = mine.filter((interest) => theirs.has(interest));
  const sameMajor = normalizeMajor(viewer.major) !== '' && normalizeMajor(viewer.major) === normalizeMajor(candidate.person.major);
  if (mine.length === 0 || theirs.size === 0) return { score: sameMajor ? 0.5 : 0.3, shared };
  const overlap = shared.length / Math.min(mine.length, theirs.size);
  return { score: clamp01(0.85 * overlap + (sameMajor ? 0.15 : 0)), shared };
}

function portfolioScore(viewer: MatchViewer, candidate: TeamCandidate, style: MatchStyle): number {
  const theirs = portfolioStrength(candidate.portfolio);
  if (style === 'belajar') return 1 - Math.abs(theirs - portfolioStrength(viewer.portfolio));
  // Akar pangkat kecil menaikkan portofolio sedang sehingga "ada pengalaman" sudah dihargai.
  const balanced = Math.pow(theirs, 0.7);
  // "Juara" = seimbang + bonus sebanding kekuatan. Dengan kurva yang lebih pelit (linear) memilih
  // "Cari yang berpengalaman" malah MENURUNKAN skor orang paling berpengalaman — membingungkan.
  // Begini ia tak pernah di bawah "seimbang", dan selisihnya makin lebar untuk yang makin kuat (sampai skor penuh 1).
  return style === 'juara' ? Math.min(1, balanced + 0.3 * theirs) : balanced;
}

export function matchDistanceKm(viewer: MatchViewer, candidate: TeamCandidate): number | null {
  return distanceBetweenCitiesKm(viewer.profile.city, candidate.city);
}

/** Saringan keras: kandidat yang tidak lolos tidak pernah masuk peringkat. */
export function passesFilters(viewer: MatchViewer, candidate: TeamCandidate, filters: MatchFilters): boolean {
  // Sudah terhubung = bukan lagi "calon", dan mengajak ulang hanya ditolak server.
  if (candidate.relation === 'connected') return false;

  if (filters.maxDistanceKm !== null) {
    const distance = matchDistanceKm(viewer, candidate);
    const near = distance !== null && distance <= filters.maxDistanceKm;
    const remote = filters.includeRemote && viewer.profile.remoteOk && candidate.remoteOk;
    if (!near && !remote) return false;
  }
  if (filters.skills.length > 0 && !candidate.skills.some((skill) => filters.skills.includes(skill))) return false;
  if (filters.portfolio === 'ada' && candidate.portfolio.count < 1) return false;
  if (filters.portfolio === 'juara' && !candidate.portfolio.achievements.some((a) => a !== null && WINNER_ACHIEVEMENTS.includes(a))) return false;
  if (filters.sameLevel && (viewer.educationLevel === null || candidate.person.educationLevel !== viewer.educationLevel)) return false;
  return true;
}

function chemistryOf(scores: Readonly<Record<MatchComponentKey, number>>, style: MatchStyle, sameCity: boolean): Chemistry {
  if (scores.mutual >= 0.7 && scores.skills >= 0.6) return 'duo-pelengkap';
  if (sameCity && scores.skills >= 0.4) return 'satu-kota';
  if (style !== 'belajar' && scores.portfolio >= 0.75) return 'jagoan';
  if (style === 'belajar' && scores.portfolio >= 0.8 && scores.level >= 0.5) return 'sama-sama-belajar';
  if (scores.interests >= 0.8) return 'satu-frekuensi';
  return 'kandidat';
}

export interface ScoreOptions {
  readonly style: MatchStyle;
  /** Nama tampil kategori; bawaan: slug apa adanya. */
  readonly categoryName?: (slug: string) => string;
}

/** Skor satu kandidat tanpa saringan — dipisah dari `rankCandidates` agar bisa diuji per komponen. */
export function scoreCandidate(viewer: MatchViewer, candidate: TeamCandidate, options: ScoreOptions): Match {
  const categoryName = options.categoryName ?? ((slug: string) => slug);
  const distanceKm = matchDistanceKm(viewer, candidate);
  const remoteBoth = viewer.profile.remoteOk && candidate.remoteOk;

  const wantedByMe = coverage(viewer.profile.seeking, candidate.skills);
  const complemented = complement(viewer.profile.skills, candidate.skills);
  const skills =
    candidate.skills.length === 0
      ? 0
      : viewer.profile.seeking.length > 0
        ? 0.75 * wantedByMe.score + 0.25 * complemented.score
        : complemented.score;

  const wantedByThem = coverage(candidate.seeking, viewer.profile.skills);
  const mutual = candidate.seeking.length === 0 ? 0.5 : wantedByThem.score;

  const interest = interestScore(viewer, candidate);
  const scores: Record<MatchComponentKey, number> = {
    skills: clamp01(skills),
    mutual: clamp01(mutual),
    distance: distanceScore(distanceKm, remoteBoth),
    portfolio: clamp01(portfolioScore(viewer, candidate, options.style)),
    interests: interest.score,
    level: levelScore(viewer.educationLevel, candidate.person.educationLevel),
  };

  const components = MATCH_COMPONENTS.map((key) => ({
    key,
    label: MATCH_COMPONENT_LABEL[key],
    score: scores[key],
    weight: MATCH_WEIGHTS[key],
  }));
  const total = components.reduce((sum, component) => sum + component.score * component.weight, 0);

  const reasons: { weight: number; text: string }[] = [];
  const add = (key: MatchComponentKey, text: string | null) => {
    if (text) reasons.push({ weight: scores[key] * MATCH_WEIGHTS[key], text });
  };

  if (wantedByMe.exact.length > 0) add('skills', `Punya ${joinList(wantedByMe.exact.map(skillLabel))} yang kamu cari`);
  else if (complemented.newDomains.length > 0 && scores.skills >= 0.45) {
    add('skills', `Menambah sisi ${joinList(complemented.newDomains.map((domain) => SKILL_DOMAIN_LABEL[domain].toLowerCase()))} ke timmu`);
  }
  if (wantedByThem.exact.length > 0) add('mutual', `Ia mencari ${joinList(wantedByThem.exact.map(skillLabel))} — dan itu ada padamu`);
  // Jarak 0 = kota yang sama; kota tetangga (Bandung–Cimahi) dekat, tetapi bukan "satu kota".
  if (distanceKm === 0 && viewer.profile.city) add('distance', `Satu kota denganmu (${viewer.profile.city})`);
  else if (distanceKm !== null && distanceKm <= SAME_CITY_KM && candidate.city) add('distance', `Berdekatan denganmu (${candidate.city})`);
  else if (distanceKm !== null && distanceKm <= 500) add('distance', `${distanceLabel(distanceKm)} darimu`);
  else if (remoteBoth) add('distance', 'Sama-sama bersedia kerja daring');
  if (options.style !== 'belajar' || scores.portfolio >= 0.7) add('portfolio', describePortfolio(candidate.portfolio));
  if (interest.shared.length > 0) add('interests', `Minat sama: ${joinList(interest.shared.slice(0, 3).map(categoryName))}`);

  return {
    candidate,
    score: Math.round(clamp01(total) * 100),
    components,
    reasons: reasons.sort((a, b) => b.weight - a.weight).slice(0, 3).map((reason) => reason.text),
    chemistry: chemistryOf(scores, options.style, distanceKm !== null && distanceKm <= SAME_CITY_KM),
    distanceKm,
    matchedSeeking: wantedByMe.exact,
    sharedInterests: interest.shared,
  };
}

/**
 * Saring lalu urutkan: skor menurun, seri diputus userId supaya dua render
 * (dan dua implementasi repository) selalu menghasilkan urutan yang sama.
 */
export function rankCandidates(
  viewer: MatchViewer,
  candidates: readonly TeamCandidate[],
  options: ScoreOptions & { readonly filters: MatchFilters; readonly limit?: number },
): readonly Match[] {
  return candidates
    .filter((candidate) => candidate.person.userId !== viewer.userId && passesFilters(viewer, candidate, options.filters))
    .map((candidate) => scoreCandidate(viewer, candidate, options))
    .sort((a, b) => b.score - a.score || a.candidate.person.userId.localeCompare(b.candidate.person.userId))
    .slice(0, options.limit ?? MATCH_RESULT_LIMIT);
}

// ---------------------------------------------------------------------
// URL <-> saringan. Bentuk kanonik: nilai bawaan tidak ikut ditulis, jadi
// satu kombinasi saringan = satu URL (pola search-params.ts).
// ---------------------------------------------------------------------

export interface MatchQuery {
  readonly filters: MatchFilters;
  readonly style: MatchStyle;
  /** `true` setelah pengguna menekan "Mulai mencari" — memicu animasi pencarian. */
  readonly go: boolean;
  /** Jumlah kartu yang ditampilkan (kelipatan `MATCH_PAGE_SIZE`). */
  readonly show: number;
}

const asList = (value: string | string[] | undefined): string[] => (Array.isArray(value) ? value : value === undefined ? [] : [value]);

export function parseMatchQuery(params: RawSearchParams): MatchQuery {
  const distance = Number(firstParam(params.jarak));
  const portfolio = firstParam(params.portofolio);
  const style = firstParam(params.gaya);
  const shown = Number(firstParam(params.tampil));
  return {
    go: firstParam(params.cari) === '1',
    show: MATCH_SHOWN_CHOICES.find((choice) => choice === shown) ?? MATCH_PAGE_SIZE,
    style: MATCH_STYLES.find((candidate) => candidate === style) ?? 'seimbang',
    filters: {
      maxDistanceKm: DISTANCE_CHOICES.find((choice) => choice === distance) ?? null,
      includeRemote: firstParam(params.daring) !== '0',
      skills: unique(asList(params.keahlian)).filter((slug): slug is TeamSkillSlug => TEAM_SKILL_SLUGS.includes(slug as TeamSkillSlug)),
      portfolio: PORTFOLIO_FILTERS.find((choice) => choice === portfolio) ?? 'semua',
      sameLevel: firstParam(params.jenjang) === 'sama',
    },
  };
}

export function serializeMatchQuery(query: MatchQuery): string {
  const search = new URLSearchParams();
  if (query.go) search.set('cari', '1');
  if (query.filters.maxDistanceKm !== null) search.set('jarak', String(query.filters.maxDistanceKm));
  if (!query.filters.includeRemote) search.set('daring', '0');
  for (const skill of query.filters.skills) search.append('keahlian', skill);
  if (query.filters.portfolio !== 'semua') search.set('portofolio', query.filters.portfolio);
  if (query.filters.sameLevel) search.set('jenjang', 'sama');
  if (query.style !== 'seimbang') search.set('gaya', query.style);
  if (query.show !== MATCH_PAGE_SIZE) search.set('tampil', String(query.show));
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function activeFilterCount(filters: MatchFilters): number {
  return (
    Number(filters.maxDistanceKm !== null) +
    Number(!filters.includeRemote) +
    Number(filters.skills.length > 0) +
    Number(filters.portfolio !== 'semua') +
    Number(filters.sameLevel)
  );
}
