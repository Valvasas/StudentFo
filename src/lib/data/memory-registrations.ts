import { actionError } from '@/lib/action-feedback';
import { jakartaDateKey } from '@/lib/deadline';
import {
  decideTransition,
  generateTicketCode,
  holdsSeat,
  initialStatus,
  isActiveRegistration,
  planPromotions,
  promotedStatus,
  REGISTRATION_LIMITS,
  registrationEligibility,
  registrationGate,
  summarizeRegistrations,
  waitlistPositions,
  type RegistrationDecision,
  type RegistrationFormInput,
  type RegistrationSubmission,
} from '@/lib/registration';
import type {
  AppNotification,
  EducationLevel,
  EventDetail,
  Registration,
  RegistrationForm,
  RegistrationFormStatus,
  RegistrationSeats,
  RegistrationStats,
  TeamMember,
} from '@/types/domain';
import type { RegistrationActor, RegistrationSummary } from './repository';

/**
 * Pendaftaran langsung untuk mode seed (ADR-055). Dipisah dari
 * `memory-repository.ts` dan berbicara lewat `RegistrationHost` — hanya
 * yang benar-benar dibutuhkan dari repository induk. Aturannya tidak ditulis
 * ulang di sini: semua keputusan lewat `lib/registration.ts`, sama dengan
 * yang ditiru RPC Supabase.
 */
export interface RegistrationHost {
  findEvent(eventId: string): EventDetail | undefined;
  findTeam(teamId: string): { id: string; eventId: string; title: string; createdBy: string; members: readonly TeamMember[] } | undefined;
  managesEvent(userId: string, eventId: string): boolean;
  consumeRateLimit(bucket: string, limit: number, windowSeconds: number): boolean;
  notify(userId: string, notification: AppNotification): void;
  /** Tandai "Sudah daftar" di pelacak bila belum lebih jauh dari itu. */
  markApplied(userId: string, eventId: string): void;
  visitorsSince(eventId: string, days: number): number;
}

type Entry = Registration & { cancelledAt: string | null };

const MS_PER_DAY = 86_400_000;

