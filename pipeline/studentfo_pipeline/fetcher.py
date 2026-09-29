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
import os
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
            await self._respect_delay(parsed.netloc)
            response = await client.get(f"{origin}/robots.txt", timeout=10)
            if response.status_code == 200:
                parser.parse(response.text.splitlines())
            elif 400 <= response.status_code < 500:
                # 4xx = robots.txt memang tidak ada: tidak ada larangan
                # eksplisit (RFC 9309 §2.3.1.3).
                parser.parse([])
            else:
                # 5xx = server tidak bisa menjawab, bukan "boleh semua"
                # (RFC 9309 §2.3.1.4). Sama dengan gagal jaringan: lewati.
                logger.warning("robots.txt %s menjawab %s — sumber dilewati", origin, response.status_code)
                self._robots_cache[origin] = None
                return None
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

    async def _allowed(self, client: httpx.AsyncClient, url: str) -> bool:
        parser = await self._robots_for(client, url)
        if parser is None:
            return False
        if not parser.can_fetch(USER_AGENT, url):
            logger.info("Dilarang oleh robots.txt, dilewati: %s", url)
            return False
        await self._respect_delay(urlparse(url).netloc)
        return True

    async def fetch(self, client: httpx.AsyncClient, url: str) -> str | None:
        """Kembalikan HTML, atau None kalau dilarang/gagal. Tidak pernah melempar."""
        if not await self._allowed(client, url):
            return None
        try:
            response = await client.get(url, timeout=self.policy.timeout_seconds)
            response.raise_for_status()
            return response.text
        except httpx.HTTPError as exc:
            logger.warning("Gagal mengambil %s: %s", url, exc)
            return None

    async def fetch_rendered(self, client: httpx.AsyncClient, url: str) -> str | None:
        """Seperti `fetch`, tapi isinya dirender browser (sumber `requires_javascript`).

        Melewati gerbang robots.txt + jeda yang SAMA dengan `fetch`, dan
        mengirim User-Agent yang sama — browser tanpa kepala tidak boleh jadi
        jalan pintas untuk menyamar. Hanya dokumen utama yang diambil;
        gambar, font, dan media diblokir supaya satu kunjungan tidak berubah
        jadi puluhan request ke server sumber.
        """
        if not await self._allowed(client, url):
            return None
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.error("Playwright tidak terpasang; sumber JavaScript %s dilewati", url)
            return None

        try:
            async with async_playwright() as playwright:
                # Lingkungan yang sudah punya Chromium (container CI) bisa
                # menunjuknya tanpa `playwright install` — konvensi yang sama
                # dengan playwright.config.ts di aplikasi web.
                executable = os.getenv("PLAYWRIGHT_CHROMIUM_EXECUTABLE") or None
                browser = await playwright.chromium.launch(executable_path=executable)
                try:
                    page = await browser.new_page(user_agent=USER_AGENT, locale="id-ID")
                    await page.route(
                        "**/*",
                        lambda route: route.abort()
                        if route.request.resource_type in {"image", "media", "font"}
                        else route.continue_(),
                    )
                    await page.goto(url, wait_until="networkidle", timeout=self.policy.timeout_seconds * 1000)
                    return await page.content()
                finally:
                    await browser.close()
        except Exception as exc:  # noqa: BLE001 — satu sumber gagal tidak boleh menghentikan batch
            logger.warning("Gagal merender %s: %s", url, exc)
            return None


def build_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT, "Accept-Language": "id-ID,id;q=0.9"},
        follow_redirects=True,
    )
