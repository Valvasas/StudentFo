import type { AuthUser } from '@/lib/auth';
import type { RawSearchParams } from '@/lib/search-params';
import type { TeamSeekerProfile } from '@/types/domain';

export const PAGE = '/teams/cocok';
export const RESULTS_ID = 'hasil-pencocokan';

export interface MatchViewProps {
  readonly user: AuthUser;
  readonly params: RawSearchParams;
  /** Kartu pemain milik pengguna; null = belum pernah dibuat. */
  readonly profile: TeamSeekerProfile | null;
}
