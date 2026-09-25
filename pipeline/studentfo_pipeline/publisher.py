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
from typing import TYPE_CHECKING, Any

from .models import ValidatedEvent

if TYPE_CHECKING:
    from supabase import Client

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


def to_rpc_payload(event: ValidatedEvent) -> dict[str, Any]:
    """Bentuk argumen `p` untuk `public.stage_scraped_event(p JSONB)`.

    Sengaja TIDAK mengirim `status` maupun `dedup_hash`: fungsi SQL selalu
    menulis PENDING dan menghitung hash-nya sendiri, jadi keduanya tidak
    bisa dipalsukan atau berbeda versi dari sisi Python.
    """
    return {
        "title": event.title,
        "organizer": event.organizer,
        "description": event.description,
        "event_type": event.event_type.value,
        "registration_link": event.registration_link,
        "source_url": event.source_url,
        "education_levels": [level.value for level in event.education_levels],
        "location": event.location,
        "is_online": event.is_online,
        "categories": list(event.categories),
        "deadlines": [
            {
                "label": deadline.label.value,
                "deadline_at": deadline.deadline_at.isoformat(),
                "is_primary": deadline.is_primary,
            }
            for deadline in event.deadlines
        ],
    }


def publish(client: Client, events: list[ValidatedEvent]) -> PublishResult:
    """Stage setiap event lewat RPC transaksional (migration 20260925100001).

    Sebelumnya: tiga request per event (events, event_deadlines,
    event_categories) plus satu query kategori per event. Gagal di tengah
    meninggalkan event PENDING tanpa tenggat. Sekarang satu event = satu
    transaksi Postgres: tertulis utuh, atau tidak sama sekali.

    Duplikat dideteksi oleh database (unik di antara event yang belum
    EXPIRED), jadi edisi tahunan berikutnya tetap bisa masuk.
    """
    result = PublishResult()

    # Hash yang sama bisa muncul dua kali dalam satu batch (event yang sama
    # di dua sumber). Disaring di sini hanya untuk menghemat satu round-trip;
    # kebenarannya tetap dijamin unique index di database.
    batch_seen: set[str] = set()

    for event in events:
        if event.dedup_hash in batch_seen:
            result.duplicates += 1
            continue
        batch_seen.add(event.dedup_hash)

        try:
            response = client.rpc("stage_scraped_event", {"p": to_rpc_payload(event)}).execute()
        except Exception as exc:  # noqa: BLE001 — satu event gagal tidak boleh menghentikan batch
            logger.error("Gagal menulis '%s': %s", event.title, exc)
            result.failed += 1
            continue

        if response.data:
            result.inserted += 1
        else:
            result.duplicates += 1

    return result
