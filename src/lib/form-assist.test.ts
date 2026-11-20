import { describe, expect, it } from 'vitest';
import type { AnswerValue, EventRegistration, FormField } from '@/types/domain';
import { FORM_TEMPLATES, QUICK_QUESTIONS, templateFromEvent } from './form-templates';
import { LOBBY_INTENT_FOR_TEAM, lobbyHref, MAX_NUDGES, nudgesAfterRegistration, teamEventInvite } from './nudges';
import { profileFillFor, type ProfileFacts } from './profile-fill';
import {
  formFieldsSchema,
  newFieldId,
  OTHER_CHOICE_VALUE,
  otherInputName,
  readAnswers,
  TEAM_STATUSES,
  teamStatusFromAnswers,
  teamStatusOf,
} from './registration-form';
import { summarizeAnswers } from './registration-summary';

/**
 * Pembantu formulir (ADR-094): Status tim, pilihan "Lainnya", tambah cepat,
 * salin formulir, isi dari profil, dan tawaran kontekstual sesudah mendaftar.
 */

const field = (overrides: Partial<FormField> & Pick<FormField, 'type'>): FormField => ({
  id: `f_${overrides.type.replace(/_/g, '')}`,
  label: overrides.type,
  help: null,
  required: true,
  options: [],
  ...overrides,
});

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

const [complete, recruiting, seeking] = TEAM_STATUSES;

describe('Status tim', () => {
  it('pilihan selalu tetap — isi kiriman klien diabaikan; tidak ada "Lainnya"', () => {
    const parsed = formFieldsSchema.parse([{ id: 'f_tim', type: 'team_status', label: 'Status tim', help: null, required: true, options: ['Bebas'], allowOther: true }]);
    expect(parsed[0]?.options).toEqual(TEAM_STATUSES.map((status) => status.label));
    expect(parsed[0]?.allowOther).toBeUndefined();
  });

  it('jawaban harus salah satu label tetap; status dibaca dari jawaban', () => {
    const team = field({ type: 'team_status', id: 'f_tim' });
    expect(readAnswers([team], form({ q_f_tim: seeking.label }))).toEqual({ ok: true, answers: { f_tim: seeking.label } });
    expect(readAnswers([team], form({ q_f_tim: 'Punya tim rahasia' }))).toEqual({ ok: false, fieldId: 'f_tim' });
    expect(readAnswers([team], form({}))).toEqual({ ok: false, fieldId: 'f_tim' });
    expect(teamStatusOf(recruiting.label)).toBe('recruiting');
    expect(teamStatusOf('lainnya')).toBeNull();
    expect(teamStatusFromAnswers([field({ type: 'short_text', id: 'f_a' }), team], { f_a: 'x', f_tim: complete.label })).toBe('complete');
    expect(teamStatusFromAnswers([team], {})).toBeNull();
  });

  it('niat lobi sepadan dengan status tim', () => {
    expect(LOBBY_INTENT_FOR_TEAM).toEqual({ seeking: 'CARI_TIM', recruiting: 'CARI_ANGGOTA', complete: 'SIAP' });
    expect(lobbyHref('lomba-a', 'seeking')).toBe('/lobi/lomba-a?niat=CARI_TIM');
    expect(lobbyHref('lomba a', null)).toBe('/lobi/lomba%20a');
  });
});

