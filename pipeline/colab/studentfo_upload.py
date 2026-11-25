# =====================================================================
# StudentFo — unggah hasil otomasi info lomba dari Google Colab (ADR-102)
#
# Cara pakai: salin tiap blok "# %%" ke SEL Colab terpisah, urut dari atas.
# Sel 4 mengharapkan variabel `extracted_opportunities` (list of dict) dari
# langkah ekstraksi lo sebelumnya.
#
# Yang dijamin skrip ini:
#  - Tulis HANYA lewat RPC `upsert_scraped_event` (bukan insert/upsert ke tabel
#    `events`): kegiatan baru selalu PENDING di antrean moderasi, duplikat tidak
#    dobel, kegiatan yang sudah ditinjau moderator TIDAK pernah ditimpa.
#  - Satu rekor gagal tidak menghentikan batch; ada retry untuk galat jaringan.
#  - DRY_RUN memvalidasi & menampilkan payload tanpa menyentuh Supabase.
# =====================================================================

# %% [Sel 1] Pasang dependensi (jalankan sekali per sesi Colab)
# !pip install -q supabase

# %% [Sel 2] Konfigurasi — rahasia dari Colab Secrets (ikon kunci di sidebar), BUKAN ditulis di kode
import hashlib
import mimetypes
import os
import re
import time
from datetime import datetime, timedelta, timezone

try:
    from google.colab import userdata  # type: ignore

    def secret(name, default=None):
        try:
            return userdata.get(name)
        except Exception:  # secret belum dibuat / akses notebook belum diberikan
            return os.environ.get(name, default)
except ImportError:  # dijalankan di luar Colab (mis. uji lokal)
    def secret(name, default=None):
        return os.environ.get(name, default)

SUPABASE_URL = (secret("SUPABASE_URL") or "").replace("/rest/v1/", "").replace("/rest/v1", "").rstrip("/")
SUPABASE_KEY = secret("SUPABASE_KEY")  # WAJIB service_role key; jangan pernah di-print atau di-commit
SUPABASE_BUCKET = secret("SUPABASE_BUCKET", "studentfo-files")  # bucket PUBLIK untuk guidebook (& poster lokal)
DRY_RUN = True  # ubah ke False setelah hasil validasi di Sel 4 terlihat benar
RETRIES = 3

WIB = timezone(timedelta(hours=7))
EVENT_TYPES = {"LOMBA", "BEASISWA", "MAGANG", "WORKSHOP", "KONFERENSI", "PELATIHAN", "VOLUNTEER"}
EDUCATION = {
    "sma": "SMA_SMK", "smk": "SMA_SMK", "sma_smk": "SMA_SMK", "sma/smk": "SMA_SMK",
    "d3": "D3", "d4": "D4_S1", "s1": "D4_S1", "d4_s1": "D4_S1", "d4/s1": "D4_S1",
    "s2": "S2", "s3": "S3", "umum": "UMUM",
}
LONG_TEXT_MAX = 2000  # = CHECK di database; lebih panjang dipotong di batas kata


# %% [Sel 3] Fungsi bantu (murni, tanpa jaringan — diuji di pipeline/tests/test_colab_upload.py)
def https_url(value):
    """URL https absolut tanpa spasi (≤ 2000) atau None. http:// ditolak: database juga menolaknya."""
    text = str(value or "").strip()
    return text if re.fullmatch(r"https://\S+", text) and len(text) <= 2000 else None


def tidy_text(value):
    text = re.sub(r"[ \t]+", " ", str(value or "")).strip()
    if len(text) <= LONG_TEXT_MAX:
        return text
    return text[:LONG_TEXT_MAX].rsplit(" ", 1)[0].rstrip(" ,;:-") + "…"


def parse_deadline(value, now=None):
    """ISO 8601 / dd-mm-yyyy → ISO dengan zona WIB. Tanggal tanpa jam = 23:59 WIB (masih buka sepanjang hari)."""
    text = str(value or "").strip()
    if not text:
        return None
    m = re.fullmatch(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})", text)
    if m:
        text = f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
            moment = datetime.fromisoformat(text).replace(hour=23, minute=59, tzinfo=WIB)
        else:
            moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
            if moment.tzinfo is None:
                moment = moment.replace(tzinfo=WIB)  # sumber Indonesia menulis waktu lokal
    except ValueError:
        return None
    now = now or datetime.now(timezone.utc)
    if moment < now or moment > now + timedelta(days=365 * 3):
        return None  # sudah lewat, atau tahun salah baca (2026 → 2062)
    return moment.isoformat()


def as_list(value):
    if isinstance(value, (list, tuple, set)):
        return [str(x).strip() for x in value if str(x).strip()]
    return [x.strip() for x in re.split(r"[,;|]", str(value or "")) if x.strip()]


