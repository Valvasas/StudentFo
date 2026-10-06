import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CalendarClock, ClipboardCheck, Hourglass, LogIn, Users } from 'lucide-react';
import { EventTypeIcon } from '@/components/event/event-type-icon';
import { ActionFeedback } from '@/components/feedback/action-feedback';
import { RegistrationState } from '@/components/registration/registration-state';
import { RegistrationWizard, type LevelOption, type TeamOption } from '@/components/registration/registration-wizard';
import { SeatMeter } from '@/components/registration/seat-meter';
import { Ticket } from '@/components/registration/ticket';
import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { IllustrationStage } from '@/components/ui/feature-hero';
import { HourglassSketch, TicketSketch } from '@/components/ui/feature-illustrations';
import { CalendarSketch } from '@/components/ui/illustrations';
import { HandNote } from '@/components/ui/sketch';
import { getSessionUser } from '@/lib/auth';
import { getEventRepository } from '@/lib/data';
import { daysLeftLabel, daysUntil, formatDateId } from '@/lib/deadline';
import { ELIGIBILITY_LEVELS } from '@/lib/eligibility';
import { initialStatus, isActiveRegistration, registrationGate, type GateReason } from '@/lib/registration';
import { registrationDraftKey, ticketAgenda, ticketPlace, ticketTint } from '@/lib/registration-view';
import { loginHref } from '@/lib/safe-redirect';
import type { RawSearchParams } from '@/lib/search-params';
import { EDUCATION_LEVEL_LABEL, EDUCATION_LEVELS, EVENT_TYPE_LABEL } from '@/types/domain';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Daftar kegiatan',
  robots: { index: false, follow: false },
};

const CLOSED_TEXT: Record<Exclude<GateReason, 'no_form'>, { title: string; text: string }> = {
  not_open: {
    title: 'Pendaftaran di StudentFo sedang ditutup',
    text: 'Panitia menutup formulir untuk sementara atau kuotanya sudah final. Pantau halaman kegiatannya — tombol daftar muncul lagi kalau dibuka kembali.',
  },
  event_unavailable: {
    title: 'Kegiatan ini tidak menerima pendaftar lagi',
    text: 'Kegiatannya sudah tidak tayang di katalog. Cari peluang serupa yang masih buka.',
  },
  deadline_passed: {
    title: 'Tenggat pendaftaran sudah lewat',
    text: 'Pendaftaran ditutup mengikuti tenggat resmi (WIB). Simpan kegiatan serupa supaya kamu diingatkan sebelum tenggatnya.',
  },
};

function parseFields(raw: string | string[] | undefined): string[] {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? '')
    .split(',')
    .filter((field) => /^[A-Za-z0-9_]{1,24}$/.test(field))
    .slice(0, 12);
}

/**
 * Pendaftaran langsung di StudentFo (ADR-055) — sisi peserta.
 *
 * Satu rute untuk semua keadaan: tamu melihat apa yang perlu disiapkan
 * dan diajak masuk (bukan dilempar ke /login tanpa konteks), peserta yang
 * sudah terdaftar diarahkan ke tiketnya, dan formulir yang tutup/penuh
 * menjelaskan alasannya. Formulirnya wizard bertahap yang tetap satu <form>
 * biasa (lihat RegistrationWizard).
 */
