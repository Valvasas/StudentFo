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
    html = await fetcher.fetch(client, source.start_url)
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


async def main() -> int:
    parser = argparse.ArgumentParser(description="Pipeline agregasi StudentFo")
    parser.add_argument("--config", type=Path, default=Path("pipeline/config/sources.yaml"))
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Jalankan seluruh alur tanpa menulis apa pun ke database.",
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

    # Impor ditunda sampai dibutuhkan supaya --dry-run bisa dijalankan di
    # mesin tanpa kredensial Supabase/Gemini terpasang.
    if args.dry_run:
        category_slugs = ["teknologi", "bisnis", "sains", "desain"]

        async def extract_fn(content: str, url: str, slugs: list[str]) -> str:
            logger.info("[dry-run] akan mengirim %d karakter ke Gemini dari %s", len(content), url)
            return "[]"

        supabase = None
    else:
        from supabase import create_client

        from studentfo_pipeline.publisher import fetch_category_slugs, publish

        supabase_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
        service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        supabase = create_client(supabase_url, service_key)
        category_slugs = fetch_category_slugs(supabase)

        from google import genai

        genai_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

        from studentfo_pipeline.extractor import PROMPT, build_response_schema

        async def extract_fn(content: str, url: str, slugs: list[str]) -> str:
            response = await asyncio.to_thread(
                genai_client.models.generate_content,
                model="gemini-2.0-flash",
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

    try:
        fetcher = PoliteFetcher(policy=config.policy)
        async with build_client() as client:
            for source in sources:
                try:
                    events, errors = await process_source(
                        source, fetcher, client, category_slugs, extract_fn
                    )
                    all_events.extend(events)
                    all_errors.extend(errors)
                    if not events:
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
        result = publish(supabase, all_events)
        logger.info(
            "Publikasi selesai: %d baru, %d duplikat, %d gagal",
            result.inserted,
            result.duplicates,
            result.failed,
        )

    if should_alert(len(sources), failed_sources, crashed):
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