export class MemoryRegistrations {
  private readonly forms = new Map<string, RegistrationForm>();
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly host: RegistrationHost) {}

  // ---------------------------------------------------------------- baca

  publicForm(eventId: string): RegistrationForm | null {
    const form = this.forms.get(eventId);
    return form && form.status !== 'DRAFT' ? form : null;
  }

  seats(eventId: string): RegistrationSeats {
    const list = this.ofEvent(eventId);
    return {
      capacity: this.forms.get(eventId)?.capacity ?? null,
      taken: list.filter((entry) => holdsSeat(entry.status)).length,
      waitlisted: list.filter((entry) => entry.status === 'WAITLISTED').length,
    };
  }

  openEventIds(eventIds: readonly string[]): Set<string> {
    return new Set(eventIds.filter((id) => this.forms.get(id)?.status === 'OPEN'));
  }

  mine(userId: string, eventId: string): Registration | null {
    const entry = this.ofEvent(eventId).find((candidate) => candidate.userId === userId);
    return entry ? this.present(entry) : null;
  }

  // ---------------------------------------------------------------- peserta

  submit(actor: RegistrationActor, eventId: string, input: RegistrationSubmission, now = new Date()): Registration {
    const event = this.host.findEvent(eventId);
    const form = this.forms.get(eventId) ?? null;
    if (!event || !registrationGate(form, event, now).ok || !form) throw actionError('registration_closed');
    if (registrationEligibility(event, input.educationLevel)) throw actionError('registration_not_eligible');

    const existing = this.ofEvent(eventId).find((entry) => entry.userId === actor.id);
    if (existing && isActiveRegistration(existing.status)) throw actionError('registration_exists');
    if (existing?.status === 'REJECTED') throw actionError('registration_rejected_before');
    if (!this.host.consumeRateLimit(`registration:${actor.id}`, REGISTRATION_LIMITS.perHour, 3600)) throw actionError('registration_rate_limited');

    let team: Registration['team'] = null;
    if (form.teamSize) {
      const found = input.teamId ? this.host.findTeam(input.teamId) : undefined;
      const leads = found?.members.some((member) => member.userId === actor.id && member.role === 'leader');
      if (!found || found.eventId !== eventId || !leads || found.members.length < form.teamSize.min || found.members.length > form.teamSize.max) {
        throw actionError('registration_team_invalid');
      }
      team = { id: found.id, title: found.title, members: found.members.map((member) => member.fullName) };
    }

    const status = initialStatus(form, this.seats(eventId));
    if (!status) throw actionError('registration_full');

    const stamp = now.toISOString();
    const entry: Entry = {
      id: existing?.id ?? crypto.randomUUID(),
      eventId,
      userId: actor.id,
      // Kode lama dipakai lagi saat mendaftar ulang: tiket yang sudah dibagikan tetap merujuk orang yang sama.
      code: existing?.code ?? this.uniqueCode(),
      status,
      fullName: actor.fullName,
      email: actor.email,
      phone: input.phone,
      institution: input.institution,
      major: input.major,
      educationLevel: input.educationLevel,
      answers: input.answers,
      team,
      waitlistPosition: null,
      decisionNote: null,
      createdAt: stamp,
      decidedAt: null,
      cancelledAt: null,
    };
    this.entries.set(entry.id, entry);
    this.host.markApplied(actor.id, eventId);
    return this.present(entry);
  }

  cancel(userId: string, eventId: string, now = new Date()): void {
    const entry = this.ofEvent(eventId).find((candidate) => candidate.userId === userId && isActiveRegistration(candidate.status));
    if (!entry) throw actionError('registration_not_found');
    this.entries.set(entry.id, { ...entry, status: 'CANCELLED', cancelledAt: now.toISOString() });
    this.promote(eventId);
  }

  // ---------------------------------------------------------------- studio

  managedForm(actorId: string, eventId: string): RegistrationForm | null {
    this.requireManager(actorId, eventId);
    return this.forms.get(eventId) ?? null;
  }

  save(actorId: string, eventId: string, input: RegistrationFormInput, now = new Date()): void {
    this.requireManager(actorId, eventId);
    const existing = this.forms.get(eventId);
    this.forms.set(eventId, {
      eventId,
      status: existing?.status ?? 'DRAFT',
      openedAt: existing?.openedAt ?? null,
      ...input,
      updatedAt: now.toISOString(),
    });
    // Kuota dinaikkan atau dihapus saat sudah ada antrean: yang menunggu langsung naik.
    this.promote(eventId);
  }

  setStatus(actorId: string, eventId: string, status: Exclude<RegistrationFormStatus, 'DRAFT'>, now = new Date()): void {
    this.requireManager(actorId, eventId);
    const event = this.host.findEvent(eventId);
    const form = this.forms.get(eventId);
    if (!event || !form) throw actionError('registration_form_unavailable');
    if (status === 'OPEN' && !registrationGate({ status: 'OPEN' }, event, now).ok) throw actionError('registration_form_unavailable');
    this.forms.set(eventId, { ...form, status, openedAt: status === 'OPEN' ? (form.openedAt ?? now.toISOString()) : form.openedAt, updatedAt: now.toISOString() });
  }

  list(actorId: string, eventId: string): Registration[] {
    this.requireManager(actorId, eventId);
    return this.ofEvent(eventId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
      .slice(0, REGISTRATION_LIMITS.listMax)
      .map((entry) => this.present(entry));
  }

  decide(actorId: string, registrationId: string, decision: RegistrationDecision, note: string | null, now = new Date()): void {
    const entry = this.entries.get(registrationId);
    if (!entry || !this.host.managesEvent(actorId, entry.eventId)) throw actionError('registration_not_found');
    const form = this.forms.get(entry.eventId);
    if (!form) throw actionError('registration_not_found');
    const next = decideTransition(entry.status, decision, form, this.seats(entry.eventId));
    if (!next) throw actionError('registration_invalid_transition');

    this.entries.set(entry.id, { ...entry, status: next, decidedAt: now.toISOString(), decisionNote: next === 'REJECTED' ? note : null });
    const event = this.host.findEvent(entry.eventId);
    if (event && next === 'CONFIRMED') {
      this.notifyOf(entry.userId, event, 'REGISTRATION_CONFIRMED', `Pendaftaranmu di "${event.title}" dikonfirmasi penyelenggara. Tiketmu sudah aktif.`);
    }
    if (event && next === 'REJECTED') {
      this.notifyOf(entry.userId, event, 'REGISTRATION_REJECTED', `Pendaftaranmu di "${event.title}" belum bisa diterima penyelenggara.${note ? ` Catatan: ${note}` : ''}`);
    }
    if (holdsSeat(entry.status) && !holdsSeat(next)) this.promote(entry.eventId);
  }

  stats(actorId: string, eventId: string, days: number, now = new Date()): RegistrationStats {
    this.requireManager(actorId, eventId);
    return summarizeRegistrations({
      registrations: this.ofEvent(eventId),
      capacity: this.forms.get(eventId)?.capacity ?? null,
      visitors: this.host.visitorsSince(eventId, Math.min(Math.max(days, 7), 90)),
      days,
      now,
    });
  }

  summaries(actorId: string, eventIds: readonly string[]): Map<string, RegistrationSummary> {
    const result = new Map<string, RegistrationSummary>();
    for (const eventId of eventIds) {
      const form = this.forms.get(eventId);
      if (!form || !this.host.managesEvent(actorId, eventId)) continue;
      result.set(eventId, {
        status: form.status,
        seats: this.seats(eventId),
        pending: this.ofEvent(eventId).filter((entry) => entry.status === 'PENDING').length,
      });
    }
    return result;
  }

  // ---------------------------------------------------------------- seed

  /**
   * Formulir & pendaftar contoh. Acara pertama (lomba, pendaftaran tim) dan
   * ketiga (magang) adalah milik persona Penyelenggara demo, jadi pendaftar
   * yang dibuat persona Mahasiswa muncul di studio yang sama. Beasiswa (acara
   * kedua) sengaja tanpa formulir: studio memperlihatkan ajakan membukanya.
   */
  seed(events: readonly EventDetail[], base: Date): void {
    const byTitle = (prefix: string) => events.find((event) => event.status === 'APPROVED' && event.title.startsWith(prefix));
    const plans: { event: EventDetail | undefined; form: Omit<RegistrationForm, 'eventId' | 'updatedAt' | 'openedAt'>; count: number; spreadDays: number }[] = [
      {
        event: byTitle('Kompetisi Inovasi Perangkat Lunak'),
        form: {
          status: 'OPEN',
          reviewMode: 'MANUAL',
          capacity: 40,
          waitlist: true,
          teamSize: { min: 2, max: 4 },
          questions: [
            { id: 'q1', label: 'Tema solusi yang akan kalian angkat', kind: 'SHORT', required: true, options: [] },
            { id: 'q2', label: 'Tautan proposal awal (opsional)', kind: 'URL', required: false, options: [] },
            { id: 'q3', label: 'Pernah ikut kompetisi serupa?', kind: 'CHOICE', required: true, options: ['Belum pernah', 'Sekali', 'Lebih dari sekali'] },
          ],
          intro: 'Satu tim cukup didaftarkan ketuanya. Panitia meninjau setiap pendaftaran dalam 2×24 jam.',
          confirmationNote: 'Selamat, timmu terdaftar! Unggah proposal lengkap paling lambat H-3 penutupan lewat tautan yang dikirim ke email ketua.',
        },
        count: 31,
        spreadDays: 24,
      },
      {
        event: byTitle('Program Magang Analis Data'),
        form: {
          status: 'OPEN',
          reviewMode: 'MANUAL',
          capacity: 30,
          waitlist: true,
          teamSize: null,
          questions: [
            { id: 'q1', label: 'Tautan CV atau portofolio', kind: 'URL', required: true, options: [] },
            { id: 'q2', label: 'Kenapa kamu tertarik dengan analisis data?', kind: 'LONG', required: true, options: [] },
            { id: 'q3', label: 'Bisa mulai bulan', kind: 'CHOICE', required: true, options: ['Juni', 'Juli', 'Agustus'] },
          ],
          intro: 'Isi dengan jujur — tim rekrutmen membaca setiap jawaban.',
          confirmationNote: 'Kandidat yang lolos tahap berkas dihubungi lewat WhatsApp untuk jadwal tes online.',
        },
        count: 22,
        spreadDays: 20,
      },
      {
        event: byTitle('Workshop Riset Kualitatif'),
        form: {
          status: 'OPEN',
          reviewMode: 'AUTO',
          capacity: 50,
          waitlist: true,
          teamSize: null,
          questions: [
            { id: 'q1', label: 'Topik tugas akhirmu (singkat)', kind: 'SHORT', required: false, options: [] },
            { id: 'q2', label: 'Pengalaman riset kualitatif', kind: 'CHOICE', required: true, options: ['Belum pernah', 'Pernah sekali', 'Sering'] },
          ],
          intro: null,
          confirmationNote: 'Tautan ruang kelas daring dikirim H-1 ke email terdaftar. Siapkan satu contoh transkrip wawancaramu.',
        },
        count: 46,
        spreadDays: 18,
      },
      {
        event: byTitle('Workshop Analisis Data dengan Python'),
        form: {
          status: 'OPEN',
          reviewMode: 'AUTO',
          capacity: 40,
          waitlist: true,
          teamSize: null,
          questions: [{ id: 'q1', label: 'Sistem operasi laptopmu', kind: 'CHOICE', required: true, options: ['Windows', 'macOS', 'Linux'] }],
          intro: 'Kelas pemula — tidak perlu pengalaman pemrograman. Bawa laptop sendiri.',
          confirmationNote: 'Pasang Python 3.12 dan Jupyter sebelum hari-H. Panduan instalasi ada di grup koordinasi.',
        },
        count: 46,
        spreadDays: 15,
      },
      {
        event: byTitle('Konferensi Mahasiswa Kesehatan Masyarakat'),
        form: {
          status: 'OPEN',
          reviewMode: 'AUTO',
          capacity: null,
          waitlist: false,
          teamSize: null,
          questions: [{ id: 'q1', label: 'Sesi yang paling ingin kamu ikuti', kind: 'CHOICE', required: true, options: ['Gizi masyarakat', 'Kesehatan lingkungan', 'Kebijakan kesehatan'] }],
          intro: null,
          confirmationNote: 'Sertifikat dikirim ke email setelah mengisi presensi di akhir sesi.',
        },
        count: 64,
        spreadDays: 30,
      },
    ];

    let state = 7;
    const random = () => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state / 2_147_483_648;
    };
    const pick = <T,>(values: readonly T[]): T => values[Math.floor(random() * values.length)] ?? values[0]!;

    for (const plan of plans) {
      if (!plan.event) continue;
      const event = plan.event;
      const openedAt = new Date(base.getTime() - (plan.spreadDays + 1) * MS_PER_DAY).toISOString();
      const form: RegistrationForm = { eventId: event.id, ...plan.form, openedAt, updatedAt: openedAt };
      this.forms.set(event.id, form);
      const levels: readonly EducationLevel[] = event.educationLevels.filter((level) => level !== 'UMUM').length
        ? event.educationLevels.filter((level) => level !== 'UMUM')
        : ['D4_S1'];

      // Nama unik per acara: daftar yang memuat "Tegar Halim" dua kali langsung terbaca sebagai data palsu.
      const usedNames = new Set<string>();
      for (let index = 0; index < plan.count; index += 1) {
        // Lebih rapat menjelang hari ini — kurva pendaftaran acara kampus sungguhan.
        const daysAgo = Math.floor(plan.spreadDays * (1 - Math.sqrt(random())));
        const createdAt = new Date(base.getTime() - daysAgo * MS_PER_DAY - Math.floor(random() * 10 * 3_600_000));
        let fullName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
        for (let retry = 0; retry < 20 && usedNames.has(fullName); retry += 1) fullName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
        usedNames.add(fullName);
        const seats = this.seats(event.id);
        let status = initialStatus(form, seats) ?? 'WAITLISTED';
        const roll = random();
        if (status !== 'WAITLISTED' && roll < 0.06) status = 'CANCELLED';
        if (form.reviewMode === 'MANUAL' && status === 'PENDING' && daysAgo > 2) status = roll < 0.82 ? 'CONFIRMED' : 'REJECTED';
        const decidedAt = status === 'CONFIRMED' && form.reviewMode === 'MANUAL' ? new Date(createdAt.getTime() + (4 + random() * 40) * 3_600_000) : null;
        const id = `seed-reg-${event.id.slice(-4)}-${index}`;
        this.entries.set(id, {
          id,
          eventId: event.id,
          userId: `seed-registrant-${event.id.slice(-4)}-${index}`,
          code: this.uniqueCode(random),
          status,
          fullName,
          email: `${fullName.replace(" ", ".")}${index}@contoh.ac.id`.toLowerCase(),
          phone: `+628${Math.floor(1_000_000_000 + random() * 8_999_999_999)}`.slice(0, 14),
          institution: pick(INSTITUTIONS),
          major: pick(MAJORS),
          educationLevel: pick(levels),
          answers: form.questions
            .filter((question) => question.required || random() < 0.5)
            .map((question) => ({ questionId: question.id, label: question.label, value: sampleAnswer(question.kind, question.options, pick) })),
          team: form.teamSize
            ? {
                id: `seed-team-${index}`,
                title: `Tim ${pick(TEAM_WORDS)} ${pick(TEAM_WORDS)}`,
                members: [fullName, ...Array.from({ length: 1 + Math.floor(random() * 3) }, () => `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`)],
              }
            : null,
          waitlistPosition: null,
          decisionNote: status === 'REJECTED' ? 'Tema belum sesuai ketentuan kategori.' : null,
          createdAt: createdAt.toISOString(),
          decidedAt: decidedAt && decidedAt < base ? decidedAt.toISOString() : status === 'REJECTED' ? createdAt.toISOString() : null,
          cancelledAt: status === 'CANCELLED' ? new Date(createdAt.getTime() + 2 * MS_PER_DAY).toISOString() : null,
        });
      }
    }
  }

  // ---------------------------------------------------------------- dalam

  private requireManager(actorId: string, eventId: string): void {
    if (!this.host.managesEvent(actorId, eventId)) throw actionError('not_event_manager');
  }

  private ofEvent(eventId: string): Entry[] {
    return [...this.entries.values()].filter((entry) => entry.eventId === eventId);
  }

  private present(entry: Entry): Registration {
    const position = entry.status === 'WAITLISTED' ? (waitlistPositions(this.ofEvent(entry.eventId)).get(entry.id) ?? null) : null;
    const { cancelledAt: _cancelledAt, ...registration } = entry;
    return { ...registration, waitlistPosition: position };
  }

  private uniqueCode(random: () => number = Math.random): string {
    const taken = new Set([...this.entries.values()].map((entry) => entry.code));
    for (;;) {
      const code = generateTicketCode(random);
      if (!taken.has(code)) return code;
    }
  }

  /** Kursi yang lowong diberikan ke daftar tunggu, FIFO — cermin `promote_event_waitlist()`. */
  private promote(eventId: string): void {
    const form = this.forms.get(eventId);
    const event = this.host.findEvent(eventId);
    if (!form || !event) return;
    for (const id of planPromotions(form, this.ofEvent(eventId))) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      this.entries.set(id, { ...entry, status: promotedStatus(form) });
      this.notifyOf(
        entry.userId,
        event,
        'REGISTRATION_PROMOTED',
        form.reviewMode === 'AUTO'
          ? `Ada kursi kosong di "${event.title}" — kamu naik dari daftar tunggu dan kini terdaftar.`
          : `Ada kursi kosong di "${event.title}" — pendaftaranmu naik dari daftar tunggu dan sedang ditinjau penyelenggara.`,
      );
    }
  }

  private notifyOf(userId: string, event: EventDetail, type: AppNotification['type'], message: string): void {
    this.host.notify(userId, {
      id: `notif-registration-${type}-${event.id}-${userId}-${jakartaDateKey(new Date())}`,
      type,
      message,
      isRead: false,
      sentAt: new Date().toISOString(),
      event: { id: event.id, slug: event.slug, title: event.title },
    });
  }
}

