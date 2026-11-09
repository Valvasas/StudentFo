#!/usr/bin/env node
/**
 * Tulis ulang supabase/templates/*.html dari src/lib/email/auth-email-templates.ts (ADR-078).
 *   npm run email:templates
 * Berkas hasilnya yang ditempel ke Supabase → Authentication → Emails.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { AUTH_EMAIL_TEMPLATES } from '../src/lib/email/auth-email-templates.ts';

mkdirSync('supabase/templates', { recursive: true });
for (const template of AUTH_EMAIL_TEMPLATES) writeFileSync(`supabase/templates/${template.key}.html`, template.html);
console.log(`${AUTH_EMAIL_TEMPLATES.length} template ditulis ke supabase/templates/`);
