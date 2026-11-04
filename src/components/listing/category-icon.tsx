import {
  Backpack,
  CodeXml,
  Dumbbell,
  FlaskConical,
  HeartPulse,
  LayoutGrid,
  Leaf,
  MessagesSquare,
  NotebookPen,
  Palette,
  PenTool,
  Scale,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

/**
 * Ikon per bidang. Dipetakan eksplisit supaya kosakata visualnya stabil
 * antar rilis — pengguna belajar "kuas pena = desain" setelah beberapa
 * kunjungan. Bidang baru yang belum dipetakan memakai ikon kisi netral.
 *
 * Tidak boleh memakai ikon yang sudah punya arti lain di kartu/detail yang
 * sama (ADR-061): Trofi/Toga/Koper/Mikrofon = JENIS kegiatan
 * (`event-type-icon.tsx`), Toga juga = jenjang, Megafon = Promosi, Gedung
 * pilar/Sekolah = lencana otoritas, Buku terbuka = buku panduan. Satu ikon
 * dengan dua arti di layar yang sama memaksa pembaca menebak mana yang
 * dimaksud.
 */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  teknologi: CodeXml,
  bisnis: TrendingUp,
  sains: FlaskConical,
  desain: PenTool,
  'karya-tulis': NotebookPen,
  debat: MessagesSquare,
  seni: Palette,
  olahraga: Dumbbell,
  kesehatan: HeartPulse,
  sosial: Leaf,
  pendidikan: Backpack,
  hukum: Scale,
};

export function CategoryIcon({ slug, className }: { slug: string | undefined; className?: string }) {
  const Icon = (slug && ICONS[slug]) || LayoutGrid;
  return <Icon aria-hidden className={className ?? 'size-3.5'} />;
}

/** "Teknologi & IT" → "Teknologi" — label ringkas untuk chip & kartu. */
export function shortCategoryName(name: string): string {
  return name.split(' & ')[0] ?? name;
}
