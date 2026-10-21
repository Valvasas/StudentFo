import Link from 'next/link';
import { MapPin, Pencil, Wifi } from 'lucide-react';
import { saveSeekerAction } from '@/app/teams/cocok/actions';
import { PAGE } from '@/app/teams/cocok/shared';
import { Avatar } from '@/components/ui/avatar';
import { EDUCATION_LEVEL_LABEL, skillLabel, type TeamSeekerProfile } from '@/types/domain';

/**
 * Ringkasan kartu pemainmu: baris ringkas di bawah `lg`, kolom vertikal di sisi
 * kanan hasil pada `lg` ke atas.
 */
export function CardSummary({
  user,
  profile,
}: {
  user: { id: string; fullName: string; major: string | null; educationLevel: keyof typeof EDUCATION_LEVEL_LABEL | null };
  profile: TeamSeekerProfile;
}) {
  const sub = [user.major, user.educationLevel ? EDUCATION_LEVEL_LABEL[user.educationLevel] : null].filter(Boolean).join(' · ');
  const skills = profile.skills.map(skillLabel).join(' · ');
  const seeking = profile.seeking.map(skillLabel).join(', ');
  return (
    <section
      aria-labelledby="kartumu"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px] border border-line bg-panel p-3.5 lg:flex-col lg:items-stretch lg:p-5"
    >
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-3 lg:flex-none lg:basis-auto lg:flex-col lg:items-start">
        <Avatar name={user.fullName} seed={user.id} size="md" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="kartumu" className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            Kartu pemainmu
          </h2>
          <p className="truncate text-[14.5px] font-semibold lg:overflow-visible lg:whitespace-normal">
            {user.fullName}
            {sub && <span className="font-normal text-ink-muted"> · {sub}</span>}
          </p>
          <ul className="flex flex-wrap gap-x-3.5 gap-y-0.5 text-[12.5px] text-ink-muted">
            <li className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden className="size-3.5" /> {profile.city ?? 'Kota belum diisi'}
            </li>
            {profile.remoteOk && (
              <li className="inline-flex items-center gap-1.5">
                <Wifi aria-hidden className="size-3.5" /> Daring boleh
              </li>
            )}
          </ul>
          <p title={`${skills}${seeking ? ` — mencari ${seeking}` : ''}`} className="truncate text-[12.5px] text-ink-muted lg:overflow-visible lg:whitespace-normal">
            {skills}
            {seeking && <span> — mencari {seeking}</span>}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 lg:flex-col lg:items-stretch">
        <Link href={`${PAGE}?ubah=1`} className="press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-sm border border-line-strong/70 bg-panel px-3.5 text-[13.5px] font-semibold hover:bg-panel-nested">
          <Pencil aria-hidden className="size-3.5" /> Ubah kartu
        </Link>
        {/* Menutup kartu = menyimpan ulang isi yang sama tanpa `open`. Form kecil,
            bukan tautan: mengubah data harus lewat POST (AGENTS.md §6). */}
        <form action={saveSeekerAction} className="lg:contents">
          {profile.city && <input type="hidden" name="city" value={profile.city} />}
          {profile.skills.map((slug) => (
            <input key={`s-${slug}`} type="hidden" name="skills" value={slug} />
          ))}
          {profile.seeking.map((slug) => (
            <input key={`c-${slug}`} type="hidden" name="seeking" value={slug} />
          ))}
          {profile.remoteOk && <input type="hidden" name="remoteOk" value="on" />}
          {profile.pitch && <input type="hidden" name="pitch" value={profile.pitch} />}
          <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center rounded-sm px-3 text-[13.5px] font-medium text-ink-muted underline underline-offset-[3px] hover:text-ink">
            Tutup kartu
          </button>
        </form>
      </div>
    </section>
  );
}
