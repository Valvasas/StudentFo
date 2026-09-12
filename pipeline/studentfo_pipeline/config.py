"""Pemuatan konfigurasi sumber."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

from .fetcher import FetchPolicy


@dataclass(frozen=True)
class Source:
    id: str
    name: str
    start_url: str
    content_selector: str | None = None
    requires_javascript: bool = False
    enabled: bool = True


@dataclass(frozen=True)
class PipelineConfig:
    policy: FetchPolicy
    sources: list[Source]

    @property
    def active_sources(self) -> list[Source]:
        return [source for source in self.sources if source.enabled]


def load_config(path: Path) -> PipelineConfig:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    defaults = raw.get("defaults", {})

    policy = FetchPolicy(
        delay_seconds_min=float(defaults.get("delay_seconds_min", 2.0)),
        delay_seconds_max=float(defaults.get("delay_seconds_max", 5.0)),
        timeout_seconds=int(defaults.get("timeout_seconds", 30)),
        max_pages_per_source=int(defaults.get("max_pages_per_source", 20)),
    )

    # Jeda minimum dipaksa di kode, bukan diserahkan ke berkas konfigurasi.
    # Satu salah ketik (0.2 alih-alih 2.0) sudah cukup untuk mengubah pipeline
    # ini jadi beban bagi server orang lain.
    policy.delay_seconds_min = max(policy.delay_seconds_min, 1.0)
    policy.delay_seconds_max = max(policy.delay_seconds_max, policy.delay_seconds_min)

    sources = [
        Source(
            id=item["id"],
            name=item["name"],
            start_url=item["start_url"],
            content_selector=item.get("content_selector"),
            requires_javascript=bool(item.get("requires_javascript", False)),
            enabled=bool(item.get("enabled", True)),
        )
        for item in raw.get("sources", [])
    ]

    return PipelineConfig(policy=policy, sources=sources)
