'use client';

import { useEffect, useRef, useState } from 'react';
import { useStepVisible } from '@/components/ui/step-flow';
import { TURNSTILE_ORIGIN } from '@/lib/security-headers';
import { TURNSTILE_RESPONSE_FIELD } from '@/lib/turnstile';

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, string>): string | null | undefined;
  remove(widgetId: string): void;
}

const turnstileApi = () => (window as Window & { turnstile?: TurnstileApi }).turnstile;

/**
 * Widget Cloudflare Turnstile (mode "managed"), dirender EKSPLISIT. Mode
 * implisit (`.cf-turnstile` + api.js) hanya memindai DOM sekali saat skrip
 * dimuat: setelah navigasi klien widget tidak muncul, dan setelah redirect
 * Server Action ke halaman yang sama DOM lama dipertahankan bersama tokennya
 * yang sudah terpakai (token Turnstile sekali pakai) — setiap kirim ulang
 * berujung `captcha_failed`. Di sini setiap mount merender widget baru dan
 * unmount membuangnya; karena itu pemanggil memberi `key` baru di setiap
 * render server, supaya redirect ke URL yang sama pun me-mount ulang.
 *
 * Di dalam `StepFlow` widget baru dirender saat langkahnya pertama kali tampil:
 * dirender di kontainer `hidden` ia tidak punya ukuran, dan tokennya sudah
 * menua selama orang mengisi langkah-langkah sebelumnya.
 *
 * Skrip membawa nonce CSP request ini — di bawah `strict-dynamic`, skrip
 * pihak ketiga tanpa nonce diblokir walau origin-nya diizinkan.
 */
export function Turnstile({ siteKey, nonce, noscript }: { siteKey: string; nonce: string | undefined; noscript: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const visible = useStepVisible();
  const [armed, setArmed] = useState(visible);
  if (visible && !armed) setArmed(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !armed) return;
    let widgetId: string | null | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Ditunggu dengan polling: `turnstile.ready()` menolak dipakai bila api.js
    // dimuat async/defer.
    const mount = () => {
      const api = turnstileApi();
      if (!api) {
        timer = setTimeout(mount, 100);
        return;
      }
      widgetId = api.render(container, {
        sitekey: siteKey,
        language: 'id',
        theme: 'auto',
        'response-field-name': TURNSTILE_RESPONSE_FIELD,
      });
    };
    mount();

    return () => {
      clearTimeout(timer);
      if (widgetId) turnstileApi()?.remove(widgetId);
    };
  }, [siteKey, armed]);

  return (
    <div className="flex flex-col gap-2">
      <script src={`${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`} async defer nonce={nonce} />
      <div ref={containerRef} className="min-h-[65px]" />
      <noscript>
        <p className="text-sm text-caution">{noscript}</p>
      </noscript>
    </div>
  );
}