function sampleAnswer(kind: string, options: readonly string[], pick: <T>(values: readonly T[]) => T): string {
  if (kind === 'CHOICE') return pick(options);
  if (kind === 'URL') return `https://contoh.id/${pick(['portofolio', 'cv', 'proposal', 'karya'])}`;
  if (kind === 'LONG') return pick(LONG_ANSWERS);
  return pick(SHORT_ANSWERS);
}

const FIRST_NAMES = ['Aulia', 'Bima', 'Citra', 'Dewi', 'Eka', 'Fikri', 'Gita', 'Hana', 'Ilham', 'Jihan', 'Kevin', 'Laras', 'Maya', 'Nanda', 'Oki', 'Putri', 'Rafi', 'Sari', 'Tegar', 'Umi', 'Vina', 'Wahyu', 'Yusuf', 'Zahra'] as const;
const LAST_NAMES = ['Saputra', 'Lestari', 'Wibowo', 'Rahmawati', 'Hidayat', 'Kusuma', 'Pratama', 'Nugraha', 'Anggraini', 'Siregar', 'Halim', 'Wijaya', 'Permata', 'Setiawan'] as const;
const INSTITUTIONS = ['Universitas Indonesia', 'Institut Teknologi Bandung', 'Universitas Gadjah Mada', 'Institut Teknologi Sepuluh Nopember', 'Universitas Airlangga', 'Universitas Brawijaya', 'Telkom University', 'Universitas Padjadjaran', 'Politeknik Negeri Jakarta', 'Universitas Hasanuddin'] as const;
const MAJORS = ['Teknik Informatika', 'Sistem Informasi', 'Statistika', 'Kesehatan Masyarakat', 'Desain Komunikasi Visual', 'Manajemen', 'Teknik Elektro'] as const;
const TEAM_WORDS = ['Nusantara', 'Cakrawala', 'Lentera', 'Sinergi', 'Arunika', 'Bahtera', 'Kompas', 'Padi'] as const;
const SHORT_ANSWERS = ['Antrean layanan puskesmas', 'Sampah plastik kampus', 'Literasi keuangan remaja', 'Transportasi desa', 'Ketahanan pangan lokal'] as const;
const LONG_ANSWERS = [
  'Saya terbiasa merapikan data survei organisasi dan ingin belajar alur analisis yang dipakai industri.',
  'Tugas akhir saya memakai regresi logistik; magang ini kesempatan menerapkannya ke data nyata.',
  'Saya suka mencari pola dari data dan menceritakannya lewat visualisasi yang mudah dipahami.',
] as const;
