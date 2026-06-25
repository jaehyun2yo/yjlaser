import { FilesService } from '../../files/files.service';
import { FileRegisterDto } from './dto/file-register.dto';
import { IntegrationFilesService } from './files.service';

const baseRegisterDto: FileRegisterDto = {
  idempotency_key: 'external_webhard_sync:outbox-456:file.register',
  source_worker: 'external_webhard_sync',
  order_id: 'ord-001',
  company_id: 123,
  folder_id: '0f0a3f2b-4bd3-4f90-9099-877dd9dc26c3',
  storage_provider: 'google_drive',
  drive_file_id: 'gdrive-file-001',
  file_kind: 'drawing_source',
  path: 'customer/order/sanitized-name.dxf',
  original_name_safe: 'sanitized-name.dxf',
  mime_type: 'application/dxf',
  size_bytes: 123456,
  content_hash: null,
  uploaded_at: '2026-06-19T09:00:00+09:00',
};

function makeFileResponse(id = 'file-001') {
  return {
    id,
    name: 'sanitized-name.dxf',
    original_name: 'sanitized-name.dxf',
    size: 123456,
    mime_type: 'application/dxf',
    path: 'customer/order/sanitized-name.dxf',
    folder_id: null,
    company_id: 123,
    uploaded_by: 'admin',
    inquiry_number: null,
    is_downloaded: false,
    created_at: '2026-06-19T09:00:00.000Z',
    updated_at: '2026-06-19T09:00:00.000Z',
    deleted_at: null,
    deleted_by: null,
    storage_provider: 'google_drive' as const,
  };
}

function makeService() {
  const filesService: jest.Mocked<
    Pick<FilesService, 'confirmUpload' | 'findExistingUploadMetadata'>
  > = {
    confirmUpload: jest.fn().mockResolvedValue(makeFileResponse()),
    findExistingUploadMetadata: jest.fn().mockResolvedValue(null),
  };

  return {
    filesService,
    service: new IntegrationFilesService(filesService as never),
  };
}

function collectLogEvents(spy: jest.SpyInstance): Record<string, unknown>[] {
  return spy.mock.calls.map(([message]) => JSON.parse(String(message)));
}

function collectLogText(...spies: jest.SpyInstance[]): string {
  return spies.flatMap((spy) => spy.mock.calls.map(([message]) => String(message))).join('\n');
}

describe('IntegrationFilesService file register logging', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs start and success with elapsed time, source worker, provider, and count', async () => {
    const { service } = makeService();
    const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

    await service.registerFile(baseRegisterDto);

    const events = collectLogEvents(logSpy);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      schema_version: 1,
      project: 'company_site',
      component: 'IntegrationFilesService',
      feature: 'file_register',
      event: 'integration_file_register',
      action: 'register',
      status: 'start',
      channel: 'external',
      count: 1,
      actor_type: 'integration_worker',
      target_type: 'webhard_file',
      metadata: {
        sourceWorker: 'external_webhard_sync',
        storageProvider: 'google_drive',
        fileKind: 'drawing_source',
        companyId: 123,
        hasFolderId: true,
        hasDriveFileId: true,
      },
    });
    expect(events[1]).toMatchObject({
      status: 'success',
      duration_ms: expect.any(Number),
      count: 1,
      metadata: {
        duplicate: false,
        sourceWorker: 'external_webhard_sync',
        storageProvider: 'google_drive',
      },
    });
    expect(events[1].target_id_hash).toEqual(expect.stringMatching(/^[a-f0-9]{16}$/));

    const logText = collectLogText(logSpy);
    expect(logText).not.toContain(baseRegisterDto.idempotency_key);
    expect(logText).not.toContain(baseRegisterDto.path);
    expect(logText).not.toContain(baseRegisterDto.original_name_safe);
    expect(logText).not.toContain(baseRegisterDto.drive_file_id);
  });

  it('logs duplicate success without creating another metadata row', async () => {
    const { service, filesService } = makeService();
    filesService.findExistingUploadMetadata.mockResolvedValueOnce(
      makeFileResponse('file-existing')
    );
    const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

    await service.registerFile(baseRegisterDto);

    const events = collectLogEvents(logSpy);
    expect(events[1]).toMatchObject({
      status: 'success',
      duration_ms: expect.any(Number),
      target_id_hash: expect.stringMatching(/^[a-f0-9]{16}$/),
      metadata: {
        duplicate: true,
      },
    });
    const logText = collectLogText(logSpy);
    expect(logText).not.toContain('file-existing');
    expect(filesService.confirmUpload).not.toHaveBeenCalled();
  });

  it('logs failure with elapsed time and sanitized error type before rethrowing', async () => {
    const { service, filesService } = makeService();
    filesService.confirmUpload.mockRejectedValueOnce(new Error('downstream unavailable'));
    const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();
    const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

    await expect(service.registerFile(baseRegisterDto)).rejects.toThrow('downstream unavailable');

    const startEvents = collectLogEvents(logSpy);
    const errorEvents = collectLogEvents(errorSpy);
    expect(startEvents[0]).toMatchObject({ status: 'start' });
    expect(errorEvents[0]).toMatchObject({
      status: 'failure',
      duration_ms: expect.any(Number),
      count: 1,
      error_type: 'Error',
      metadata: {
        sourceWorker: 'external_webhard_sync',
        storageProvider: 'google_drive',
      },
    });

    const errorText = collectLogText(errorSpy);
    expect(errorText).not.toContain(baseRegisterDto.idempotency_key);
    expect(errorText).not.toContain(baseRegisterDto.path);
    expect(errorText).not.toContain(baseRegisterDto.original_name_safe);
    expect(errorText).not.toContain(baseRegisterDto.drive_file_id);
  });
});
