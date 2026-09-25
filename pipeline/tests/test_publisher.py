"""Uji bentuk payload RPC publisher (tanpa jaringan, tanpa pytest).

    python pipeline/tests/test_publisher.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from studentfo_pipeline.models import (  # noqa: E402
    DeadlineLabel,
    EducationLevel,
    EventType,
    ExtractedDeadline,
    ValidatedEvent,
    compute_dedup_hash,
)
from studentfo_pipeline.publisher import PublishResult, publish, to_rpc_payload  # noqa: E402

DEADLINE = datetime.now(timezone.utc) + timedelta(days=10)


def make_event(title: str = "Gemastik 2026") -> ValidatedEvent:
    return ValidatedEvent(
        title=title,
        organizer="Kemdikbud",
        description="Kompetisi TIK nasional.",
        event_type=EventType("LOMBA"),
        registration_link="https://daftar.example",
        source_url="https://sumber.example",
        dedup_hash=compute_dedup_hash(title, "Kemdikbud"),
        education_levels=[EducationLevel("D4_S1")],
        location=None,
        is_online=True,
        categories=["teknologi"],
        deadlines=[ExtractedDeadline(label=DeadlineLabel("registration"), deadline_at=DEADLINE, is_primary=True)],
    )


def test_payload_never_carries_status_or_hash():
    payload = to_rpc_payload(make_event())
    assert "status" not in payload, "status ditentukan SQL (selalu PENDING)"
    assert "dedup_hash" not in payload, "hash dihitung SQL, satu sumber kebenaran"


def test_payload_serializes_enums_and_dates():
    payload = to_rpc_payload(make_event())
    assert payload["event_type"] == "LOMBA"
    assert payload["education_levels"] == ["D4_S1"]
    assert payload["deadlines"][0]["label"] == "registration"
    assert payload["deadlines"][0]["deadline_at"] == DEADLINE.isoformat()
    assert payload["deadlines"][0]["is_primary"] is True


class FakeRpc:
    """Meniru `client.rpc(...).execute()`: event pertama per judul masuk, sisanya duplikat."""

    def __init__(self, fail_titles: set[str] | None = None) -> None:
        self.calls: list[dict] = []
        self.seen: set[str] = set()
        self.fail_titles = fail_titles or set()

    def rpc(self, name: str, params: dict):
        assert name == "stage_scraped_event"
        self.calls.append(params)
        title = params["p"]["title"]
        outer = self

        class Call:
            def execute(self_inner):
                if title in outer.fail_titles:
                    raise RuntimeError("koneksi putus")
                data = None if title in outer.seen else "uuid-baru"
                outer.seen.add(title)
                return type("Response", (), {"data": data})()

        return Call()


def test_publish_counts_inserted_duplicates_and_failures():
    client = FakeRpc(fail_titles={"Rusak"})
    events = [make_event("A"), make_event("A"), make_event("B"), make_event("Rusak")]
    result = publish(client, events)  # type: ignore[arg-type]
    assert result == PublishResult(inserted=2, duplicates=1, failed=1), result
    # Duplikat dalam batch yang sama tidak memakan round-trip.
    assert len(client.calls) == 3


def test_publish_treats_database_duplicate_as_duplicate():
    client = FakeRpc()
    client.seen.add("A")  # sudah ada di database dari malam sebelumnya
    result = publish(client, [make_event("A")])  # type: ignore[arg-type]
    assert result == PublishResult(inserted=0, duplicates=1, failed=0), result


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
