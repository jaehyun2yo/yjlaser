/**
 * WebhardFile 테스트 데이터 팩토리
 * 테스트에서 사용할 WebhardFile 객체를 생성합니다.
 */

import { generateTestId } from '@/__tests__/helpers/test-utils';

export interface WebhardFileData {
  id: string;
  name: string;
  original_name: string;
  size: number;
  mime_type: string;
  path: string;
  folder_id: string | null;
  company_id: number | null;
  is_downloaded: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: number | null;
}

export interface CreateWebhardFileOptions {
  id?: string;
  name?: string;
  original_name?: string;
  size?: number;
  mime_type?: string;
  path?: string;
  folder_id?: string | null;
  company_id?: number | null;
  is_downloaded?: boolean;
  created_at?: string | Date;
  updated_at?: string | Date;
  deleted_at?: string | Date | null;
  deleted_by?: number | null;
}

/**
 * 기본 WebhardFile 생성
 */
export function createWebhardFile(options: CreateWebhardFileOptions = {}): WebhardFileData {
  const now = new Date();
  const id = options.id ?? generateTestId('file');

  return {
    id,
    name: options.name ?? `${id}.pdf`,
    original_name: options.original_name ?? 'Test Document.pdf',
    size: options.size ?? 1024,
    mime_type: options.mime_type ?? 'application/pdf',
    path: options.path ?? `webhard/${id}.pdf`,
    folder_id: options.folder_id ?? null,
    company_id: options.company_id ?? null,
    is_downloaded: options.is_downloaded ?? false,
    created_at: formatDate(options.created_at ?? now),
    updated_at: formatDate(options.updated_at ?? now),
    deleted_at: options.deleted_at ? formatDate(options.deleted_at) : null,
    deleted_by: options.deleted_by ?? null,
  };
}

/**
 * 다운로드된 파일 생성
 */
export function createDownloadedFile(options: CreateWebhardFileOptions = {}): WebhardFileData {
  return createWebhardFile({
    ...options,
    is_downloaded: true,
  });
}

/**
 * 삭제된 파일 생성 (휴지통)
 */
export function createDeletedFile(
  options: CreateWebhardFileOptions & { deleted_by?: number } = {}
): WebhardFileData {
  return createWebhardFile({
    ...options,
    deleted_at: options.deleted_at ?? new Date(),
    deleted_by: options.deleted_by ?? 1,
  });
}

/**
 * 특정 폴더에 속한 파일 생성
 */
export function createFileInFolder(
  folderId: string,
  options: CreateWebhardFileOptions = {}
): WebhardFileData {
  return createWebhardFile({
    ...options,
    folder_id: folderId,
  });
}

/**
 * 특정 회사에 속한 파일 생성
 */
export function createCompanyFile(
  companyId: number,
  options: CreateWebhardFileOptions = {}
): WebhardFileData {
  return createWebhardFile({
    ...options,
    company_id: companyId,
  });
}

/**
 * 여러 파일 일괄 생성
 */
export function createWebhardFiles(
  count: number,
  options: CreateWebhardFileOptions = {}
): WebhardFileData[] {
  return Array.from({ length: count }, (_, index) =>
    createWebhardFile({
      ...options,
      original_name: options.original_name ?? `Test Document ${index + 1}.pdf`,
    })
  );
}

/**
 * 다양한 파일 타입 생성
 */
export function createMixedTypeFiles(): WebhardFileData[] {
  return [
    createWebhardFile({ mime_type: 'application/pdf', original_name: 'Document.pdf' }),
    createWebhardFile({ mime_type: 'image/png', original_name: 'Image.png' }),
    createWebhardFile({ mime_type: 'image/jpeg', original_name: 'Photo.jpg' }),
    createWebhardFile({
      mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      original_name: 'Spreadsheet.xlsx',
    }),
    createWebhardFile({
      mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      original_name: 'Document.docx',
    }),
    createWebhardFile({ mime_type: 'application/zip', original_name: 'Archive.zip' }),
  ];
}

// 헬퍼 함수
function formatDate(date: string | Date): string {
  if (typeof date === 'string') {
    return date;
  }
  return date.toISOString();
}
