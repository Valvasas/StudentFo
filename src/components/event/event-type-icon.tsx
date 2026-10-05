import { Briefcase, GraduationCap, HeartHandshake, Mic, Presentation, Trophy, Wrench, type LucideIcon } from 'lucide-react';
import type { EventType } from '@/types/domain';

/** Satu ikon tetap per jenis kegiatan, sama alasannya dengan `CategoryIcon`: kosakata yang dipelajari. */
const ICONS: Readonly<Record<EventType, LucideIcon>> = {
  LOMBA: Trophy,
  BEASISWA: GraduationCap,
  MAGANG: Briefcase,
  WORKSHOP: Wrench,
  KONFERENSI: Mic,
  PELATIHAN: Presentation,
  VOLUNTEER: HeartHandshake,
};

export function EventTypeIcon({ type, className }: { type: EventType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon aria-hidden className={className ?? 'size-3.5'} />;
}
