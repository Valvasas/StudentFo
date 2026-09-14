# Pipeline data StudentFo

Scrape → validasi → publikasi sebagai `PENDING`. Implementasi Blueprint v3 §7.

```
1. TRIGGER   cron 02:00 WIB (GitHub Actions / Vercel Cron)
2. EXTRACT   ambil HTML — patuh robots.txt, jeda 2-5 dtk/domain, UA identifiable
3. PARSE     Gemini structured output; enum kategori dibaca dari tabel categories
4. VALIDATE  Pydantic + dedup hash; entri cacat ditolak utuh, bukan disimpan separuh
5. STAGE     insert ke `events` dengan status PENDING (service_role, bypass RLS)
6. ALERT     crash atau >30% sumber gagal -> Telegram
7. REVIEW    manusia menyetujui di /admin
```

## Menjalankan

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r pipeline/requirements.txt

cp pipeline/config/sources.example.yaml pipeline/config/sources.yaml
# edit sources.yaml, set enabled: true

# Latihan kering — tidak menyentuh database, tidak butuh kunci API
python pipeline/run.py --config pipeline/config/sources.yaml --dry-run

# Sungguhan
export NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GEMINI_API_KEY=...
python pipeline/run.py --config pipeline/config/sources.yaml
```

Uji: `python pipeline/tests/test_models.py`

## Etika scraping — bukan opsional

Tiga aturan ditegakkan di kode, bukan diserahkan ke kebijaksanaan operator:

1. **`robots.txt` dicek sebelum setiap fetch.** Kalau robots.txt gagal dibaca,
   sumbernya **dilewati** — bukan dianggap boleh. Menganggapnya boleh berarti
   kegagalan jaringan diam-diam mengubah scraper sopan jadi penerobos.
2. **Jeda 2–5 detik per domain**, diacak, dan batas minimum dipaksa di
   `config.py` supaya satu salah ketik di YAML tidak bisa mematikannya.
3. **User-Agent jujur** dengan alamat kontak — tidak menyamar sebagai browser.

Ini juga keputusan keandalan: scraper yang menyamar dan menghajar server orang
akan diblokir dalam hitungan hari, dan pipeline yang diblokir tidak menghasilkan
data.

## Kenapa ada validasi Pydantic padahal LLM-nya sudah structured output

Structured output menjamin **bentuk** JSON-nya, bukan **kewarasan isinya**. Model
masih bisa mengembalikan tenggat di masa lalu, tahun salah baca ("2062"), URL
yang bukan URL, atau dua tenggat utama sekaligus. Baris yang lolos ke tabel
`events` akan dibaca manusia dan dijadikan dasar keputusan — jadi gerbangnya
ada di `models.py`, dan setiap aturannya punya uji.

## Berkas

| Berkas | Isi |
|---|---|
| `run.py` | Orkestrasi; `--dry-run` jalan tanpa kredensial apa pun |
| `studentfo_pipeline/models.py` | Skema Pydantic, aturan validasi, dedup hash |
| `studentfo_pipeline/fetcher.py` | robots.txt, pembatasan laju per domain |
| `studentfo_pipeline/extractor.py` | Pemangkasan HTML, JSON schema, parsing |
| `studentfo_pipeline/publisher.py` | Penulisan ke Supabase (service_role) |
| `studentfo_pipeline/alerts.py` | Ambang kegagalan 30% + Telegram |
| `studentfo_pipeline/config.py` | Pemuatan `sources.yaml` |
