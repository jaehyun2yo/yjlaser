import { sortFiles, type WebhardFile } from '@/app/webhard/_lib';

function makeFile(overrides: Partial<WebhardFile>): WebhardFile {
  return {
    id: 'file-id',
    name: 'stored.dxf',
    original_name: 'stored.dxf',
    size: 1,
    mime_type: 'application/dxf',
    path: 'webhard/stored.dxf',
    folder_id: null,
    company_id: null,
    uploaded_by: 1,
    inquiry_number: null,
    is_downloaded: false,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T00:00:00.000Z',
    deleted_at: null,
    deleted_by: null,
    companies: null,
    ...overrides,
  };
}

describe('webhard sort contracts', () => {
  it('sorts files by visible uploader display name before company fallback', () => {
    const files = [
      makeFile({
        id: 'company-fallback',
        original_name: 'b.dxf',
        companies: { company_name: '나회사' },
      }),
      makeFile({
        id: 'admin-uploader',
        original_name: 'a.dxf',
        uploader_display_name: '관리자',
        companies: { company_name: '하회사' },
      }),
    ];

    expect(sortFiles(files, 'uploader', 'asc').map((file) => file.id)).toEqual([
      'admin-uploader',
      'company-fallback',
    ]);
  });
});
