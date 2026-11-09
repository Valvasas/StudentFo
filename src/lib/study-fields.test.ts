import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEED_CATEGORIES } from '@/lib/data/seed-data';
import { cleanStudyFields, STUDY_FIELD_LIMIT, STUDY_FIELDS, studyFieldLabels, withParentCategories } from './study-fields';

const migrationsDir = new URL('../../supabase/migrations/', import.meta.url);
const allMigrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => readFileSync(new URL(name, migrationsDir), 'utf8'))
  .join('\n');

describe('taksonomi bidang spesifik (ADR-075)', () => {
  it('slug unik, berbentuk sama dengan CHECK users_study_fields_shape', () => {
    const slugs = STUDY_FIELDS.map((field) => field.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]{1,60}$/);
  });

  it('setiap induk adalah kategori yang ada di seed DAN di migration', () => {
    const seed = new Set(SEED_CATEGORIES.map((category) => category.slug));
    for (const field of STUDY_FIELDS) {
      expect(seed.has(field.category as never), field.slug).toBe(true);
      expect(allMigrations, field.category).toContain(`'${field.category}')`);
    }
  });

  it('setiap kategori punya bidang spesifik — tidak ada kategori yang "kosong"', () => {
    for (const category of SEED_CATEGORIES) expect(STUDY_FIELDS.some((field) => field.category === category.slug), category.slug).toBe(true);
  });

  it('batas sama dengan CHECK SQL', () => {
    expect(allMigrations).toContain(`cardinality(study_fields) <= ${STUDY_FIELD_LIMIT}`);
  });
});

describe('cleanStudyFields & withParentCategories', () => {
  it('slug asing & duplikat dibuang, dipotong ke batas', () => {
    expect(cleanStudyFields(['teknik-sipil', 'palsu', 'teknik-sipil', 'akuntansi'])).toEqual(['teknik-sipil', 'akuntansi']);
    const many = STUDY_FIELDS.slice(0, STUDY_FIELD_LIMIT + 3).map((field) => field.slug);
    expect(cleanStudyFields(many)).toHaveLength(STUDY_FIELD_LIMIT);
  });

  it('bidang membawa induknya; induk didahulukan saat kategori penuh', () => {
    expect(withParentCategories(['seni'], ['teknik-sipil', 'akuntansi'], 12)).toEqual(['teknik', 'ekonomi', 'seni']);
    expect(withParentCategories(['seni', 'olahraga'], ['teknik-sipil'], 2)).toEqual(['teknik', 'seni']);
    expect(withParentCategories(['seni'], [], 12)).toEqual(['seni']);
  });

  it('label untuk tampilan, slug asing diam-diam dilewati', () => {
    expect(studyFieldLabels(['ui-ux', 'hilang'])).toEqual(['Desain UI/UX']);
  });
});
