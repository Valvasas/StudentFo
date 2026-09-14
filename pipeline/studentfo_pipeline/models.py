"""Skema data terstruktur untuk keluaran LLM dan untuk penulisan ke database.

Mengapa validasi Pydantic ada DI ANTARA LLM dan database, bukan hanya
mengandalkan mode structured output Gemini: structured output menjamin
BENTUK JSON-nya, bukan kewarasan ISINYA. Model masih bisa mengembalikan
tenggat di masa lalu, URL yang bukan URL, atau judul kosong. Baris yang
lolos ke tabel `events` adalah baris yang akan dibaca manusia sungguhan
dan dijadikan dasar keputusan — jadi gerbangnya ada di sini.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator

WIB = timezone(timedelta(hours=7))

# Harus sama persis dengan enum `event_type` di migration 0001.
class EventType(str, Enum):
    LOMBA = "LOMBA"
    BEASISWA = "BEASISWA"
    MAGANG = "MAGANG"
    WORKSHOP = "WORKSHOP"
    KONFERENSI = "KONFERENSI"
    PELATIHAN = "PELATIHAN"
    VOLUNTEER = "VOLUNTEER"


class EducationLevel(str, Enum):
    SMA_SMK = "SMA_SMK"
    D3 = "D3"
    D4_S1 = "D4_S1"
    S2 = "S2"
    S3 = "S3"
    UMUM = "UMUM"


class DeadlineLabel(str, Enum):
    REGISTRATION = "registration"
    SUBMISSION = "submission"
    FINAL = "final"
    ANNOUNCEMENT = "announcement"


class ExtractedDeadline(BaseModel):
    label: DeadlineLabel
    deadline_at: datetime
    is_primary: bool = False

    @field_validator("deadline_at")
    @classmethod
    def must_be_timezone_aware(cls, value: datetime) -> datetime:
        # Tanggal tanpa zona waktu adalah sumber kesalahan H-1 yang klasik:
        # sumber Indonesia menulis waktu lokal, server berjalan di UTC.
        # Diasumsikan WIB kalau sumbernya tidak menyebut zona waktu.
        if value.tzinfo is None:
            return value.replace(tzinfo=WIB)
        return value


class ExtractedEvent(BaseModel):
    """Bentuk yang diminta dari Gemini (JSON schema mode)."""

    title: Annotated[str, Field(min_length=5, max_length=255)]
    organizer: Annotated[str, Field(min_length=2, max_length=255)]
    description: Annotated[str, Field(max_length=4000)] = ""
    event_type: EventType
    registration_link: HttpUrl
    education_levels: list[EducationLevel] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    location: str | None = None
    is_online: bool = False
    deadlines: list[ExtractedDeadline] = Field(min_length=1)

    @field_validator("title", "organizer")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return re.sub(r"\s+", " ", value).strip()

    @model_validator(mode="after")
    def validate_deadlines(self) -> "ExtractedEvent":
        primaries = [d for d in self.deadlines if d.is_primary]
        if len(primaries) > 1:
            # Basis data menolak ini lewat partial unique index; ditangkap
            # lebih awal supaya pesannya jelas, bukan berupa error constraint.
            raise ValueError("hanya boleh ada satu tenggat utama per event")
        if not primaries:
            # Tenggat paling awal adalah tebakan yang benar untuk "utama":
            # itulah pintu yang paling dulu tertutup bagi calon peserta.
            self.deadlines.sort(key=lambda d: d.deadline_at)
            self.deadlines[0].is_primary = True

        now = datetime.now(timezone.utc)
        horizon = now + timedelta(days=365 * 3)
        primary = next(d for d in self.deadlines if d.is_primary)
        if primary.deadline_at < now:
            raise ValueError("tenggat utama sudah lewat; tidak ada gunanya dipublikasikan")
        if primary.deadline_at > horizon:
            # Tanggal lebih dari 3 tahun ke depan hampir selalu berarti tahun
            # salah baca (mis. "2026" jadi "2062"), bukan acara sungguhan.
            raise ValueError("tenggat tidak masuk akal jauhnya; kemungkinan salah parsing")
        return self


class ValidatedEvent(BaseModel):
    """Baris siap tulis ke tabel `events`."""

    title: str
    organizer: str
    description: str
    event_type: EventType
    registration_link: str
    source_url: str
    dedup_hash: str
    education_levels: list[EducationLevel]
    location: str | None
    is_online: bool
    categories: list[str]
    deadlines: list[ExtractedDeadline]


def compute_dedup_hash(title: str, organizer: str) -> str:
    """Harus menghasilkan nilai IDENTIK dengan public.compute_dedup_hash() di SQL.

    source_url sengaja TIDAK ikut di-hash: satu event yang sama sering muncul
    di beberapa URL (halaman listing, halaman detail, URL dengan parameter
    pelacakan), dan mengikutkannya membuat dedup gagal justru pada kasus yang
    paling sering terjadi.
    """
    normalized_title = re.sub(r"\s+", " ", title.strip().lower())
    normalized_organizer = re.sub(r"\s+", " ", organizer.strip().lower())
    return hashlib.sha256(f"{normalized_title}|{normalized_organizer}".encode()).hexdigest()