def build_payload(rec, poster_url=None, guidebook_url=None, now=None):
    """Rekor → (payload RPC, daftar galat). Galat tidak kosong = rekor dilewati, bukan dikirim setengah jadi."""
    errors = []
    title = re.sub(r"\s+", " ", str(rec.get("title") or "")).strip()
    organizer = re.sub(r"\s+", " ", str(rec.get("organizer") or "")).strip()
    event_type = str(rec.get("event_type") or "").strip().upper()
    link = https_url(rec.get("registration_link") or rec.get("url"))
    source = https_url(rec.get("source_url") or rec.get("url") or rec.get("registration_link"))
    deadline = parse_deadline(rec.get("deadline_iso") or rec.get("deadline_at") or rec.get("deadline"), now)

    if len(title) < 5:
        errors.append("judul < 5 karakter")
    if len(organizer) < 2:
        errors.append("penyelenggara kosong")
    if event_type not in EVENT_TYPES:
        errors.append(f"event_type '{event_type}' tidak dikenal")
    if not link:
        errors.append("registration_link bukan URL https")
    if not source:
        errors.append("source_url bukan URL https")
    if not deadline:
        errors.append("tenggat kosong, sudah lewat, atau tidak terbaca")
    if errors:
        return None, errors

    levels = []
    for raw in as_list(rec.get("education_levels") or rec.get("education_level")):
        mapped = EDUCATION.get(raw.lower())
        if mapped and mapped not in levels:
            levels.append(mapped)

    payload = {
        "title": title,
        "organizer": organizer,
        "description": tidy_text(rec.get("description")),
        "benefits": tidy_text(rec.get("benefits")),
        "requirements": tidy_text(rec.get("requirements")),
        "event_type": event_type,
        "registration_link": link,
        "source_url": source,
        "education_levels": levels,
        "location": (str(rec.get("location") or "").strip() or None),
        "is_online": bool(rec.get("is_online")),
        "categories": as_list(rec.get("categories")),  # slug tak dikenal diabaikan database
        "deadlines": [{"label": "registration", "deadline_at": deadline, "is_primary": True}],
    }
    guide = https_url(guidebook_url or rec.get("guidebook_url"))
    if guide:
        payload["guidebook_url"] = guide
    image = https_url(poster_url or rec.get("poster_url") or rec.get("poster_source_url"))
    if image:  # server mengambil, memeriksa, dan MENYIMPAN ULANG gambarnya; URL ini bukan yang ditayangkan
        payload["media"] = [{"url": image, "is_poster": True, "caption": "Poster dari laman resmi penyelenggara"}]
    return payload, []


def storage_name(local_path, folder):
    """Nama berkas = hash isi: unggah ulang berkas yang sama menimpa dirinya sendiri, dua berkas bernama sama tidak bertabrakan."""
    with open(local_path, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()[:20]
    return f"{folder}/{digest}{os.path.splitext(local_path)[1].lower()}"


def with_retry(action, attempts=RETRIES):
    for attempt in range(1, attempts + 1):
        try:
            return action()
        except Exception:  # noqa: BLE001
            if attempt == attempts:
                raise
            time.sleep(2 ** attempt)


def upload_to_storage(supabase, local_path, folder):
    """Unggah ke bucket publik → URL https, atau None (dengan alasan di log). Tidak melempar."""
    if not local_path or not os.path.exists(local_path):
        return None
    content_type = mimetypes.guess_type(local_path)[0] or "application/octet-stream"
    try:
        path = storage_name(local_path, folder)
        with open(local_path, "rb") as f:
            data = f.read()
        with_retry(lambda: supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=path, file=data, file_options={"content-type": content_type, "upsert": "true"}))
        return https_url(str(supabase.storage.from_(SUPABASE_BUCKET).get_public_url(path)).rstrip("?"))
    except Exception as exc:  # noqa: BLE001
        print(f"  ! upload gagal ({local_path}): {exc}")
        return None


# %% [Sel 4] Jalankan. Mulai dengan DRY_RUN = True (default), periksa ringkasannya, baru ubah ke False.
def run_upload(extracted_opportunities):
    supabase = None
    if not DRY_RUN:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise SystemExit("Isi secret SUPABASE_URL dan SUPABASE_KEY (service_role) di Colab Secrets dulu.")
        from supabase import create_client  # hanya dibutuhkan saat benar-benar kirim

        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    report = []
    for rec in extracted_opportunities:
        title = str(rec.get("title") or "(tanpa judul)")[:80]
        poster_url = guidebook_url = None
        if supabase:  # berkas lokal → URL https publik; hasilnya dipakai payload
            poster_url = upload_to_storage(supabase, rec.get("local_poster"), "posters")
            guidebook_url = upload_to_storage(supabase, rec.get("local_guidebook"), "guidebooks")

        payload, errors = build_payload(rec, poster_url, guidebook_url)
        if errors:
            report.append({"title": title, "hasil": "dilewati", "detail": "; ".join(errors)})
            continue
        if DRY_RUN:
            report.append({"title": title, "hasil": "siap-kirim", "detail": f"guidebook={'guidebook_url' in payload} poster={'media' in payload}"})
            continue
        try:
            res = with_retry(lambda: supabase.rpc("upsert_scraped_event", {"p": payload}).execute())
            outcome = res.data if isinstance(res.data, dict) else {"action": "unknown"}
            report.append({"title": title, "hasil": outcome.get("action", "unknown"), "detail": outcome.get("status", "")})
        except Exception as exc:  # noqa: BLE001 — satu rekor gagal tidak menghentikan batch
            report.append({"title": title, "hasil": "gagal", "detail": str(exc)[:200]})

    counts = {}
    for row in report:
        counts[row["hasil"]] = counts.get(row["hasil"], 0) + 1
    print("RINGKASAN:", counts, "(DRY_RUN)" if DRY_RUN else "")
    for row in report:
        print(f"  [{row['hasil']:>10}] {row['title']}  {row['detail']}")
    try:
        import pandas as pd  # tersedia di Colab

        pd.DataFrame(report).to_csv("studentfo_upload_report.csv", index=False)
        print("Laporan lengkap: studentfo_upload_report.csv")
    except ImportError:
        pass
    return report


# Di Colab, jalankan di sel terakhir:
# report = run_upload(extracted_opportunities)
#
# Arti hasil:  created   = baru, masuk antrean moderasi (PENDING) di /admin
#              updated   = kegiatan yang sama masih PENDING → isinya diperbarui
#              locked    = sudah disetujui/ditolak moderator → TIDAK disentuh (edit lewat /admin)
#              duplicate = sudah ada dan tidak ada yang perlu dibuat
#              dilewati  = gagal validasi lokal (lihat detail); gagal = galat jaringan/server
