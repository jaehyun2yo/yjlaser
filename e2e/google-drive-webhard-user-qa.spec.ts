import {
  test,
  expect,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import crypto from 'crypto';
import * as path from 'path';

const adminAuthFile = path.join(__dirname, '..', '.auth', 'user.json');
const apiBaseUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
const apiKey = process.env.MIGRATION_API_KEY || '';
const DEFAULT_SESSION_SECRET_SENTINEL = 'change-this-in-production';
const DEV_ONLY_SESSION_SECRET = 'change-this-in-production-dev-only';

type CompanyResponse = {
  id: number;
  company_name: string;
  status?: string | null;
  webhard_access?: boolean | null;
  drive_provisioning_status?: string | null;
  drive_root_folder_id?: string | null;
};

type DriveProvisioningResponse = {
  status?: string;
  drive_root_folder_id?: string | null;
  error?: string | null;
};

type FolderDto = {
  id: string;
  name: string;
  parent_id: string | null;
  company_id: number | null;
  path?: string | null;
};

type FolderListResponse = {
  folders?: FolderDto[];
  total?: number;
};

type FileDto = {
  id: string;
  name: string;
  original_name: string;
  path: string;
  folder_id: string | null;
  company_id: number | null;
  is_downloaded: boolean;
  storage_provider?: 'google_drive' | 'r2';
};

type FileListResponse = {
  files?: FileDto[];
  total?: number;
};

type SearchResponse = {
  files?: FileDto[];
  folders?: FolderDto[];
  total?: number;
};

type TrashResponse = {
  files?: FileDto[];
  total?: number;
  pagination?: { total?: number };
};

type BatchUploadResponse = {
  success?: boolean;
  data?: {
    files?: Array<{
      fileName?: string;
      presignedUrl?: string;
      uploadHeaders?: Record<string, string>;
      objectKey?: string;
      publicUrl?: string;
      folderId?: string;
      storageProvider?: 'google_drive' | 'r2';
      driveFileId?: string;
    }>;
  };
};

type ConsistencyDiagnostics = {
  missingDriveIds: {
    folders: { count: number };
    files: { count: number };
  };
  duplicateActiveCompanyRoots: {
    companyCount: number;
  };
  driveApi404: {
    missingFolders: { count: number };
    missingFiles: { count: number };
  };
};

type ShareLinkListItem = {
  token: string;
  company_id: number | null;
  file_name: string;
};

function createApiKeyOnlyHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('X-API-Key', requireApiKey());
  return headers;
}

async function apiKeyOnlyFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: createApiKeyOnlyHeaders(init?.headers),
    cache: 'no-store',
  });
}

function requireApiKey(): string {
  expect(apiKey, 'MIGRATION_API_KEY is required for Google Drive webhard QA E2E').not.toBe('');
  return apiKey;
}

function getE2ESessionSecret(): string {
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret && sessionSecret !== DEFAULT_SESSION_SECRET_SENTINEL) {
    return sessionSecret;
  }

  return DEV_ONLY_SESSION_SECRET;
}

function createSessionCookieValue(userType: 'admin' | 'company', userId: string | number): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const sessionData = JSON.stringify({
    kind: 'browser',
    userType,
    userId,
    iat: nowSeconds,
    exp: nowSeconds + 60 * 60 * 4,
  });
  const token = crypto.randomBytes(32).toString('hex');
  const tokenAndData = `${token}:${sessionData}`;
  const hmac = crypto.createHmac('sha256', getE2ESessionSecret());
  hmac.update(tokenAndData);
  const signature = hmac.digest('hex');

  return `${encodeURIComponent(tokenAndData)}.${signature}`;
}

function createAdminSessionHeaders(): Record<string, string> {
  const csrfToken = crypto.randomBytes(24).toString('hex');

  return {
    Cookie: `admin-session=${createSessionCookieValue('admin', 'admin')}; csrf-token=${csrfToken}`,
    'X-CSRF-Token': csrfToken,
  };
}

function createCompanySessionHeaders(companyId: number): Record<string, string> {
  const csrfToken = crypto.randomBytes(24).toString('hex');

  return {
    Cookie: `company-session=${createSessionCookieValue('company', companyId)}; csrf-token=${csrfToken}`,
    'X-CSRF-Token': csrfToken,
  };
}

