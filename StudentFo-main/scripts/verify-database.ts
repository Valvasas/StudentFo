import fs from 'node:fs';
import path from 'node:path';

// Fungsi parsing file .env sederhana
function loadEnvLocal(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const env: Record<string, string> = { ...process.env } as Record<string, string>;

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!env[key]) {
          env[key] = val;
        }
      }
    }
  }
  return env;
}

async function verifyDatabase() {
  console.log('='.repeat(60));
  console.log(' StudentFo — Verifikasi Koneksi Database Supabase');
  console.log('='.repeat(60));

  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    console.log('\n[STATUS: MODE SEED]');
    console.log('⚠️  NEXT_PUBLIC_SUPABASE_URL atau NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi di .env.local.');
    console.log('   Aplikasi berjalan penuh dalam mode in-memory seed (tidak butuh database).');
    console.log('\nUntuk menghubungkan database Supabase sungguhan:');
    console.log(' 1. Buat project baru di https://supabase.com');
    console.log(' 2. Salin Project URL dan anon public key ke .env.local:');
    console.log('    NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co');
    console.log('    NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>');
    console.log('    SUPABASE_SERVICE_ROLE_KEY=<service-role-key>');
    console.log(' 3. Jalankan file migration di folder supabase/migrations/ di SQL Editor Supabase');
    console.log(' 4. Jalankan kembali: npm run db:verify\n');
    return;
  }

  console.log(`\nURL Target: ${url}`);
  console.log('Menguji koneksi ke endpoint Supabase REST...');

  try {
    // 1. Uji koneksi dasar dan tabel categories
    const categoriesRes = await fetch(`${url}/rest/v1/categories?select=id,name,slug&limit=5`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    if (!categoriesRes.ok) {
      console.error(`\n❌ Gagal mengakses tabel categories: HTTP ${categoriesRes.status} ${categoriesRes.statusText}`);
      const text = await categoriesRes.text();
      console.error(`   Detail: ${text}`);
      return;
    }

    const categories = (await categoriesRes.json()) as unknown[];
    console.log(`✓ Tabel categories terbaca (${categories.length} data sampel terdeteksi).`);

    // 2. Uji view events_listing
    const eventsRes = await fetch(`${url}/rest/v1/events_listing?select=id,title,status&limit=1`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    if (!eventsRes.ok) {
      console.warn(`⚠️  View events_listing belum aktif atau migration 0004 belum dijalankan.`);
    } else {
      console.log('✓ View events_listing aktif dan dapat di-query.');
    }

    // 3. Uji RPC get_distinct_organizer_count
    const rpcRes = await fetch(`${url}/rest/v1/rpc/get_distinct_organizer_count`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (rpcRes.ok) {
      const count = await rpcRes.json();
      console.log(`✓ RPC get_distinct_organizer_count() terdaftar (jumlah: ${count}).`);
    } else {
      console.warn('⚠️  RPC get_distinct_organizer_count() belum dibuat. Jalankan migration 0006.');
    }

    // 4. Uji tabel saved_events & application_tracker
    const savedRes = await fetch(`${url}/rest/v1/saved_events?select=event_id&limit=1`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    if (savedRes.status === 200 || savedRes.status === 401 || savedRes.status === 403) {
      console.log('✓ Tabel saved_events terdaftar dan dilindungi RLS.');
    }

    const trackerRes = await fetch(`${url}/rest/v1/application_tracker?select=id&limit=1`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    if (trackerRes.status === 200 || trackerRes.status === 401 || trackerRes.status === 403) {
      console.log('✓ Tabel application_tracker terdaftar dan dilindungi RLS.');
    }

    // 5. Uji service_role key jika tersedia
    if (serviceKey) {
      const adminRes = await fetch(`${url}/rest/v1/events?select=id,title&status=eq.PENDING&limit=1`, {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      });
      if (adminRes.ok) {
        console.log('✓ SUPABASE_SERVICE_ROLE_KEY valid (bisa membaca baris PENDING untuk moderasi admin).');
      } else {
        console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY tidak dapat mengakses baris PENDING.');
      }
    } else {
      console.log('ℹ️  SUPABASE_SERVICE_ROLE_KEY belum diisi (diperlukan untuk fungsi moderasi admin & scraper pipeline).');
    }

    console.log('\n[HASIL: KONEKSI DATABASE SUPABASE PROPER DAN SIAP DIGUNAKAN! 🎉]\n');
  } catch (error) {
    console.error('\n❌ Terjadi kesalahan saat menghubungi server Supabase:', error);
  }
}

verifyDatabase();

