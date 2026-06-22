import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FileRegisterDto } from './dto/file-register.dto';

const validFileRegister = {
  idempotency_key: 'external_webhard_sync:outbox-456:file.register',
  source_worker: 'external_webhard_sync',
  storage_provider: 'google_drive',
  drive_file_id: 'drive-file-001',
  folder_id: '0f0a3f2b-4bd3-4f90-9099-877dd9dc26c3',
  path: 'customer/order/sanitized-name.dxf',
  file_kind: 'drawing_source',
  original_name_safe: 'sanitized-name.dxf',
  mime_type: 'application/dxf',
  size_bytes: 123456,
  content_hash: 'sha256:abc123',
  uploaded_at: '2026-06-19T09:00:00+09:00',
  order_id: 'order-001',
  company_id: 123,
};

async function validateRegister(input: Record<string, unknown>) {
  return validate(plainToInstance(FileRegisterDto, input));
}

describe('FileRegisterDto', () => {
  it('validates a Google Drive file register payload', async () => {
    await expect(validateRegister(validFileRegister)).resolves.toHaveLength(0);
  });

  it.each([
    'idempotency_key',
    'source_worker',
    'storage_provider',
    'path',
    'file_kind',
    'original_name_safe',
    'mime_type',
    'size_bytes',
    'content_hash',
    'uploaded_at',
  ])('rejects missing required field %s', async (field) => {
    const input = { ...validFileRegister };
    delete input[field as keyof typeof input];

    const errors = await validateRegister(input);

    expect(errors.map((error) => error.property)).toContain(field);
  });

  it('allows a null content_hash but not a missing content_hash', async () => {
    await expect(
      validateRegister({ ...validFileRegister, content_hash: null })
    ).resolves.toHaveLength(0);
  });

  it('requires drive_file_id and folder_id for Google Drive payloads', async () => {
    const input: Record<string, unknown> = { ...validFileRegister };
    delete input.drive_file_id;
    delete input.folder_id;

    const errors = await validateRegister(input);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['drive_file_id', 'folder_id'])
    );
  });

  it.each(['r2_legacy', 'local_test'])('rejects legacy provider %s', async (storageProvider) => {
    const errors = await validateRegister({
      ...validFileRegister,
      storage_provider: storageProvider,
    });

    expect(errors.map((error) => error.property)).toContain('storage_provider');
  });

  it('rejects unknown source_worker and storage_provider values', async () => {
    const errors = await validateRegister({
      ...validFileRegister,
      source_worker: 'random_worker',
      storage_provider: 'dropbox',
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['source_worker', 'storage_provider'])
    );
  });

  it('validates numeric and date fields', async () => {
    const errors = await validateRegister({
      ...validFileRegister,
      size_bytes: -1,
      company_id: 0,
      uploaded_at: '2026/06/19 09:00',
    });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['size_bytes', 'company_id', 'uploaded_at'])
    );
  });
});
