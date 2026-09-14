"""Pengambilan HTML yang menghormati aturan situs sumber.

Blueprint §7 mewajibkan tiga hal, dan ketiganya ditegakkan di sini:
  1. robots.txt dipatuhi SEBELUM setiap fetch.
  2. Jeda 2-5 detik antar-request ke domain yang sama.
  3. User-Agent yang bisa diidentifikasi — bukan menyamar jadi browser biasa.

Ini bukan sekadar sopan santun. Scraper yang menyamar dan menghajar server
orang akan diblokir dalam hitungan hari, dan pipeline yang diblokir tidak
menghasilkan data. Perilaku etis di sini sekaligus keputusan keandalan.
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
import urllib.robotparser as robotparser
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

# Identitas jujur + alamat kontak, supaya pemilik situs tahu siapa yang
# mengunjungi dan ke mana harus mengeluh sebelum memutuskan memblokir.
USER_AGENT = "StudentFoBot/1.0 (+https://studentfo.example/bot; kontak@studentfo.example)"


@dataclass
class FetchPolicy:
    delay_seconds_min: float = 2.0
    delay_seconds_max: float = 5.0
    timeout_seconds: int = 30
    max_pages_per_source: int = 20


@dataclass
class PoliteFetcher:
    """Klien HTTP dengan pembatasan laju PER DOMAIN.

    Pembatasan dibuat per host, bukan global: menunda request ke situs A
    karena baru saja mengambil dari situs B hanya memperlambat pipeline
    tanpa meringankan siapa pun.
    """

    policy: FetchPolicy = field(default_factory=FetchPolicy)
    _last_request_at: dict[str, float] = field(default_factory=dict)
    _robots_cache: dict[str, robotparser.RobotFileParser | None] = field(default_factory=dict)

    async def _robots_for(self, client: httpx.AsyncClient, url: str) -> robotparser.RobotFileParser | None:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin in self._robots_cache:
            return self._robots_cache[origin]

        parser = robotparser.RobotFileParser()
        try:
            response = await client.get(f"{origin}/robots.txt", timeout=10)
            if response.status_code == 200:
                parser.parse(response.text.splitlines())
            else:
                # Tidak ada robots.txt = tidak ada larangan eksplisit.
                parser.parse([])
        except httpx.HTTPError as exc:
            # Gagal membaca robots.txt diperlakukan sebagai TIDAK BOLEH.
            # Menganggapnya "boleh" berarti kegagalan jaringan diam-diam
            # mengubah scraper sopan jadi scraper yang menerobos.
            logger.warning("robots.txt tidak terbaca untuk %s (%s) — sumber dilewati", origin, exc)
            self._robots_cache[origin] = None
            return None

        self._robots_cache[origin] = parser
        return parser

    async def _respect_delay(self, host: str) -> None:
        last = self._last_request_at.get(host)
        if last is not None:
            delay = random.uniform(self.policy.delay_seconds_min, self.policy.delay_seconds_max)
            elapsed = time.monotonic() - last
            if elapsed < delay:
                await asyncio.sleep(delay - elapsed)
        self._last_request_at[host] = time.monotonic()

    async def fetch(self, client: httpx.AsyncClient, url: str) -> str | None:
        """Kembalikan HTML, atau None kalau dilarang/gagal. Tidak pernah melempar."""
        parser = await self._robots_for(client, url)
        if parser is None:
            return None
        if not parser.can_fetch(USER_AGENT, url):
            logger.info("Dilarang oleh robots.txt, dilewati: %s", url)
            return None

        host = urlparse(url).netloc
        await self._respect_delay(host)

        try:
            response = await client.get(url, timeout=self.policy.timeout_seconds)
            response.raise_for_status()
            return response.text
        except httpx.HTTPError as exc:
            logger.warning("Gagal mengambil %s: %s", url, exc)
            return None


def build_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT, "Accept-Language": "id-ID,id;q=0.9"},
        follow_redirects=True,
    )
