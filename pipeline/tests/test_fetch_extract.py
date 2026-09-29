"""Uji jalur scraping sungguhan: robots.txt, jeda, pemangkasan HTML, orkestrasi.

Semuanya berjalan terhadap server HTTP lokal — tanpa jaringan luar, tanpa
kunci API. Dijalankan tanpa pytest:
    python pipeline/tests/test_fetch_extract.py

Uji render JavaScript hanya jalan kalau PLAYWRIGHT_CHROMIUM_EXECUTABLE
menunjuk ke Chromium yang terpasang; tanpa itu dilewati (bukan gagal).
"""

from __future__ import annotations

import asyncio
import http.server
import os
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))

from studentfo_pipeline.extractor import build_response_schema, html_to_text  # noqa: E402
from studentfo_pipeline.fetcher import FetchPolicy, PoliteFetcher, build_client  # noqa: E402

ARTICLE_PAGE = """<html><body>
<header class="situs"><nav>Beranda | Berita</nav>Portal Kampus Contoh</header>
<main><article>
  <header><h1>Lomba Karya Tulis Ilmiah Nasional 2026</h1><p>Oleh BEM Universitas Contoh</p></header>
  <p>Terbuka untuk mahasiswa D3 dan S1. Pendaftaran dibuka sampai 20 Desember 2026.
  Tema tahun ini energi terbarukan untuk desa. Proposal maksimal sepuluh halaman,
  dikirim lewat formulir resmi di tautan berikut ini.</p>
  <footer>Diterbitkan 1 September 2026</footer>
</article></main>
<footer class="situs">Hak cipta Universitas Contoh</footer>
</body></html>"""

JS_PAGE = """<html><body><main id="isi"></main><script>
document.getElementById('isi').textContent = 'Beasiswa Dirender JavaScript ' + 'x'.repeat(300);
</script></body></html>"""


class _Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):  # sunyi
        pass

    def do_GET(self):
        site = self.server.site  # type: ignore[attr-defined]
        site["requests"].append((self.path, time.monotonic(), self.headers.get("User-Agent", "")))
        if self.path == "/robots.txt":
            status, body = site["robots"]
            self.send_response(status)
            self.end_headers()
            self.wfile.write(body.encode())
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(site["page"].encode())


def serve(robots=(200, "User-agent: *\nDisallow: /rahasia\n"), page=ARTICLE_PAGE):
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    server.site = {"robots": robots, "page": page, "requests": []}  # type: ignore[attr-defined]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


def fetch(url: str, policy: FetchPolicy | None = None, rendered: bool = False) -> str | None:
    async def go():
        fetcher = PoliteFetcher(policy=policy or FetchPolicy(delay_seconds_min=0.0, delay_seconds_max=0.0))
        async with build_client() as client:
            method = fetcher.fetch_rendered if rendered else fetcher.fetch
            return await method(client, url)

    return asyncio.run(go())


def test_robots_server_error_skips_source():
    server, base = serve(robots=(503, "down"))
    try:
        assert fetch(f"{base}/pengumuman") is None, "robots.txt 5xx harus dianggap dilarang, bukan boleh"
        assert [path for path, *_ in server.site["requests"]] == ["/robots.txt"], "halaman tidak boleh diminta"
    finally:
        server.shutdown()


def test_robots_missing_allows():
    server, base = serve(robots=(404, "not found"))
    try:
        assert fetch(f"{base}/pengumuman") is not None, "robots.txt 404 = tidak ada larangan"
    finally:
        server.shutdown()


def test_robots_disallow_for_our_bot_is_respected():
    server, base = serve(robots=(200, "User-agent: StudentFoBot\nDisallow: /\n"))
    try:
        assert fetch(f"{base}/pengumuman") is None
    finally:
        server.shutdown()


def test_delay_also_counts_robots_request():
    server, base = serve()
    try:
        fetch(f"{base}/pengumuman", FetchPolicy(delay_seconds_min=0.4, delay_seconds_max=0.4))
        (robots_path, robots_at, _), (page_path, page_at, agent) = server.site["requests"]
        assert (robots_path, page_path) == ("/robots.txt", "/pengumuman")
        assert page_at - robots_at >= 0.35, f"jeda robots->halaman hanya {page_at - robots_at:.2f} dtk"
        assert agent.startswith("StudentFoBot/"), "User-Agent harus jujur, bukan menyamar"
    finally:
        server.shutdown()


