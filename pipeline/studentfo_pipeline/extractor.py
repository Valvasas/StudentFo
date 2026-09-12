"""Ekstraksi terstruktur memakai Gemini.

Poin terpenting berkas ini: enum `event_type` dan daftar `categories` yang
dikirim ke model DIBACA DARI DATABASE saat itu juga, tidak ditulis tangan.

Blueprint §7 menyebut alasannya dan memang benar: begitu LLM boleh menulis
label bebas, "Teknologi", "teknologi", "IT & Teknologi" akan masuk sebagai
tiga kategori berbeda, dan `category_match` di algoritma rekomendasi (§6)
langsung rusak karena membandingkan string yang tidak pernah sama.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from bs4 import BeautifulSoup

from .models import EducationLevel, EventType, ExtractedEvent

logger = logging.getLogger(__name__)

MAX_CONTENT_CHARS = 24_000

PROMPT = """Kamu mengekstrak informasi kegiatan mahasiswa dari halaman web Indonesia.

Aturan:
- Ambil HANYA kegiatan yang pendaftarannya masih dibuka atau akan dibuka.
- Jangan mengarang. Kalau sebuah field tidak disebutkan di halaman, kosongkan
  (atau untuk deskripsi, ringkas hanya dari kalimat yang benar-benar ada).
- `registration_link` harus URL yang benar-benar tercantum di halaman.
- Tanggal ditulis dalam format ISO 8601. Kalau jam tidak disebutkan, pakai 23:59
  waktu Indonesia Barat.
- `categories` HANYA boleh diisi dari daftar yang diberikan. Kalau tidak ada
  yang cocok, kosongkan.

Halaman sumber: {source_url}

Isi halaman:
{content}
"""


def html_to_text(html: str, content_selector: str | None = None) -> str:
    """Pangkas HTML jadi teks yang relevan sebelum dikirim ke model.

    Memangkas di sini memotong biaya token secara signifikan dan, yang lebih
    penting, menurunkan halusinasi: navigasi, footer, dan daftar "artikel
    terkait" adalah sumber utama model salah mengambil judul kegiatan lain.
    """
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "svg"]):
        tag.decompose()

    root = soup.select_one(content_selector) if content_selector else None
    text = (root or soup).get_text(separator="\n", strip=True)
    return text[:MAX_CONTENT_CHARS]


def build_response_schema(category_slugs: list[str]) -> dict[str, Any]:
    """Bangun JSON schema dengan enum yang diambil dari isi database saat ini."""
    return {
        "type": "array",
        "items": {
            "type": "object",
            "required": ["title", "organizer", "event_type", "registration_link", "deadlines"],
            "properties": {
                "title": {"type": "string"},
                "organizer": {"type": "string"},
                "description": {"type": "string"},
                "event_type": {"type": "string", "enum": [t.value for t in EventType]},
                "registration_link": {"type": "string"},
                "location": {"type": "string"},
                "is_online": {"type": "boolean"},
                "education_levels": {
                    "type": "array",
                    "items": {"type": "string", "enum": [level.value for level in EducationLevel]},
                },
                "categories": {
                    "type": "array",
                    # Enum diambil dari tabel `categories` — inilah pengikat
                    # antara keluaran LLM dan taksonomi yang benar-benar ada.
                    "items": {"type": "string", "enum": category_slugs},
                },
                "deadlines": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "required": ["label", "deadline_at"],
                        "properties": {
                            "label": {
                                "type": "string",
                                "enum": ["registration", "submission", "final", "announcement"],
                            },
                            "deadline_at": {"type": "string"},
                            "is_primary": {"type": "boolean"},
                        },
                    },
                },
            },
        },
    }


def parse_events(
    raw_json: str,
    source_url: str,
) -> tuple[list[ExtractedEvent], list[str]]:
    """Ubah balasan model jadi objek tervalidasi.

    Mengembalikan (yang valid, daftar alasan gagal). Satu entri rusak TIDAK
    boleh membatalkan seluruh halaman — dan entri rusak juga tidak boleh
    masuk separuh-separuh (Blueprint §7 langkah 4c).
    """
    valid: list[ExtractedEvent] = []
    errors: list[str] = []

    try:
        payload = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        return [], [f"balasan bukan JSON yang sah: {exc}"]

    if not isinstance(payload, list):
        return [], ["balasan bukan array"]

    for index, item in enumerate(payload):
        try:
            valid.append(ExtractedEvent.model_validate(item))
        except Exception as exc:  # pydantic.ValidationError dan turunannya
            errors.append(f"[{source_url}#{index}] {exc}")

    return valid, errors
