#!/usr/bin/env python3
"""Titik masuk pipeline (Blueprint §7).

    python pipeline/run.py --config pipeline/config/sources.yaml [--dry-run]

Alur: EXTRACT -> PARSE -> VALIDATE -> STAGE(PENDING) -> ALERT.
Penerbitan ke publik TIDAK ada di sini; itu keputusan manusia di /admin.

Dijadwalkan 02:00 WIB (19:00 UTC hari sebelumnya) lewat GitHub Actions atau
Vercel Cron.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from studentfo_pipeline.alerts import send_telegram_alert, should_alert  # noqa: E402
from studentfo_pipeline.config import Source, load_config  # noqa: E402
from studentfo_pipeline.extractor import html_to_text, parse_events  # noqa: E402
from studentfo_pipeline.fetcher import PoliteFetcher, build_client  # noqa: E402
from studentfo_pipeline.models import ValidatedEvent, compute_dedup_hash  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("pipeline")


async def process_source(
    source: Source,
    fetcher: PoliteFetcher,
    client,
    category_slugs: list[str],
    extract_fn,
) -> tuple[list[ValidatedEvent], list[str]]:
    """Olah satu sumber. Mengembalikan (event valid, daftar kesalahan)."""
    fetch = fetcher.fetch_rendered if source.requires_javascript else fetcher.fetch
    html = await fetch(client, source.start_url)
    if html is None:
        return [], [f"{source.id}: halaman tidak bisa diambil atau dilarang robots.txt"]

    content = html_to_text(html, source.content_selector)
    if len(content) < 200:
        return [], [f"{source.id}: isi halaman terlalu pendek setelah dipangkas"]

    raw_json = await extract_fn(content, source.start_url, category_slugs)
    extracted, errors = parse_events(raw_json, source.start_url)

    validated = [
        ValidatedEvent(
            title=event.title,
            organizer=event.organizer,
            description=event.description,
            event_type=event.event_type,
            registration_link=str(event.registration_link),
            source_url=source.start_url,
            dedup_hash=compute_dedup_hash(event.title, event.organizer),
            education_levels=event.education_levels,
            location=event.location,
            is_online=event.is_online,
            categories=event.categories,
            deadlines=event.deadlines,
        )
        for event in extracted
    ]
    return validated, [f"{source.id}: {error}" for error in errors]


def dry_run_dependencies():
    """Kategori contoh + ekstraktor tiruan: seluruh alur jalan tanpa kunci apa pun."""

    async def extract_fn(content: str, url: str, slugs: list[str]) -> str:
        logger.info("[dry-run] akan mengirim %d karakter ke Gemini dari %s", len(content), url)
        return "[]"

    return ["teknologi", "bisnis", "sains", "desain"], extract_fn


def live_dependencies():
    """Klien Supabase, taksonomi dari database, dan ekstraktor Gemini."""
    # Impor ditunda sampai dibutuhkan supaya --dry-run bisa dijalankan di
    # mesin tanpa kredensial Supabase/Gemini terpasang.
    from google import genai
    from supabase import create_client

    from studentfo_pipeline.extractor import PROMPT, build_response_schema
    from studentfo_pipeline.publisher import fetch_category_slugs

    missing = [
        name
        for name in ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY")
        if not os.getenv(name)
    ]
    if missing:
        raise RuntimeError(f"variabel lingkungan belum diisi: {', '.join(missing)}")

    supabase = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    category_slugs = fetch_category_slugs(supabase)

    genai_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    # Id model pihak ketiga bisa dipensiunkan tanpa ada perubahan di repo
    # ini. Diambil dari env supaya penggantiannya cukup lewat secret CI,
    # bukan rilis kode.
    gemini_model = os.getenv("GEMINI_MODEL") or "gemini-2.0-flash"

    async def extract_fn(content: str, url: str, slugs: list[str]) -> str:
        response = await asyncio.to_thread(
            genai_client.models.generate_content,
            model=gemini_model,
            contents=PROMPT.format(source_url=url, content=content),
            config={
                "response_mime_type": "application/json",
                "response_schema": build_response_schema(slugs),
                # Suhu 0: ini tugas ekstraksi, bukan penulisan kreatif.
                # Variasi keluaran di sini hanya berarti kesalahan.
                "temperature": 0,
            },
        )
        return response.text or "[]"

    return supabase, category_slugs, extract_fn


async def main() -> int:
    parser = argparse.ArgumentParser(description="Pipeline agregasi StudentFo")
    parser.add_argument("--config", type=Path, default=Path("pipeline/config/sources.yaml"))
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Jalankan seluruh alur tanpa menulis apa pun ke database.",
    )
    parser.add_argument(
        "--allow-no-sources",
        action="store_true",
        help="Jangan anggap 0 sumber aktif sebagai kegagalan. Hanya untuk smoke test CI "
        "dengan sources.example.yaml (semua sumbernya sengaja nonaktif).",
    )
    args = parser.parse_args()

    if not args.config.exists():
        logger.error("Berkas konfigurasi tidak ditemukan: %s", args.config)
        logger.error("Salin pipeline/config/sources.example.yaml lalu sesuaikan.")
        return 2

    config = load_config(args.config)
    sources = config.active_sources
    logger.info("Memuat %d sumber aktif", len(sources))

    crashed = False
    failed_sources = 0
    all_events: list[ValidatedEvent] = []
    all_errors: list[str] = []
    supabase = None

    try:
        # Setup kredensial ikut di dalam jaring crash: kunci yang hilang atau
        # database yang tidak terjangkau adalah kegagalan yang PALING perlu
        # dikabarkan, bukan traceback yang hanya terlihat di log CI.
        if args.dry_run:
            category_slugs, extract_fn = dry_run_dependencies()
        else:
            supabase, category_slugs, extract_fn = live_dependencies()

        fetcher = PoliteFetcher(policy=config.policy)
        async with build_client() as client:
            for source in sources:
                try:
                    events, errors = await process_source(
                        source, fetcher, client, category_slugs, extract_fn
                    )
                    all_events.extend(events)
                    all_errors.extend(errors)
                    # Gagal = tidak menghasilkan apa-apa DAN ada kesalahan.
                    # Halaman yang sah tapi sedang tidak punya kegiatan buka
                    # (jawaban "[]") itu normal, bukan alasan membangunkan orang.
                    if not events and errors:
                        failed_sources += 1
                    logger.info("%s: %d event valid, %d kesalahan", source.id, len(events), len(errors))
                except Exception as exc:
                    failed_sources += 1
                    all_errors.append(f"{source.id}: kesalahan tak terduga: {exc}")
                    logger.exception("Sumber %s gagal total", source.id)
    except Exception as exc:
        crashed = True
        all_errors.append(f"pipeline crash: {exc}")
        logger.exception("Pipeline berhenti karena kesalahan fatal")

    if args.dry_run or supabase is None:
        logger.info("[dry-run] %d event akan ditulis sebagai PENDING", len(all_events))
    elif all_events:
        from studentfo_pipeline.publisher import publish

        result = publish(supabase, all_events)
        logger.info(
            "Publikasi selesai: %d baru, %d duplikat, %d gagal",
            result.inserted,
            result.duplicates,
            result.failed,
        )

    if not sources and args.allow_no_sources and not crashed:
        logger.info("0 sumber aktif diizinkan (--allow-no-sources); tidak ada peringatan.")
        return 0

    if should_alert(len(sources), failed_sources, crashed):
        if args.dry_run:
            # Latihan kering tidak boleh membangunkan tim di Telegram.
            logger.warning(
                "[dry-run] run sungguhan akan mengirim peringatan: %d/%d sumber gagal, crash=%s",
                failed_sources,
                len(sources),
                crashed,
            )
            for error in all_errors[:10]:
                logger.warning("[dry-run]   %s", error)
            return 1
        send_telegram_alert(
            "<b>Pipeline StudentFo bermasalah</b>\n"
            f"Sumber: {len(sources)} | gagal: {failed_sources} | crash: {crashed}\n"
            f"Event valid: {len(all_events)}\n\n"
            + "\n".join(all_errors[:10])
        )
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