async function expectJsonResponse<T>(response: APIResponse, description: string): Promise<T> {
  expect(
    response.ok(),
    `${description} failed with status ${response.status()}: ${await response.text().catch(() => '')}`
  ).toBe(true);
  return (await response.json()) as T;
}

async function createCompany(request: APIRequestContext, suffix: string): Promise<CompanyResponse> {
  const uniqueNumber = String(Date.now()).slice(-8) + suffix.replace(/\D/g, '').padStart(2, '0');
  const response = await request.post(`${apiBaseUrl}/api/v1/companies`, {
    headers: { 'X-API-Key': requireApiKey() },
    data: {
      companyName: `E2E-GDrive-${suffix}`,
      username: `e2e_gdrive_${suffix.toLowerCase()}`,
      passwordHash: '$2a$10$e2eGoogleDriveWebhardQaHashValue000000000000000000',
      businessRegistrationNumber: `e2e-${uniqueNumber}`,
      representativeName: 'E2E 대표',
      businessAddress: '서울시 테스트구 테스트로 1',
      managerName: 'E2E 담당자',
      managerPosition: 'QA',
      managerPhone: '010-0000-0000',
      managerEmail: `e2e-${suffix.toLowerCase()}@example.com`,
      quoteMethodEmail: true,
    },
  });

  return expectJsonResponse<CompanyResponse>(response, `create company ${suffix}`);
}

async function approveCompany(
  request: APIRequestContext,
  companyId: number
): Promise<{ company?: CompanyResponse; driveProvisioning?: DriveProvisioningResponse }> {
  const response = await request.post(`${apiBaseUrl}/api/v1/companies/${companyId}/approve`, {
    headers: { 'X-API-Key': requireApiKey() },
    data: { approvedBy: 'e2e-google-drive-webhard-qa' },
  });

  return expectJsonResponse(response, `approve company ${companyId}`);
}

async function getCompany(request: APIRequestContext, companyId: number): Promise<CompanyResponse> {
  const response = await request.get(`${apiBaseUrl}/api/v1/companies/${companyId}`, {
    headers: { 'X-API-Key': requireApiKey() },
  });

  return expectJsonResponse<CompanyResponse>(response, `get company ${companyId}`);
}

async function waitForCompanyDriveReady(
  request: APIRequestContext,
  companyId: number
): Promise<CompanyResponse> {
  let lastCompany: CompanyResponse | null = null;

  await expect
    .poll(
      async () => {
        lastCompany = await getCompany(request, companyId);
        return (
          lastCompany.drive_provisioning_status === 'ready' &&
          Boolean(lastCompany.drive_root_folder_id)
        );
      },
      { timeout: 120000 }
    )
    .toBe(true);

  if (!lastCompany) {
    throw new Error(`Company ${companyId} was not loaded`);
  }

  return lastCompany;
}

