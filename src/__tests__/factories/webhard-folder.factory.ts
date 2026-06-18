/**
 * WebhardFolder 테스트 데이터 팩토리
 * 테스트에서 사용할 WebhardFolder 객체를 생성합니다.
 */

import { generateTestId } from '@/__tests__/helpers/test-utils';

export interface WebhardFolderData {
  id: string;
  name: string;
  parent_id: string | null;
  company_id: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: number | null;
  materialized_path: string | null;
}

export interface CreateWebhardFolderOptions {
  id?: string;
  name?: string;
  parent_id?: string | null;
  company_id?: number | null;
  created_at?: string | Date;
  updated_at?: string | Date;
  deleted_at?: string | Date | null;
  deleted_by?: number | null;
  materialized_path?: string | null;
}

/**
 * 기본 WebhardFolder 생성
 */
export function createWebhardFolder(options: CreateWebhardFolderOptions = {}): WebhardFolderData {
  const now = new Date();
  const id = options.id ?? generateTestId('folder');

  return {
    id,
    name: options.name ?? 'Test Folder',
    parent_id: options.parent_id ?? null,
    company_id: options.company_id ?? null,
    created_at: formatDate(options.created_at ?? now),
    updated_at: formatDate(options.updated_at ?? now),
    deleted_at: options.deleted_at ? formatDate(options.deleted_at) : null,
    deleted_by: options.deleted_by ?? null,
    materialized_path: options.materialized_path ?? null,
  };
}

/**
 * 루트 폴더 생성 (parent_id = null)
 */
export function createRootFolder(options: CreateWebhardFolderOptions = {}): WebhardFolderData {
  return createWebhardFolder({
    ...options,
    parent_id: null,
    name: options.name ?? 'Root Folder',
  });
}

/**
 * 하위 폴더 생성
 */
export function createSubFolder(
  parentId: string,
  options: CreateWebhardFolderOptions = {}
): WebhardFolderData {
  return createWebhardFolder({
    ...options,
    parent_id: parentId,
  });
}

/**
 * 특정 회사에 속한 폴더 생성
 */
export function createCompanyFolder(
  companyId: number,
  options: CreateWebhardFolderOptions = {}
): WebhardFolderData {
  return createWebhardFolder({
    ...options,
    company_id: companyId,
    name: options.name ?? `Company ${companyId} Folder`,
  });
}

/**
 * 삭제된 폴더 생성 (휴지통)
 */
export function createDeletedFolder(
  options: CreateWebhardFolderOptions & { deleted_by?: number } = {}
): WebhardFolderData {
  return createWebhardFolder({
    ...options,
    deleted_at: options.deleted_at ?? new Date(),
    deleted_by: options.deleted_by ?? 1,
  });
}

/**
 * 폴더 계층 구조 생성
 * @returns [root, child1, child2, grandchild]
 */
export function createFolderHierarchy(): WebhardFolderData[] {
  const root = createRootFolder({ name: 'Root' });
  const child1 = createSubFolder(root.id, { name: 'Child 1' });
  const child2 = createSubFolder(root.id, { name: 'Child 2' });
  const grandchild = createSubFolder(child1.id, { name: 'Grandchild' });

  return [root, child1, child2, grandchild];
}

/**
 * 여러 폴더 일괄 생성
 */
export function createWebhardFolders(
  count: number,
  options: CreateWebhardFolderOptions = {}
): WebhardFolderData[] {
  return Array.from({ length: count }, (_, index) =>
    createWebhardFolder({
      ...options,
      name: options.name ?? `Test Folder ${index + 1}`,
    })
  );
}

/**
 * 회사별 폴더 구조 생성
 */
export function createCompanyFolderStructure(companyId: number): WebhardFolderData[] {
  const root = createCompanyFolder(companyId, { name: `Company ${companyId}` });
  const documents = createSubFolder(root.id, { name: '문서', company_id: companyId });
  const images = createSubFolder(root.id, { name: '이미지', company_id: companyId });
  const archive = createSubFolder(root.id, { name: '보관', company_id: companyId });

  return [root, documents, images, archive];
}

// 헬퍼 함수
function formatDate(date: string | Date): string {
  if (typeof date === 'string') {
    return date;
  }
  return date.toISOString();
}
