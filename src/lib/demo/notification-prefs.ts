/**
 * Preferensi notifikasi (kanvas Pengaturan). Belum ada pengirim email/WA
 * sungguhan (TASKS.md), jadi pilihan ini hanya tersimpan di peramban di
 * mode data contoh — antarmukanya bisa diuji tanpa menjanjikan kiriman.
 */
export const NOTIFICATION_CHANNELS = ['email', 'app', 'whatsapp'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export const CHANNEL_LABEL: Record<NotificationChannel, string> = { email: 'Email', app: 'Aplikasi', whatsapp: 'WhatsApp' };

export const NOTIFICATION_TOPICS = [
  { key: 'deadline', label: 'Pengingat tenggat', sub: 'Kegiatan yang kamu simpan akan segera ditutup.' },
  { key: 'status', label: 'Status pendaftaran', sub: 'Perubahan tahap yang kamu catat di Pendaftaran.' },
  { key: 'team', label: 'Ajakan tim', sub: 'Tim yang mengajakmu atau menerima permintaanmu.' },
  { key: 'recommendation', label: 'Rekomendasi baru', sub: 'Kegiatan baru yang cocok dengan peminatanmu.' },
] as const;
export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number]['key'];

export const REMINDER_DAYS = [7, 3, 1] as const;
export const REMINDER_HOURS = ['07:00', '12:00', '19:00'] as const;

export interface NotificationPrefs {
  readonly matrix: Record<NotificationTopic, readonly NotificationChannel[]>;
  readonly days: readonly number[];
  readonly hour: (typeof REMINDER_HOURS)[number];
}

export const NOTIFICATION_PREFS_KEY = 'sf-demo-notif';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  matrix: { deadline: ['email', 'app'], status: ['app'], team: ['app'], recommendation: ['email'] },
  days: [3, 1],
  hour: '07:00',
};

const isChannel = (value: unknown): value is NotificationChannel => NOTIFICATION_CHANNELS.includes(value as NotificationChannel);

export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return DEFAULT_NOTIFICATION_PREFS;
  const value = raw as Record<string, unknown>;
  const storedMatrix = typeof value.matrix === 'object' && value.matrix !== null ? (value.matrix as Record<string, unknown>) : {};
  const matrix = Object.fromEntries(
    NOTIFICATION_TOPICS.map(({ key }) => {
      const list = storedMatrix[key];
      return [key, Array.isArray(list) ? [...new Set(list.filter(isChannel))] : DEFAULT_NOTIFICATION_PREFS.matrix[key]];
    }),
  ) as NotificationPrefs['matrix'];
  const days = Array.isArray(value.days)
    ? REMINDER_DAYS.filter((day) => (value.days as unknown[]).includes(day))
    : DEFAULT_NOTIFICATION_PREFS.days;
  const hour = REMINDER_HOURS.find((item) => item === value.hour) ?? DEFAULT_NOTIFICATION_PREFS.hour;
  return { matrix, days, hour };
}