async function createCompanyContext(
  browser: Browser,
  baseURL: string,
  companyId: number
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const url = new URL(baseURL);
  await context.addCookies([
    {
      name: 'company-session',
      value: createSessionCookieValue('company', companyId),
      domain: url.hostname,
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 60 * 60 * 4,
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
  return context;
}

async function waitForWebhardReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.getByText('파일명', { exact: true }).filter({ visible: true }).first().waitFor({
    state: 'visible',
    timeout: 60000,
  });
  await expect
    .poll(
      async () => {
        const folderLoaders = await page
          .getByText('폴더 로딩 중...', { exact: true })
          .filter({ visible: true })
          .count();
        const fileLoaders = await page
          .getByText('파일 목록을 불러오는 중...', { exact: true })
          .filter({ visible: true })
          .count();
        return folderLoaders + fileLoaders;
      },
      { timeout: 60000 }
    )
    .toBe(0);
}

async function listFolders(page: Page, parentId?: string): Promise<FolderDto[]> {
  const url = parentId
    ? `/api/webhard/folders?parentId=${encodeURIComponent(parentId)}`
    : '/api/webhard/folders';
  const response = await page.request.get(url, { timeout: 60000 });
  const body = await expectJsonResponse<FolderListResponse>(
    response,
    `list folders ${parentId ?? 'root'}`
  );
  return body.folders ?? [];
}

async function findFolderByName(
  page: Page,
  folderName: string,
  parentId?: string
): Promise<FolderDto> {
  const folders = await listFolders(page, parentId);
  const folder = folders.find((item) => item.name === folderName);
  expect(folder, `Folder "${folderName}" should exist`).toBeTruthy();
  return folder!;
}

async function createFolder(
  page: Page,
  name: string,
  parentId: string,
  companyId: number
): Promise<FolderDto> {
  const response = await page.request.post('/api/webhard/folders', {
    data: { name, parentId, companyId },
    timeout: 60000,
  });

  return expectJsonResponse<FolderDto>(response, `create folder ${name}`);
}

async function uploadGoogleDriveFile(
  page: Page,
  folderId: string,
  fileName: string,
  content: string
): Promise<FileDto> {
  const uploadInitResponse = await page.request.post('/api/webhard/upload/batch', {
    data: {
      folderId,
      files: [{ fileName, fileSize: Buffer.byteLength(content), contentType: 'text/plain' }],
    },
    timeout: 60000,
  });
  const uploadInit = await expectJsonResponse<BatchUploadResponse>(
    uploadInitResponse,
    `init upload ${fileName}`
  );
  const uploadTarget = uploadInit.data?.files?.[0];
  expect(uploadTarget?.storageProvider, 'Upload target should use Google Drive').toBe(
    'google_drive'
  );
  expect(uploadTarget?.presignedUrl, 'Upload target should include proxy URL').toBeTruthy();
  expect(uploadTarget?.objectKey, 'Upload target should include object key').toBeTruthy();
  expect(uploadTarget?.driveFileId, 'Upload target should reserve Drive file id').toBeTruthy();

  const csrfToken = crypto.randomBytes(24).toString('hex');
  const uploadProxyUrl = new URL(uploadTarget!.presignedUrl!);
  await page.context().addCookies([
    {
      name: 'csrf-token',
      value: csrfToken,
      domain: uploadProxyUrl.hostname,
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 60 * 10,
      httpOnly: false,
      secure: uploadProxyUrl.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
  const putResponse = await page.request.put(uploadTarget!.presignedUrl!, {
    headers: {
      ...(uploadTarget!.uploadHeaders ?? {}),
      'X-CSRF-Token': csrfToken,
    },
    data: Buffer.from(content, 'utf8'),
    timeout: 120000,
  });
  expect(putResponse.ok(), `Drive upload failed with status ${putResponse.status()}`).toBe(true);

  const completeResponse = await page.request.post('/api/webhard/upload/batch-complete', {
    data: {
      files: [
        {
          fileName,
          originalName: fileName,
          fileSize: Buffer.byteLength(content),
          folderId,
          objectKey: uploadTarget!.objectKey,
          publicUrl: uploadTarget!.publicUrl,
          mimeType: 'text/plain',
          storageProvider: uploadTarget!.storageProvider,
          driveFileId: uploadTarget!.driveFileId,
        },
      ],
    },
    timeout: 60000,
  });
  await expectJsonResponse(completeResponse, `complete upload ${fileName}`);

  await expect
    .poll(
      async () => {
        const files = await listFiles(page, folderId);
        return files.find((file) => file.name === fileName) ?? null;
      },
      { timeout: 60000 }
    )
    .not.toBeNull();

  const files = await listFiles(page, folderId);
  const file = files.find((item) => item.name === fileName);
  expect(file, `Uploaded file "${fileName}" should exist`).toBeTruthy();
  expect(file!.storage_provider).toBe('google_drive');
  return file!;
}

async function listFiles(page: Page, folderId: string): Promise<FileDto[]> {
  const params = new URLSearchParams({
    folderId,
    page: '1',
    limit: '100',
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const response = await page.request.get(`/api/webhard/files?${params.toString()}`, {
    timeout: 60000,
  });
  const body = await expectJsonResponse<FileListResponse>(response, `list files ${folderId}`);
  return body.files ?? [];
}

async function runDiagnostics(
  request: APIRequestContext,
  verifyDriveApi: boolean
): Promise<ConsistencyDiagnostics> {
  const params = new URLSearchParams();
  if (verifyDriveApi) {
    params.set('verifyDriveApi', 'true');
    params.set('verifyDriveApiLimit', '50');
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await request.get(`${apiBaseUrl}/api/v1/storage/webhard-consistency${suffix}`, {
    headers: { 'X-API-Key': requireApiKey() },
    timeout: 180000,
  });

  return expectJsonResponse<ConsistencyDiagnostics>(response, 'storage consistency diagnostics');
}

async function expectNoConsistencyDrift(
  request: APIRequestContext,
  verifyDriveApi = false
): Promise<void> {
  const diagnostics = await runDiagnostics(request, verifyDriveApi);
  expect(diagnostics.missingDriveIds.folders.count).toBe(0);
  expect(diagnostics.missingDriveIds.files.count).toBe(0);
  expect(diagnostics.duplicateActiveCompanyRoots.companyCount).toBe(0);
  expect(diagnostics.driveApi404.missingFolders.count).toBe(0);
  expect(diagnostics.driveApi404.missingFiles.count).toBe(0);
}

test.describe('Google Drive 웹하드 사용자 QA 자동화', () => {
  test.use({ storageState: adminAuthFile });

  test('남은 사용자 QA 항목을 Chromium E2E로 검증한다', async ({
    browser,
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(600000);
    expect(baseURL, 'Playwright baseURL is required').toBeTruthy();
    expect(
      process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID,
      'GOOGLE_DRIVE_SHARED_DRIVE_ID is required'
    ).toBeTruthy();

    const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const companyA = await createCompany(request, `A-${suffix}`);
    const companyB = await createCompany(request, `B-${suffix}`);

    const approveA = await approveCompany(request, companyA.id);
    const approveB = await approveCompany(request, companyB.id);
    expect(approveA.driveProvisioning?.status?.toLowerCase()).toBe('ready');
    expect(approveB.driveProvisioning?.status?.toLowerCase()).toBe('ready');

    const readyCompanyA = await waitForCompanyDriveReady(request, companyA.id);
    const readyCompanyB = await waitForCompanyDriveReady(request, companyB.id);
    expect(readyCompanyA.webhard_access).toBe(true);
    expect(readyCompanyB.webhard_access).toBe(true);

    await expectNoConsistencyDrift(request);

    await page.goto('/webhard', { waitUntil: 'domcontentloaded' });
    await waitForWebhardReady(page);
    await expect(page.getByText(companyA.company_name, { exact: true }).first()).toBeVisible({
      timeout: 60000,
    });
    await expect(page.getByText(companyB.company_name, { exact: true }).first()).toBeVisible({
      timeout: 60000,
    });

    const rootA = await findFolderByName(page, companyA.company_name);
    const rootB = await findFolderByName(page, companyB.company_name);
    expect(rootA.company_id).toBe(companyA.id);
    expect(rootB.company_id).toBe(companyB.id);
    const rootAChildren = await listFolders(page, rootA.id);
    expect(rootAChildren.map((folder) => folder.name)).toEqual(
      expect.arrayContaining(['목형의뢰', '칼선의뢰', '문의'])
    );

    const companyAContext = await createCompanyContext(browser, baseURL!, companyA.id);
    const companyBContext = await createCompanyContext(browser, baseURL!, companyB.id);
    const companyAPage = await companyAContext.newPage();
    const companyBPage = await companyBContext.newPage();

    try {
      await companyAPage.goto('/webhard', { waitUntil: 'domcontentloaded' });
      await waitForWebhardReady(companyAPage);
      await expect(
        companyAPage.getByText(companyA.company_name, { exact: true }).first()
      ).toBeVisible({
        timeout: 60000,
      });
      await expect(companyAPage.getByText(companyB.company_name, { exact: true })).toHaveCount(0);
      await expect(companyAPage.getByRole('button', { name: '폴더 업로드' })).toHaveCount(0);

      const companyAFolders = await listFolders(companyAPage);
      expect(companyAFolders.some((folder) => folder.company_id === companyB.id)).toBe(false);

      await companyBPage.goto('/webhard', { waitUntil: 'domcontentloaded' });
      await waitForWebhardReady(companyBPage);
      await expect(
        companyBPage.getByText(companyB.company_name, { exact: true }).first()
      ).toBeVisible({
        timeout: 60000,
      });
      await expect(companyBPage.getByText(companyA.company_name, { exact: true })).toHaveCount(0);
      const companyBFolders = await listFolders(companyBPage);
      expect(companyBFolders.some((folder) => folder.company_id === companyA.id)).toBe(false);

      const companyCreateFolderResponse = await companyAPage.request.post('/api/webhard/folders', {
        data: {
          name: `company-forbidden-${suffix}`,
          parentId: rootA.id,
          companyId: companyA.id,
        },
      });
      expect(companyCreateFolderResponse.status()).toBe(403);

      const sourceFolder = await createFolder(page, `source-${suffix}`, rootA.id, companyA.id);
      const targetFolder = await createFolder(page, `target-${suffix}`, rootA.id, companyA.id);
      await expectNoConsistencyDrift(request);

      const renamedSourceName = `source-renamed-${suffix}`;
      const folderRenameResponse = await page.request.patch(
        `/api/webhard/folders/${sourceFolder.id}/rename`,
        { data: { name: renamedSourceName }, timeout: 60000 }
      );
      const renamedSource = await expectJsonResponse<FolderDto>(
        folderRenameResponse,
        'rename folder'
      );
      expect(renamedSource.name).toBe(renamedSourceName);

      const folderMoveResponse = await page.request.patch(
        `/api/webhard/folders/${sourceFolder.id}/move`,
        { data: { parentId: targetFolder.id }, timeout: 60000 }
      );
      await expectJsonResponse<FolderDto>(folderMoveResponse, 'move folder');
      const targetChildren = await listFolders(page, targetFolder.id);
      expect(targetChildren.some((folder) => folder.id === sourceFolder.id)).toBe(true);

      const uploadedFile = await uploadGoogleDriveFile(
        page,
        sourceFolder.id,
        `qa-upload-${suffix}.txt`,
        `google drive qa ${suffix}`
      );
      await expectNoConsistencyDrift(request);

      const directApiDownload = await apiKeyOnlyFetch(
        `${apiBaseUrl}/api/v1/files/${uploadedFile.id}/download`
      );
      expect(directApiDownload.status).toBe(403);
      const directApiStreamDownload = await apiKeyOnlyFetch(
        `${apiBaseUrl}/api/v1/files/${uploadedFile.id}/download/stream`
      );
      expect(directApiStreamDownload.status).toBe(403);

      await companyAPage.goto(`/webhard?folderId=${encodeURIComponent(sourceFolder.id)}`, {
        waitUntil: 'domcontentloaded',
      });
      await waitForWebhardReady(companyAPage);
      await expect(companyAPage.getByText(uploadedFile.name, { exact: true }).first()).toBeVisible({
        timeout: 60000,
      });

      const adminDownload = await page.request.get(
        `/api/webhard/files/${uploadedFile.id}/download`
      );
      await expectJsonResponse(adminDownload, 'admin download URL');
      const companyDownload = await companyAPage.request.get(
        `/api/webhard/files/${uploadedFile.id}/download`
      );
      await expectJsonResponse(companyDownload, 'company download URL');
      const forbiddenDownload = await companyBPage.request.get(
        `/api/webhard/files/${uploadedFile.id}/download`
      );
      expect([403, 404]).toContain(forbiddenDownload.status());

      const companyRenamedName = `company-renamed-${suffix}.txt`;
      const companyRenameResponse = await companyAPage.request.patch(
        `/api/webhard/files/${uploadedFile.id}/rename`,
        { data: { name: companyRenamedName }, timeout: 60000 }
      );
      const companyRenamedFile = await expectJsonResponse<FileDto>(
        companyRenameResponse,
        'company rename file'
      );
      expect(companyRenamedFile.name).toBe(companyRenamedName);

      const fileMoveResponse = await companyAPage.request.patch(
        `/api/webhard/files/${uploadedFile.id}/move`,
        { data: { folderId: targetFolder.id }, timeout: 60000 }
      );
      const movedFile = await expectJsonResponse<FileDto>(fileMoveResponse, 'company move file');
      expect(movedFile.folder_id).toBe(targetFolder.id);

      const targetFiles = await listFiles(page, targetFolder.id);
      const currentFile = targetFiles.find((file) => file.id === uploadedFile.id);
      expect(currentFile?.name).toBe(companyRenamedName);

      const searchA = await companyAPage.request.get(
        `/api/webhard/search?q=${encodeURIComponent(companyRenamedName)}&limit=20`
      );
      const searchABody = await expectJsonResponse<SearchResponse>(searchA, 'company A search');
      expect(searchABody.files?.some((file) => file.id === uploadedFile.id)).toBe(true);

      const searchB = await companyBPage.request.get(
        `/api/webhard/search?q=${encodeURIComponent(companyRenamedName)}&limit=20`
      );
      const searchBBody = await expectJsonResponse<SearchResponse>(searchB, 'company B search');
      expect(searchBBody.files?.some((file) => file.id === uploadedFile.id)).toBe(false);

      const newFilesBefore = await companyAPage.request.get('/api/webhard/files/new?limit=100');
      const newFilesBeforeBody = await expectJsonResponse<FileListResponse>(
        newFilesBefore,
        'company new files before mark'
      );
      expect(newFilesBeforeBody.files?.some((file) => file.id === uploadedFile.id)).toBe(true);

      const markDownloadedResponse = await companyAPage.request.post(
        '/api/webhard/files/mark-downloaded',
        {
          data: { fileIds: [uploadedFile.id] },
          timeout: 60000,
        }
      );
      await expectJsonResponse(markDownloadedResponse, 'mark downloaded');

      const newFilesAfter = await companyAPage.request.get('/api/webhard/files/new?limit=100');
      const newFilesAfterBody = await expectJsonResponse<FileListResponse>(
        newFilesAfter,
        'company new files after mark'
      );
      expect(newFilesAfterBody.files?.some((file) => file.id === uploadedFile.id)).toBe(false);

      const directApiShareList = await apiKeyOnlyFetch(`${apiBaseUrl}/api/v1/share-links`);
      expect(directApiShareList.status).toBe(403);
      const directApiShareCreate = await apiKeyOnlyFetch(`${apiBaseUrl}/api/v1/share-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: `blocked-${suffix}`,
          filePath: currentFile!.path,
          fileName: companyRenamedName,
          companyId: companyA.id,
          createdBy: 0,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      });
      expect(directApiShareCreate.status).toBe(403);

      const directCompanyShareCreate = await fetch(`${apiBaseUrl}/api/v1/share-links`, {
        method: 'POST',
        headers: {
          ...createCompanySessionHeaders(companyB.id),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: `forged-${suffix}`,
          webhardFileId: uploadedFile.id,
          filePath: currentFile!.path,
          fileName: companyRenamedName,
          companyId: companyB.id,
          createdBy: companyB.id,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          maxDownloads: 1,
        }),
      });
      expect(directCompanyShareCreate.status).toBe(403);

      const shareCreateResponse = await page.request.post('/api/webhard/share', {
        data: {
          file_path: currentFile!.path,
          file_name: companyRenamedName,
          company_id: companyA.id,
          expires_in_hours: 1,
          max_downloads: 2,
        },
        timeout: 60000,
      });
      const shareLink = await expectJsonResponse<{ token: string }>(
        shareCreateResponse,
        'create share link'
      );
      expect(shareLink.token).toBeTruthy();

      const shareDownload = await page.request.get(`/api/webhard/share/${shareLink.token}`, {
        timeout: 120000,
      });
      expect(shareDownload.ok(), `share download failed with ${shareDownload.status()}`).toBe(true);

      const spoofedCompanyShareCreate = await companyAPage.request.post('/api/webhard/share', {
        data: {
          file_path: currentFile!.path,
          file_name: companyRenamedName,
          company_id: companyB.id,
          expires_in_hours: 1,
          max_downloads: 1,
        },
      });
      const spoofedCompanyShareLink = await expectJsonResponse<{ token: string }>(
        spoofedCompanyShareCreate,
        'company spoofed share link'
      );
      const companyAShareListResponse = await companyAPage.request.get('/api/webhard/share');
      const companyAShareList = await expectJsonResponse<ShareLinkListItem[]>(
        companyAShareListResponse,
        'company A share list'
      );
      expect(companyAShareList.some((link) => link.token === spoofedCompanyShareLink.token)).toBe(
        true
      );
      expect(
        companyAShareList.find((link) => link.token === spoofedCompanyShareLink.token)?.company_id
      ).toBe(companyA.id);
      const companyBShareListResponse = await companyBPage.request.get('/api/webhard/share');
      const companyBShareList = await expectJsonResponse<ShareLinkListItem[]>(
        companyBShareListResponse,
        'company B share list'
      );
      expect(companyBShareList.some((link) => link.token === spoofedCompanyShareLink.token)).toBe(
        false
      );

      const forbiddenShareCreate = await companyBPage.request.post('/api/webhard/share', {
        data: {
          file_path: currentFile!.path,
          file_name: companyRenamedName,
          company_id: companyA.id,
          expires_in_hours: 1,
          max_downloads: 1,
        },
      });
      expect([403, 404]).toContain(forbiddenShareCreate.status());

      const zipResponse = await page.request.post('/api/webhard/files/batch/download-zip', {
        data: { fileIds: [uploadedFile.id] },
        timeout: 120000,
      });
      expect(zipResponse.ok(), `zip download failed with ${zipResponse.status()}`).toBe(true);
      expect(zipResponse.headers()['content-type']).toContain('application/zip');
      const zipBody = await zipResponse.body();
      expect(zipBody.subarray(0, 2).toString('utf8')).toBe('PK');
      expect(zipBody.toString('utf8')).toContain(companyRenamedName);

      const deleteResponse = await page.request.delete(
        `/api/webhard/files/${uploadedFile.id}/delete`,
        {
          timeout: 60000,
        }
      );
      await expectJsonResponse(deleteResponse, 'delete file');
      const trashResponse = await page.request.get('/api/webhard/trash?limit=100');
      const trashBody = await expectJsonResponse<TrashResponse>(trashResponse, 'trash listing');
      expect(trashBody.files?.some((file) => file.id === uploadedFile.id)).toBe(true);

      const restoreResponse = await page.request.post(
        `/api/webhard/trash/${uploadedFile.id}/restore`,
        {
          timeout: 60000,
        }
      );
      await expectJsonResponse(restoreResponse, 'restore file');
      const filesAfterRestore = await listFiles(page, targetFolder.id);
      expect(filesAfterRestore.some((file) => file.id === uploadedFile.id)).toBe(true);

      const rootDeleteResponse = await page.request.delete(
        `/api/webhard/folders/${rootA.id}/delete`
      );
      expect(rootDeleteResponse.status()).toBe(400);
      const rootDeleteBody = (await rootDeleteResponse.json()) as {
        code?: string;
        redirectTo?: string;
        folderName?: string;
        companyName?: string;
      };
      expect(rootDeleteBody.code).toBe('COMPANY_ROOT_FOLDER_DELETE_BLOCKED');
      expect(rootDeleteBody.redirectTo).toBe(`/admin/companies/${companyA.id}`);
      expect(rootDeleteBody.folderName).toBe(companyA.company_name);

      const deleteCompanyResponse = await request.delete(
        `${apiBaseUrl}/api/v1/companies/${companyA.id}`,
        {
          headers: createAdminSessionHeaders(),
          timeout: 120000,
        }
      );
      const deletedCompany = await expectJsonResponse<{
        company?: CompanyResponse;
        foldersDeleted?: number;
      }>(deleteCompanyResponse, 'delete company');
      expect(deletedCompany.company?.status).toBe('deleted');
      expect((deletedCompany.foldersDeleted ?? 0) > 0).toBe(true);

      const blockedCompanyContext = await createCompanyContext(browser, baseURL!, companyA.id);
      const blockedCompanyPage = await blockedCompanyContext.newPage();
      await blockedCompanyPage.goto('/webhard', { waitUntil: 'domcontentloaded' });
      await expect(
        blockedCompanyPage.getByRole('heading', { name: '웹하드 접근이 제한되었습니다' })
      ).toBeVisible({ timeout: 60000 });
      await blockedCompanyContext.close();

      const restoreCompanyResponse = await request.post(
        `${apiBaseUrl}/api/v1/companies/${companyA.id}/restore`,
        {
          headers: createAdminSessionHeaders(),
          timeout: 120000,
        }
      );
      const restoredCompany = await expectJsonResponse<{ company?: CompanyResponse }>(
        restoreCompanyResponse,
        'restore company'
      );
      expect(restoredCompany.company?.status).not.toBe('deleted');
      expect(restoredCompany.company?.webhard_access).toBe(true);

      await page.goto(`/webhard?folderId=${encodeURIComponent(rootA.id)}`, {
        waitUntil: 'domcontentloaded',
      });
      await waitForWebhardReady(page);
      await expect(page.getByText(targetFolder.name, { exact: true }).first()).toBeVisible({
        timeout: 60000,
      });

      await expectNoConsistencyDrift(request, true);
    } finally {
      await companyAContext.close();
      await companyBContext.close();
    }
  });
});
