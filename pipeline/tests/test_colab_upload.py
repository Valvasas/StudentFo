"""Fungsi bantu skrip Colab (`pipeline/colab/studentfo_upload.py`): murni, tanpa jaringan."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "colab"))
import studentfo_upload as up  # noqa: E402

NOW = datetime(2026, 11, 25, 3, 0, tzinfo=timezone.utc)


def rec(**over):
    base = {
        "title": "Lomba Karya Tulis Nasional", "organizer": "Kemdikbud", "event_type": "lomba",
        "registration_link": "https://daftar.example/x", "source_url": "https://sumber.example/x",
        "deadline": "2026-12-20", "education_levels": "S1, d3, ???", "categories": "teknologi;sains",
    }
    return {**base, **over}


def test_deadline_date_only_is_end_of_day_wib_and_tz_naive_is_wib():
    assert up.parse_deadline("2026-12-20", NOW) == "2026-12-20T23:59:00+07:00"
    assert up.parse_deadline("20/12/2026", NOW) == "2026-12-20T23:59:00+07:00"
    assert up.parse_deadline("2026-12-20T10:00", NOW) == "2026-12-20T10:00:00+07:00"
    assert up.parse_deadline("2026-12-20T10:00:00Z", NOW).startswith("2026-12-20T10:00:00+00:00")


def test_deadline_rejects_past_far_future_and_garbage():
    assert up.parse_deadline("2026-11-01", NOW) is None
    assert up.parse_deadline("2062-12-20", NOW) is None
    assert up.parse_deadline("segera", NOW) is None and up.parse_deadline("", NOW) is None


def test_payload_maps_enums_and_keeps_only_https():
    payload, errors = up.build_payload(rec(), guidebook_url="https://x.example/g.pdf", poster_url="https://x.example/p.jpg", now=NOW)
    assert errors == []
    assert payload["event_type"] == "LOMBA" and payload["education_levels"] == ["D4_S1", "D3"]
    assert payload["categories"] == ["teknologi", "sains"]
    assert payload["guidebook_url"] == "https://x.example/g.pdf"
    assert payload["media"] == [{"url": "https://x.example/p.jpg", "is_poster": True, "caption": "Poster dari laman resmi penyelenggara"}]
    assert payload["deadlines"] == [{"label": "registration", "deadline_at": "2026-12-20T23:59:00+07:00", "is_primary": True}]
    assert "status" not in payload and "dedup_hash" not in payload


def test_non_https_assets_are_dropped_not_sent():
    payload, _ = up.build_payload(rec(guidebook_url="http://x.example/g.pdf", poster_url="ftp://x/p.jpg"), now=NOW)
    assert "guidebook_url" not in payload and "media" not in payload


def test_invalid_records_are_skipped_with_reasons():
    payload, errors = up.build_payload(rec(title="Ab", event_type="KUIS", registration_link="http://x", deadline="2020-01-01"), now=NOW)
    assert payload is None
    assert len(errors) == 4


def test_long_text_is_capped_at_word_boundary():
    text = up.tidy_text("kata " * 1000)
    assert len(text) <= up.LONG_TEXT_MAX + 1 and text.endswith("…")
    assert up.tidy_text(None) == ""


def test_storage_name_is_content_hash(tmp_path):
    a, b = tmp_path / "a.pdf", tmp_path / "b.PDF"
    a.write_bytes(b"sama"); b.write_bytes(b"sama")
    assert up.storage_name(str(a), "guidebooks") == up.storage_name(str(b), "guidebooks")
    assert up.storage_name(str(a), "guidebooks").startswith("guidebooks/") and up.storage_name(str(a), "guidebooks").endswith(".pdf")
