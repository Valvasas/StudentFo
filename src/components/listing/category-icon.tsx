import {
  Activity,
  Briefcase,
  Code2,
  FlaskConical,
  GraduationCap,
  Landmark,
  LayoutGrid,
  Leaf,
  Megaphone,
  Palette,
  PenLine,
  PenTool,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

/**
 * Ikon per bidang. Dipetakan eksplisit supaya kosakata visualnya stabil
 * antar rilis — pengguna belajar "kuas pena = desain" setelah beberapa
 * kunjungan. Bidang baru yang belum dipetakan memakai ikon kisi netral.
 */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  teknologi: Code2,
  bisnis: Briefcase,
  sains: FlaskConical,
  desain: PenTool,
  'karya-tulis': PenLine,
  debat: Megaphone,
  seni: Palette,
  olahraga: Trophy,
  kesehatan: Activity,
  sosial: Leaf,
  pendidikan: GraduationCap,
  hukum: Landmark,
};

export function CategoryIcon({ slug, className }: { slug: string | undefined; className?: string }) {
  const Icon = (slug && ICONS[slug]) || LayoutGrid;
  return <Icon aria-hidden className={className ?? 'size-3.5'} />;
}

/** "Teknologi & IT" → "Teknologi" — label ringkas untuk chip & kartu. */
export function shortCategoryName(name: string): string {
  return name.split(' & ')[0] ?? name;
}