describe('pilihan "Lainnya"', () => {
  const single = field({ type: 'select', id: 'f_info', options: ['Instagram', 'Teman'], allowOther: true });
  const multi = field({ type: 'multi_select', id: 'f_bidang', options: ['UI', 'Backend'], allowOther: true });

  it('hanya pilihan ganda & kotak centang yang membawanya', () => {
    const parsed = formFieldsSchema.parse([
      { ...single, allowOther: true },
      { ...field({ type: 'dropdown', id: 'f_drop', options: ['A', 'B'] }), allowOther: true },
    ]);
    expect(parsed[0]?.allowOther).toBe(true);
    expect(parsed[1]?.allowOther).toBeUndefined();
  });

  it('pilihan tunggal: teks wajib diisi, disimpan "Lainnya: …", dirapikan', () => {
    expect(readAnswers([single], form({ q_f_info: OTHER_CHOICE_VALUE, [otherInputName(single)]: '  Poster   kampus ' }))).toEqual({
      ok: true,
      answers: { f_info: 'Lainnya: Poster kampus' },
    });
    expect(readAnswers([single], form({ q_f_info: OTHER_CHOICE_VALUE }))).toEqual({ ok: false, fieldId: 'f_info' });
    expect(readAnswers([single], form({ q_f_info: OTHER_CHOICE_VALUE, [otherInputName(single)]: 'x'.repeat(121) }))).toEqual({
      ok: false,
      fieldId: 'f_info',
    });
    // Tanpa izin "Lainnya", nilainya tidak pernah diterima.
    expect(readAnswers([{ ...single, allowOther: false }], form({ q_f_info: OTHER_CHOICE_VALUE, [otherInputName(single)]: 'X' }))).toEqual({
      ok: false,
      fieldId: 'f_info',
    });
  });

  it('kotak centang: "Lainnya" ikut di daftar jawaban; teks tanpa centang diabaikan', () => {
    expect(readAnswers([multi], form({ q_f_bidang: ['UI', OTHER_CHOICE_VALUE], [otherInputName(multi)]: 'Data' }))).toEqual({
      ok: true,
      answers: { f_bidang: ['UI', 'Lainnya: Data'] },
    });
    expect(readAnswers([multi], form({ q_f_bidang: ['UI'], [otherInputName(multi)]: 'Data' }))).toEqual({ ok: true, answers: { f_bidang: ['UI'] } });
    expect(readAnswers([multi], form({ q_f_bidang: [OTHER_CHOICE_VALUE], [otherInputName(multi)]: ' ' }))).toEqual({ ok: false, fieldId: 'f_bidang' });
  });

  it('ringkasan: "Lainnya: …" dikelompokkan sesudah pilihan tetap, tidak dianggap pilihan lama', () => {
    const registration = (answers: Record<string, AnswerValue>, index: number): EventRegistration => ({
      id: `r${index}`,
      code: 'SF-00000000',
      event: { id: 'e', slug: 'e', title: 'Lomba', organizer: 'Panitia', primaryDeadlineAt: null, eventType: 'LOMBA', status: 'APPROVED' },
      userId: `u${index}`,
      fullName: 'Ana',
      email: 'ana@example.com',
      answers,
      status: 'CONFIRMED',
      feeAmount: null,
      proofUploadedAt: null,
      reviewNote: null,
      reviewedAt: null,
      createdAt: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(),
    });
    const [summary] = summarizeAnswers(
      [single],
      [registration({ f_info: 'Instagram' }, 1), registration({ f_info: 'Lainnya: Poster kampus' }, 2), registration({ f_info: 'Lainnya: poster  kampus' }, 3)],
    );
    expect(summary?.kind).toBe('choice');
    if (summary?.kind !== 'choice') return;
    expect(summary.other).toBe(0);
    expect(summary.options.map((option) => [option.label, option.count])).toEqual([
      ['Instagram', 1],
      ['Teman', 0],
      ['Lainnya: poster kampus', 2],
    ]);
  });
});

describe('tambah cepat & salin formulir', () => {
  it('setiap pertanyaan cepat lolos skema server, kunci & nama unik', () => {
    const parsed = formFieldsSchema.safeParse(QUICK_QUESTIONS.map((question) => ({ ...question.field, id: newFieldId() })));
    expect(parsed.success).toBe(true);
    expect(new Set(QUICK_QUESTIONS.map((question) => question.key)).size).toBe(QUICK_QUESTIONS.length);
    expect(new Set(QUICK_QUESTIONS.map((question) => question.name)).size).toBe(QUICK_QUESTIONS.length);
  });

  it('templat Lomba tim memuat Status tim; nama tim tidak wajib (pendaftar tanpa tim tidak tertahan)', () => {
    const team = FORM_TEMPLATES.find((template) => template.key === 'lomba-tim');
    expect(team?.fields.some((item) => item.type === 'team_status')).toBe(true);
    expect(team?.fields.find((item) => item.label === 'Nama tim')?.required).toBe(false);
  });

  it('salin dari acara lain: id lama dibuang supaya jawaban tidak tertukar', () => {
    const template = templateFromEvent('e1', 'Lomba lama', [field({ type: 'phone', id: 'f_lama', label: 'Nomor WhatsApp' })]);
    expect(template.key).toBe('acara-e1');
    expect(template.fields[0]).not.toHaveProperty('id');
    expect(template.fields[0]?.label).toBe('Nomor WhatsApp');
  });
});

