"""Uji validasi pipeline.

Dijalankan tanpa pytest supaya bisa dieksekusi di lingkungan minimal:
    python pipeline/tests/test_models.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from studentfo_pipeline.alerts import should_alert
from studentfo_pipeline.extractor import build_response_schema, parse_events
from studentfo_pipeline.models import ExtractedEvent, compute_dedup_hash

FUTURE = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
PAST = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()


def base_payload(**overrides):
    payload = {
        "title": "Lomba Karya Tulis Ilmiah Nasional",
        "organizer": "Universitas Contoh",
        "description": "Deskripsi kegiatan.",
        "event_type": "LOMBA",
        "registration_link": "https://contoh.ac.id/daftar",
        "education_levels": ["D4_S1"],
        "categories": ["karya-tulis"],
        "deadlines": [{"label": "registration", "deadline_at": FUTURE}],
    }
    payload.update(overrides)
    return payload


def expect_error(payload, note):
    try:
        ExtractedEvent.model_validate(payload)
    except Exception:
        return
    raise AssertionError(f"seharusnya ditolak: {note}")


def test_valid_event():
    event = ExtractedEvent.model_validate(base_payload())
    assert event.title == "Lomba Karya Tulis Ilmiah Nasional"
    # Satu-satunya tenggat otomatis jadi tenggat utama.
    assert event.deadlines[0].is_primary is True


def test_whitespace_normalized():
    event = ExtractedEvent.model_validate(base_payload(title="  Lomba   Esai   Nasional  "))
    assert event.title == "Lomba Esai Nasional"


def test_rejects_past_deadline():
    expect_error(
        base_payload(deadlines=[{"label": "registration", "deadline_at": PAST}]),
        "tenggat sudah lewat",
    )


def test_rejects_absurd_future_deadline():
    far = (datetime.now(timezone.utc) + timedelta(days=365 * 10)).isoformat()
    expect_error(
        base_payload(deadlines=[{"label": "registration", "deadline_at": far}]),
        "tenggat 10 tahun ke depan (indikasi salah baca tahun)",
    )


def test_rejects_two_primary_deadlines():
    expect_error(
        base_payload(
            deadlines=[
                {"label": "registration", "deadline_at": FUTURE, "is_primary": True},
                {"label": "submission", "deadline_at": FUTURE, "is_primary": True},
            ]
        ),
        "dua tenggat utama",
    )


def test_rejects_bad_url_and_unknown_enum():
    expect_error(base_payload(registration_link="javascript:alert(1)"), "skema URL berbahaya")
    expect_error(base_payload(event_type="SEMINAR_GELAP"), "event_type di luar enum")


def test_earliest_deadline_becomes_primary():
    soon = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    event = ExtractedEvent.model_validate(
        base_payload(
            deadlines=[
                {"label": "final", "deadline_at": FUTURE},
                {"label": "registration", "deadline_at": soon},
            ]
        )
    )
    primary = [d for d in event.deadlines if d.is_primary]
    assert len(primary) == 1
    assert primary[0].label.value == "registration"


def test_dedup_hash_is_stable_and_normalized():
    a = compute_dedup_hash("Lomba Esai Nasional", "Universitas Contoh")
    b = compute_dedup_hash("  lomba   esai   nasional ", "UNIVERSITAS CONTOH")
    assert a == b, "normalisasi huruf & spasi harus menghasilkan hash sama"
    assert a != compute_dedup_hash("Lomba Esai Nasional", "Universitas Lain")
    assert len(a) == 64


def test_parse_events_isolates_broken_entries():
    raw = f'[{{"title":"x"}}, {{"title":"Lomba Debat Nasional","organizer":"Kampus Contoh","event_type":"LOMBA","registration_link":"https://a.id/d","deadlines":[{{"label":"registration","deadline_at":"{FUTURE}"}}]}}]'
    valid, errors = parse_events(raw, "https://a.id")
    assert len(valid) == 1, "entri rusak tidak boleh menjatuhkan entri yang sehat"
    assert len(errors) == 1


def test_parse_events_survives_invalid_json():
    valid, errors = parse_events("bukan json", "https://a.id")
    assert valid == [] and len(errors) == 1


def test_schema_enum_comes_from_database_list():
    schema = build_response_schema(["teknologi", "bisnis"])
    categories = schema["items"]["properties"]["categories"]["items"]
    assert categories["enum"] == ["teknologi", "bisnis"]
    assert "LOMBA" in schema["items"]["properties"]["event_type"]["enum"]


def test_alert_threshold():
    assert should_alert(10, 2, crashed=False) is False   # 20% masih wajar
    assert should_alert(10, 4, crashed=False) is True    # 40% -> masalah kita
    assert should_alert(10, 0, crashed=True) is True
    assert should_alert(0, 0, crashed=False) is True     # tidak ada sumber aktif


if __name__ == "__main__":
    failures = 0
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_")]
    for test in tests:
        try:
            test()
            print(f"  ok   {test.__name__}")
        except AssertionError as exc:
            failures += 1
            print(f"  FAIL {test.__name__}: {exc}")
    print(f"\n{len(tests) - failures}/{len(tests)} lolos")
    raise SystemExit(1 if failures else 0)
