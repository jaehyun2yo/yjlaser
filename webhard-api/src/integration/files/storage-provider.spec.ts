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
    storage_provider: 'r2' as const,
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

describe('IntegrationFilesService storage provider mapping', () => {
  it('maps google_drive register payloads to Google Drive confirm metadata', async () => {
    const { service, filesService } = makeService();

    await service.registerFile(baseRegisterDto);

    expect(filesService.confirmUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        storageProvider: 'google_drive',
        driveFileId: 'gdrive-file-001',
        folderId: '0f0a3f2b-4bd3-4f90-9099-877dd9dc26c3',
      }),
      expect.objectContaining({ userType: 'admin', userId: 'integration:file-register' })
    );
  });

  it.each(['r2_legacy', 'local_test'] as const)(
    'maps %s register payloads to the internal r2 metadata branch',
    async (storageProvider) => {
      const { service, filesService } = makeService();
      const dto: FileRegisterDto = {
        ...baseRegisterDto,
        storage_provider: storageProvider,
        folder_id: undefined,
        drive_file_id: undefined,
      };

      await service.registerFile(dto);

      expect(filesService.confirmUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          storageProvider: 'r2',
          key: baseRegisterDto.path,
          name: baseRegisterDto.original_name_safe,
          mimeType: baseRegisterDto.mime_type,
        }),
        expect.objectContaining({ userType: 'admin', userId: 'integration:file-register' })
      );
    }
  );
});