describe('isi dari profil', () => {
  const facts: ProfileFacts = {
    fullName: 'Dinda Pratiwi',
    email: 'dinda@kampus.ac.id',
    institutionName: 'Universitas Contoh',
    educationLevel: 'D4_S1',
    domicile: 'Kota Bandung, Jawa Barat',
  };

  it('mengisi pertanyaan yang jelas menanyakan data pendaftar sendiri', () => {
    const items = profileFillFor(
      [
        field({ type: 'short_text', id: 'f_asal', label: 'Asal sekolah / kampus' }),
        field({ type: 'dropdown', id: 'f_jenjang', label: 'Jenjang pendidikan', options: ['SMA/SMK/MA', 'D3', 'D4/S1', 'S2'] }),
        field({ type: 'short_text', id: 'f_dom', label: 'Domisili' }),
        field({ type: 'email', id: 'f_email', label: 'Email aktif' }),
        field({ type: 'short_text', id: 'f_nama', label: 'Nama lengkap' }),
      ],
      facts,
    );
    expect(items.map((item) => [item.name, item.value])).toEqual([
      ['q_f_asal', 'Universitas Contoh'],
      ['q_f_jenjang', 'D4/S1'],
      ['q_f_dom', 'Kota Bandung, Jawa Barat'],
      ['q_f_email', 'dinda@kampus.ac.id'],
      ['q_f_nama', 'Dinda Pratiwi'],
    ]);
  });

  it('tidak mengisi data orang lain, pilihan jenjang yang ambigu, atau profil yang kosong', () => {
    const items = profileFillFor(
      [
        field({ type: 'long_text', id: 'f_anggota', label: 'Nama & asal sekolah/kampus tiap anggota' }),
        field({ type: 'short_text', id: 'f_pemb', label: 'Asal kampus pembimbing' }),
        field({ type: 'short_text', id: 'f_tim', label: 'Nama tim' }),
        field({ type: 'dropdown', id: 'f_j', label: 'Jenjang', options: ['S1 reguler', 'S1/D4 ekstensi'] }),
      ],
      facts,
    );
    expect(items).toEqual([]);
    expect(profileFillFor([field({ type: 'short_text', id: 'f_asal', label: 'Asal sekolah / kampus' })], { ...facts, institutionName: null })).toEqual([]);
  });

  it('satu sumber hanya mengisi satu pertanyaan', () => {
    const items = profileFillFor(
      [field({ type: 'short_text', id: 'f_a', label: 'Asal kampus' }), field({ type: 'short_text', id: 'f_b', label: 'Nama kampus' })],
      facts,
    );
    expect(items.map((item) => item.name)).toEqual(['q_f_a']);
  });
});

describe('tawaran sesudah mendaftar', () => {
  const base = { eventSlug: 'lomba-a', eventType: 'LOMBA' as const, active: true, eventOpen: true, openTeams: 3 };

  it('belum punya tim → cari partner, tim terbuka, lobi sebagai "Mencari tim" (maks. 3)', () => {
    const nudges = nudgesAfterRegistration({ ...base, teamStatus: 'seeking' });
    expect(nudges.map((nudge) => nudge.key)).toEqual(['cari-partner', 'tim-terbuka', 'lobi']);
    expect(nudges[2]?.href).toBe('/lobi/lomba-a?niat=CARI_TIM');
    expect(nudges.length).toBeLessThanOrEqual(MAX_NUDGES);
  });

  it('tanpa tim terbuka, kartunya tidak menjanjikan angka nol', () => {
    expect(nudgesAfterRegistration({ ...base, teamStatus: 'seeking', openTeams: 0 }).map((nudge) => nudge.key)).toEqual(['cari-partner', 'lobi', 'ajak-teman']);
  });

  it('masih cari anggota → buka lowongan + lobi "Timku butuh anggota"; tim lengkap → lobi & ajak teman', () => {
    expect(nudgesAfterRegistration({ ...base, teamStatus: 'recruiting' }).map((nudge) => nudge.href)).toEqual([
      '/teams/baru?kegiatan=lomba-a',
      '/lobi/lomba-a?niat=CARI_ANGGOTA',
      '/events/lomba-a/bagikan',
    ]);
    expect(nudgesAfterRegistration({ ...base, teamStatus: 'complete' }).map((nudge) => nudge.key)).toEqual(['lobi', 'ajak-teman']);
  });

  it('bukan lomba: tanpa lobi; pendaftaran batal / acara tutup: tanpa tawaran', () => {
    expect(nudgesAfterRegistration({ ...base, eventType: 'BEASISWA', teamStatus: null }).map((nudge) => nudge.key)).toEqual(['ajak-teman']);
    expect(nudgesAfterRegistration({ ...base, active: false, teamStatus: 'seeking' })).toEqual([]);
    expect(nudgesAfterRegistration({ ...base, eventOpen: false, teamStatus: 'seeking' })).toEqual([]);
  });

  it('kartu tim di halaman acara memakai angka nyata; tamu tidak diarahkan ke pencocokan', () => {
    const busy = teamEventInvite({ eventSlug: 'lomba-a', openTeams: 4, signedIn: true });
    expect(busy.text).toContain('4 tim sedang mencari anggota');
    expect(busy.primary.href).toBe('/teams?kegiatan=lomba-a');
    expect(busy.secondary?.href).toBe('/teams/cocok');
    const quiet = teamEventInvite({ eventSlug: 'lomba-a', openTeams: 0, signedIn: false });
    expect(quiet.text).not.toContain('0 tim');
    expect(quiet.primary.href).toBe('/teams?kegiatan=lomba-a');
    expect(quiet.secondary).toBeNull();
  });
});
