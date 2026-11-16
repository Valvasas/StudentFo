import { describe, expect, it } from 'vitest';
import { FORM_TEMPLATES } from './form-templates';
import { formFieldsSchema, newFieldId, REGISTRATION_FORM_LIMITS } from './registration-form';

describe('FORM_TEMPLATES', () => {
  it('setiap templat lolos skema server — tidak pernah menghasilkan formulir yang ditolak saat disimpan', () => {
    for (const template of FORM_TEMPLATES) {
      const fields = template.fields.map((field) => ({ ...field, id: newFieldId() }));
      const parsed = formFieldsSchema.safeParse(fields);
      expect(parsed.success, template.key).toBe(true);
      expect(fields.length).toBeLessThanOrEqual(REGISTRATION_FORM_LIMITS.maxFields);
    }
  });

  it('kunci unik & tanpa kolom unggah berkas (ADR-056)', () => {
    expect(new Set(FORM_TEMPLATES.map((template) => template.key)).size).toBe(FORM_TEMPLATES.length);
    for (const template of FORM_TEMPLATES) {
      expect(template.fields.every((field) => (field.type as string) !== 'file')).toBe(true);
    }
  });
});
