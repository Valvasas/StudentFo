"""Notifikasi kegagalan ke Telegram (Blueprint §7 langkah 6, §2 monitoring).

Aturan ambang: pipeline dianggap gagal kalau crash, ATAU kalau lebih dari
30% sumber gagal di-parse. Ambang 30% bukan angka acak — satu situs yang
mengubah tata letaknya itu normal dan akan diperbaiki di siklus berikutnya;
sepertiga sumber gagal bersamaan hampir selalu berarti masalah di sisi kita
(kunci API kedaluwarsa, kuota habis, perubahan model).

Peringatan yang terlalu sering justru berbahaya: tim berhenti membacanya.
"""

from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

FAILURE_THRESHOLD = 0.30


def should_alert(total_sources: int, failed_sources: int, crashed: bool) -> bool:
    if crashed:
        return True
    if total_sources == 0:
        return True  # tidak ada sumber aktif juga sebuah kesalahan konfigurasi
    return (failed_sources / total_sources) > FAILURE_THRESHOLD


def send_telegram_alert(message: str) -> None:
    """Kirim peringatan. Kegagalan mengirim TIDAK boleh menjatuhkan pipeline."""
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")

    if not token or not chat_id:
        logger.warning("Telegram belum dikonfigurasi; peringatan hanya dicatat di log:\n%s", message)
        return

    try:
        httpx.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
            timeout=10,
        ).raise_for_status()
    except httpx.HTTPError as exc:
        logger.error("Peringatan Telegram gagal dikirim: %s", exc)
