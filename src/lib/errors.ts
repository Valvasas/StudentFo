/**
 * Kontrak error aplikasi — Blueprint §9: "response error terstruktur
 * ({ error: string, code: string })".
 *
 * Aturan yang dipegang di seluruh kodebase: pesan yang dikirim ke klien
 * selalu ditulis manusia dan aman dibaca siapa pun. Detail teknis (stack,
 * pesan driver DB) hanya masuk log server — pesan error Postgres mentah
 * bisa membocorkan nama tabel, kolom, dan bentuk query ke penyerang.
 */

export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  UPSTREAM_FAILURE: 'UPSTREAM_FAILURE',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorBody {
  readonly error: string;
  readonly code: ErrorCode;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  /**
   * Kunci alasan yang bisa dioper lewat URL (lihat `action-feedback.ts`).
   * Yang dioper ke URL selalu KUNCI ini, tidak pernah `message`.
   */
  readonly reason: string | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus = 500,
    options?: { cause?: unknown; reason?: string },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.reason = options?.reason;
  }

  toBody(): ApiErrorBody {
    return { error: this.message, code: this.code };
  }
}

export const notFound = (what = 'Data yang kamu cari tidak ditemukan.'): AppError =>
  new AppError(ERROR_CODES.NOT_FOUND, what, 404);

export const validationFailed = (message: string): AppError =>
  new AppError(ERROR_CODES.VALIDATION_FAILED, message, 422);

export const unauthorized = (message = 'Kamu perlu masuk untuk melakukan ini.'): AppError =>
  new AppError(ERROR_CODES.UNAUTHORIZED, message, 401);

export const forbidden = (message = 'Kamu tidak punya akses ke tindakan ini.'): AppError =>
  new AppError(ERROR_CODES.FORBIDDEN, message, 403);

/**
 * Kegagalan dari layanan hulu (Supabase/PostgREST). Pesan driver asli hanya
 * disimpan sebagai `cause` untuk log server — tidak pernah jadi `message`.
 */
export const upstreamFailure = (message: string, cause: unknown, httpStatus = 502): AppError =>
  new AppError(ERROR_CODES.UPSTREAM_FAILURE, message, httpStatus, { cause });

/**
 * Ubah error apa pun jadi bentuk yang aman dikirim ke klien.
 * Error tak dikenal SELALU dilaporkan sebagai INTERNAL generik — inilah
 * batas antara "informatif" dan "bocor".
 */
export function toApiError(error: unknown): { body: ApiErrorBody; status: number } {
  if (error instanceof AppError) {
    return { body: error.toBody(), status: error.httpStatus };
  }

  console.error('[unhandled]', error);
  return {
    body: {
      error: 'Terjadi kesalahan di sisi kami. Coba lagi sebentar lagi.',
      code: ERROR_CODES.INTERNAL,
    },
    status: 500,
  };
}