def test_article_header_kept_site_chrome_dropped():
    text = html_to_text(ARTICLE_PAGE, "main")
    assert "Lomba Karya Tulis Ilmiah Nasional 2026" in text, "judul di <article><header> hilang"
    assert "BEM Universitas Contoh" in text, "penyelenggara di <article><header> hilang"
    whole = html_to_text(ARTICLE_PAGE)
    assert "Portal Kampus Contoh" not in whole and "Hak cipta" not in whole, "kerangka situs harus dibuang"
    assert "Lomba Karya Tulis Ilmiah Nasional 2026" in whole


def test_empty_taxonomy_omits_category_enum():
    properties = build_response_schema([])["items"]["properties"]
    assert "categories" not in properties, "enum kosong ditolak API; properti harus tidak dikirim"
    assert build_response_schema(["sains"])["items"]["properties"]["categories"]["items"]["enum"] == ["sains"]


def run_pipeline(sources_yaml: str, *args: str, env_overrides: dict[str, str] | None = None):
    with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as handle:
        handle.write("defaults:\n  delay_seconds_min: 1.0\n  delay_seconds_max: 1.0\n" + sources_yaml)
    env = {key: value for key, value in os.environ.items() if not key.startswith(("TELEGRAM_", "SUPABASE_", "NEXT_PUBLIC_SUPABASE", "GEMINI_"))}
    env.update(env_overrides or {})
    result = subprocess.run(
        [sys.executable, str(PIPELINE / "run.py"), "--config", handle.name, *args],
        capture_output=True,
        text=True,
        env=env,
        timeout=60,
    )
    os.unlink(handle.name)
    return result.returncode, result.stdout + result.stderr


def source(base: str, source_id: str = "lokal") -> str:
    return f"sources:\n  - id: {source_id}\n    name: Lokal\n    start_url: {base}/pengumuman\n    content_selector: main\n"


def test_dry_run_page_without_open_events_is_not_a_failure():
    server, base = serve()
    try:
        code, output = run_pipeline(source(base), "--dry-run")
        assert code == 0, f"halaman sah tanpa kegiatan buka dianggap gagal:\n{output}"
        assert "akan mengirim" in output and "karakter ke Gemini" in output
    finally:
        server.shutdown()


def test_dry_run_failure_never_sends_telegram():
    server, base = serve(robots=(503, "down"))
    try:
        code, output = run_pipeline(
            source(base), "--dry-run", env_overrides={"TELEGRAM_BOT_TOKEN": "x", "TELEGRAM_CHAT_ID": "y"}
        )
        assert code == 1, "sumber gagal tetap harus membuat exit code 1"
        assert "run sungguhan akan mengirim peringatan" in output
        assert "Telegram" not in output, f"dry-run mencoba mengirim Telegram:\n{output}"
    finally:
        server.shutdown()


def test_missing_credentials_is_an_alerted_crash():
    server, base = serve()
    try:
        code, output = run_pipeline(source(base))
        assert code == 1
        assert "variabel lingkungan belum diisi" in output, output
        assert "Telegram belum dikonfigurasi" in output, "crash saat setup harus lewat jalur peringatan"
    finally:
        server.shutdown()


def test_javascript_source_is_rendered():
    if not os.getenv("PLAYWRIGHT_CHROMIUM_EXECUTABLE"):
        print("       (dilewati: PLAYWRIGHT_CHROMIUM_EXECUTABLE tidak diisi)")
        return
    server, base = serve(page=JS_PAGE)
    try:
        # Teksnya ada di kode <script>, jadi pembandingnya teks SETELAH dipangkas.
        assert "Beasiswa Dirender JavaScript" not in html_to_text(fetch(f"{base}/pengumuman") or "", "main")
        html = fetch(f"{base}/pengumuman", rendered=True)
        assert html and "Beasiswa Dirender JavaScript" in html_to_text(html, "main"), "isi JavaScript tidak terbaca"
        paths = [path for path, *_ in server.site["requests"]]
        assert paths.count("/robots.txt") == 2, "jalur render harus tetap lewat robots.txt"
        agents = {agent for path, _, agent in server.site["requests"] if path == "/pengumuman"}
        assert all(agent.startswith("StudentFoBot/") for agent in agents), f"browser menyamar: {agents}"
    finally:
        server.shutdown()


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
