import type { DeadlineLabel, EducationLevel, EventStatus, EventType } from './domain';

/**
 * Bentuk baris sebagaimana dikembalikan PostgREST.
 *
 * Ditulis tangan dan sengaja dibatasi pada kolom yang benar-benar
 * di-SELECT. Di proyek dengan DB aktif, berkas ini bisa diganti hasil
 * `supabase gen types typescript`; sampai saat itu, ini adalah kontrak
 * eksplisit antara SQL dan TypeScript — jauh lebih baik daripada `any`
 * yang menyembunyikan salah ketik nama kolom sampai runtime.
 */
export interface EventListingRow {
  id: string;
  slug: string;
  title: string;
  organizer: string;
  description: string | null;
  event_type: EventType;
  registration_link: string;
  source_url: string;
  education_levels: EducationLevel[] | null;
  location: string | null;
  is_online: boolean;
  status: EventStatus;
  saved_count: number;
  created_at: string;
  primary_deadline_at: string | null;
  primary_deadline_label: DeadlineLabel | null;
  category_slugs: string[] | null;
}

export interface EventDeadlineRow {
  id: string;
  label: DeadlineLabel;
  deadline_at: string;
  is_primary: boolean;
}

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
}
