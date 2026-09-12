"""Penulisan hasil ekstraksi ke Supabase.

Memakai service_role key yang MEM-BYPASS RLS — itu memang desainnya
(Blueprint §7 langkah 5). Karena itu berkas ini adalah salah satu tempat
paling sensitif di seluruh proyek: tidak ada satu pun gerbang keamanan
basis data yang berlaku di sini, jadi setiap baris yang ditulis harus sudah
lolos validasi di models.py lebih dulu.

Semua entri masuk dengan status PENDING. Tidak ada jalur mana pun di
pipeline ini yang boleh menulis APPROVED — penerbitan adalah keputusan
manusia (§7 langkah 7).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from supabase import Client

from .models import ValidatedEvent

logger = logging.getLogger(__name__)


@dataclass
class PublishResult:
    inserted: int = 0
    duplicates: int = 0
    failed: int = 0


def fetch_category_slugs(client: Client) -> list[str]:
    """Taksonomi yang berlaku saat ini — sumber enum untuk schema LLM."""
    response = client.table("categories").select("slug").execute()
    return [row["slug"] for row in response.data]


def existing_hashes(client: Client, hashes: list[str]) -> set[str]:
    """Sekali query untuk semua hash, bukan satu query per event.

    Dengan puluhan sumber per malam, pola satu-query-per-baris berubah jadi
    ribuan round-trip dan membuat jendela cron meleset.
    """
    if not hashes:
        return set()
    response = client.table("events").select("dedup_hash").in_("dedup_hash", hashes).execute()
    return {row["dedup_hash"] for row in response.data}


def publish(client: Client, events: list[ValidatedEvent]) -> PublishResult:
    result = PublishResult()
    seen = existing_hashes(client, [event.dedup_hash for event in events])

    # Hash yang sama bisa muncul dua kali dalam satu batch (event yang sama
    # ditemukan di dua sumber). Tanpa penjagaan ini, baris kedua akan ditolak
    # oleh unique constraint dan terhitung sebagai kegagalan, bukan duplikat.
    batch_seen: set[str] = set()

    for event in events:
        if event.dedup_hash in seen or event.dedup_hash in batch_seen:
            result.duplicates += 1
            continue
        batch_seen.add(event.dedup_hash)

        try:
            inserted = (
                client.table("events")
                .insert(
                    {
                        "title": event.title,
                        "organizer": event.organizer,
                        "description": event.description,
                        "event_type": event.event_type.value,
                        "registration_link": event.registration_link,
                        "source_url": event.source_url,
                        "dedup_hash": event.dedup_hash,
                        "education_levels": [level.value for level in event.education_levels],
                        "location": event.location,
                        "is_online": event.is_online,
                        "status": "PENDING",
                    }
                )
                .execute()
            )
            event_id = inserted.data[0]["id"]

            if event.deadlines:
                client.table("event_deadlines").insert(
                    [
                        {
                            "event_id": event_id,
                            "label": deadline.label.value,
                            "deadline_at": deadline.deadline_at.isoformat(),
                            "is_primary": deadline.is_primary,
                        }
                        for deadline in event.deadlines
                    ]
                ).execute()

            if event.categories:
                category_rows = (
                    client.table("categories").select("id, slug").in_("slug", event.categories).execute()
                )
                if category_rows.data:
                    client.table("event_categories").insert(
                        [{"event_id": event_id, "category_id": row["id"]} for row in category_rows.data]
                    ).execute()

            result.inserted += 1
        except Exception as exc:
            # Satu event gagal tidak boleh menghentikan batch. Event yang
            # gagal di tengah jalan bisa meninggalkan baris `events` tanpa
            # tenggat; itu tetap tampil di antrean moderasi sebagai entri
            # cacat dan akan ditolak manusia — hasil yang benar.
            logger.error("Gagal menulis '%s': %s", event.title, exc)
            result.failed += 1

    return result