export default async function RegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const repository = await getEventRepository();
  const [event, user] = await Promise.all([repository.getEventBySlug(slug), getSessionUser()]);
  if (!event) notFound();

  const detailPath = `/events/${event.slug}`;
  const selfPath = `${detailPath}/pendaftaran`;
  const [form, seats, mine] = await Promise.all([
    repository.getRegistrationForm(event.id),
    repository.getRegistrationSeats(event.id),
    user ? repository.getMyRegistration(user.id, event.id) : Promise.resolve(null),
  ]);
  // Acara ini tidak memakai pendaftaran langsung (tautan lama/tebakan URL): kembali ke detailnya.
  if (!form) redirect(detailPath);
  if (mine && isActiveRegistration(mine.status)) redirect(`${selfPath}/tiket`);

  const now = new Date();
  const gate = registrationGate(form, event, now);
  const predicted = initialStatus(form, seats);
  const daysLeft = event.primaryDeadlineAt ? daysUntil(event.primaryDeadlineAt, now) : null;
  const minutes = Math.max(2, Math.round(1.5 + form.questions.length * 0.6 + (form.teamSize ? 1 : 0)));
  const stepCount = 2 + (form.questions.length > 0 ? 1 : 0) + (form.teamSize ? 1 : 0);
  const ticket = {
    eventTitle: event.title,
    organizer: event.organizer,
    eventType: event.eventType,
    when: ticketAgenda(event, now),
    where: ticketPlace(event),
    tint: ticketTint(event),
  };

  const facts = [
    {
      icon: predicted === 'WAITLISTED' ? Hourglass : ClipboardCheck,
      text:
        predicted === 'WAITLISTED'
          ? `Kursi penuh · masuk daftar tunggu ke-${seats.waitlisted + 1}`
          : form.reviewMode === 'AUTO'
            ? 'Langsung terdaftar setelah kirim'
            : 'Ditinjau panitia sebelum dikonfirmasi',
    },
    ...(event.primaryDeadlineAt
      ? [{ icon: CalendarClock, text: `Tutup ${formatDateId(event.primaryDeadlineAt)} · ${daysLeftLabel(daysLeft)}` }]
      : []),
    ...(form.teamSize ? [{ icon: Users, text: `Per tim · ${form.teamSize.min}–${form.teamSize.max} orang` }] : []),
  ];

  const hero = (
    <header className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:gap-14">
      <div className="enter flex min-w-0 flex-col gap-4 [animation-duration:900ms]">
        <HandNote className="text-[21px] text-ink-muted">
          {stepCount} langkah · ±{minutes} menit
        </HandNote>
        <p className="-mt-1 flex min-w-0 items-center gap-2 text-[13px] font-semibold text-ink-muted">
          <EventTypeIcon type={event.eventType} className="size-4 shrink-0" />
          <span className="truncate">
            {EVENT_TYPE_LABEL[event.eventType]} · {event.organizer}
          </span>
        </p>
        <h1 className="text-[clamp(30px,4.6vw,50px)] leading-[1.02] [text-wrap:balance]">
          <span className="marker">Daftar</span> {event.title}
        </h1>
        {form.intro ? (
          <figure className="relative mt-1 flex max-w-[60ch] gap-3 rounded-[20px] border border-line bg-panel p-4 pr-5">
            <Avatar name={event.organizer} seed={event.id} size="sm" shape="square" />
            <span className="flex min-w-0 flex-col gap-1">
              <blockquote className="whitespace-pre-line text-[14.5px] leading-relaxed text-ink-soft">{form.intro}</blockquote>
              <figcaption className="text-[12.5px] font-semibold text-ink-muted">— Panitia {event.organizer}</figcaption>
            </span>
          </figure>
        ) : (
          <p className="max-w-[54ch] text-[16px] leading-relaxed text-ink-muted">
            Daftar langsung di StudentFo tanpa pindah ke formulir lain. Tiketmu terbit begitu pendaftaran terkirim, dan setiap kabar dari panitia masuk ke notifikasimu.
          </p>
        )}
        <ul className="mt-1 flex flex-wrap gap-2">
          {facts.map((fact) => (
            <li key={fact.text} className="flex min-h-9 items-center gap-2 rounded-pill border border-line bg-panel px-3 text-[13px] font-medium">
              <fact.icon aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
              {fact.text}
            </li>
          ))}
        </ul>
      </div>
      <IllustrationStage tint={ticket.tint} className="enter hidden min-h-[240px] [animation-delay:140ms] md:flex">
        <TicketSketch />
      </IllustrationStage>
    </header>
  );

  const shell = (body: ReactNode) => (
    <div className="container-page pb-24 pt-6 sm:pt-8">
      <Link href={detailPath} className="mb-4 flex min-h-11 w-fit max-w-full items-center gap-1.5 text-[13.5px] font-medium text-ink-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4 shrink-0" />
        <span className="truncate">Kembali ke detail kegiatan</span>
      </Link>
      {hero}
      <ActionFeedback params={query} className="mt-8 max-w-2xl" />
      <div className="mt-8 sm:mt-10">{body}</div>
    </div>
  );

  if (mine?.status === 'REJECTED') {
    return shell(
      <RegistrationState
        tint="lilac"
        illustration={<HourglassSketch />}
        title="Pendaftaranmu sebelumnya belum diterima"
        actions={
          <>
            <Link href={`${selfPath}/tiket`} className={buttonVariants({ size: 'lg' })}>
              Lihat detail & catatan panitia
            </Link>
            <Link href={detailPath} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
              Kembali ke kegiatan
            </Link>
          </>
        }
      >
        <p>Keputusan panitia bersifat final untuk kegiatan ini, jadi formulirnya tidak bisa dikirim ulang. Kalau menurutmu ada kekeliruan, hubungi panitia lewat kontak resminya.</p>
      </RegistrationState>,
    );
  }

  if (!gate.ok) {
    const copy = CLOSED_TEXT[gate.reason === 'no_form' ? 'not_open' : gate.reason];
    return shell(
      <RegistrationState
        tint="sky"
        illustration={<CalendarSketch className="h-auto w-full max-w-[220px]" />}
        title={copy.title}
        actions={
          <>
            <Link href={`/events?type=${event.eventType}`} className={buttonVariants({ size: 'lg' })}>
              Cari {EVENT_TYPE_LABEL[event.eventType].toLowerCase()} lain
            </Link>
            <Link href={detailPath} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
              Detail kegiatan
            </Link>
          </>
        }
      >
        <p>{copy.text}</p>
        {mine?.status === 'CANCELLED' && <p>Pendaftaranmu sebelumnya sudah dibatalkan.</p>}
      </RegistrationState>,
    );
  }

  if (!predicted) {
    return shell(
      <RegistrationState
        tint="peach"
        illustration={<HourglassSketch />}
        title="Kursinya sudah penuh"
        actions={
          <Link href={detailPath} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
            Kembali ke kegiatan
          </Link>
        }
      >
        <p>
          Semua {seats.capacity?.toLocaleString('id-ID')} kursi sudah terisi dan panitia tidak membuka daftar tunggu. Kursi bisa terbuka lagi kalau ada yang membatalkan —
          simpan kegiatan ini dan cek kembali.
        </p>
      </RegistrationState>,
    );
  }

  const seatCard = (
    <div className="flex flex-col gap-4 rounded-[18px] border border-line bg-panel p-4">
      <SeatMeter seats={seats} waitlist={form.waitlist} />
      {predicted === 'WAITLISTED' && (
        <p className="flex items-start gap-2 border-t border-line pt-3 text-[12.5px] leading-relaxed text-ink-muted">
          <Hourglass aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Kamu akan antre di urutan ke-{seats.waitlisted + 1} dan naik otomatis begitu ada kursi kosong.
        </p>
      )}
    </div>
  );

  if (!user) {
    const steps = [
      'Data diri: WhatsApp, institusi, jenjang',
      ...(form.questions.length > 0 ? [`${form.questions.length} pertanyaan dari panitia`] : []),
      ...(form.teamSize ? [`Tim yang kamu ketuai (${form.teamSize.min}–${form.teamSize.max} orang)`] : []),
      predicted === 'WAITLISTED' ? 'Tinjau, setujui, kirim — langsung masuk antrean' : 'Tinjau, setujui, kirim — tiket langsung terbit',
    ];
    return shell(
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:gap-12">
        <section aria-labelledby="masuk-dulu" className="flex flex-col gap-6 rounded-[24px] border border-line bg-panel p-6 sm:p-8">
          <div className="flex flex-col gap-2">
            <h2 id="masuk-dulu" className="text-[22px] font-bold tracking-[-0.02em]">
              Masuk dulu, lalu daftar dalam ±{minutes} menit
            </h2>
            <p className="text-[14.5px] leading-relaxed text-ink-muted">
              Nama & email diambil dari akunmu, jadi tidak perlu diketik ulang. Status pendaftaran dan kabar dari panitia nanti masuk ke notifikasimu.
            </p>
          </div>
          <ol className="flex flex-col gap-3">
            {steps.map((step, index) => (
              <li key={step} className="rise flex items-center gap-3.5" style={{ '--i': index + 1 } as CSSProperties}>
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-pill border-2 border-ink font-display text-[13px] font-bold">
                  {index + 1}
                </span>
                <span className="text-[14.5px]">{step}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-3 border-t border-line pt-5">
            <Link href={loginHref(selfPath)} className={buttonVariants({ size: 'lg' })}>
              <LogIn aria-hidden /> Masuk untuk mendaftar
            </Link>
            <Link href={`/register?next=${encodeURIComponent(selfPath)}`} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
              Buat akun gratis
            </Link>
          </div>
        </section>
        <aside aria-label="Contoh tiket" className="flex flex-col gap-4">
          <Ticket {...ticket} holder="Namamu" institution="Sekolah / kampusmu" team={form.teamSize ? 'Timmu' : null} code={null} status="PREVIEW" stampLabel="Pratinjau" />
          {seatCard}
        </aside>
      </div>,
    );
  }

  const restricted = event.educationLevels.length > 0 && !event.educationLevels.includes('UMUM');
  const levels: LevelOption[] = (restricted ? ELIGIBILITY_LEVELS : EDUCATION_LEVELS).map((level) => ({
    value: level,
    label: EDUCATION_LEVEL_LABEL[level],
    eligible: !restricted || event.educationLevels.includes(level),
  }));
  const levelHint = restricted
    ? `Kegiatan ini khusus ${event.educationLevels.map((level) => EDUCATION_LEVEL_LABEL[level]).join(' & ')}.`
    : null;

  let teams: TeamOption[] = [];
  let memberOf: string[] = [];
  if (form.teamSize) {
    const size = form.teamSize;
    const eventTeams = await repository.listTeams(event.id);
    const mineTeams = eventTeams.filter((team) => team.members.some((member) => member.userId === user.id));
    teams = mineTeams
      .filter((team) => team.members.some((member) => member.userId === user.id && member.role === 'leader'))
      .map((team) => {
        const count = team.members.length;
        return {
          id: team.id,
          title: team.title,
          members: team.members.map((member) => ({ name: member.fullName, seed: member.userId })),
          problem:
            count < size.min
              ? `Baru ${count} orang — butuh minimal ${size.min}. Ajak anggota lewat halaman timmu.`
              : count > size.max
                ? `${count} orang — maksimal ${size.max}. Kurangi anggota dulu.`
                : null,
        };
      });
    memberOf = mineTeams.filter((team) => !teams.some((led) => led.id === team.id)).map((team) => team.title);
  }

  return shell(
    <RegistrationWizard
      slug={event.slug}
      draftKey={registrationDraftKey(event.id)}
      organizer={event.organizer}
      form={form}
      account={{ id: user.id, fullName: user.fullName, email: user.email }}
      defaults={{
        // Daftar ulang setelah membatalkan: isian lama dipakai lagi, bukan diketik dari nol.
        phone: mine?.phone ?? '',
        institution: mine?.institution ?? '',
        major: mine?.major ?? user.major ?? '',
        educationLevel: mine?.educationLevel ?? user.educationLevel,
      }}
      levels={levels}
      levelHint={levelHint}
      teams={teams}
      memberOf={memberOf}
      newTeamHref={`/teams/baru?kegiatan=${encodeURIComponent(event.slug)}`}
      invalidFields={parseFields(query.fields)}
      prediction={predicted === 'WAITLISTED' || predicted === 'CONFIRMED' ? predicted : 'PENDING'}
      waitlistAhead={seats.waitlisted}
      ticket={ticket}
      seats={seats}
      waitlist={form.waitlist}
    />,
  );
}
