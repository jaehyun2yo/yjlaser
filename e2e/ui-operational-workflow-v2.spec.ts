import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const apiBaseUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const allowRemoteOperationalE2E = process.env.ALLOW_REMOTE_OPERATIONAL_E2E === 'true';
const DEFAULT_SESSION_SECRET_SENTINEL = 'change-this-in-production';
const DEV_ONLY_SESSION_SECRET = 'change-this-in-production-dev-only';
const E2E_SESSION_MAX_AGE_SECONDS = 60 * 60 * 4;
const authFile = path.join(__dirname, '..', '.auth', 'user.json');
const PRODUCTION_RESOURCE_PATTERNS = [
  'ibsbcuumkdhwesrpaqeb',
  'webhard-api-production',
  'yjlaser.net',
  'vercel.app',
  'production',
];

type CompanyOption = {
  id: number;
  company_name: string;
};

type CreatedApiKey = {
  id: string;
  key: string;
};

type ContactRecord = {
  id: string;
  status?: string | null;
  company_id?: number | null;
  companyId?: number | null;
  company_name?: string | null;
  companyName?: string | null;
  inquiry_number?: string | null;
  inquiryNumber?: string | null;
  work_number?: string | null;
  workNumber?: string | null;
  process_stage?: string | null;
  processStage?: string | null;
  original_filename?: string | null;
  originalFilename?: string | null;
};

type FolderRecord = {
  id: string;
  name: string;
  parent_id: string | null;
  company_id: number | null;
};

type FileRecord = {
  id: string;
  folder_id: string | null;
  company_id: number | null;
};

function requireValue<T>(value: T | null | undefined, description: string): T {
  expect(value, description).toBeTruthy();
  if (value === null || value === undefined) {
    throw new Error(description);
  }
  return value;
}

function requireMigrationApiKey(): string {
  const key = process.env.MIGRATION_API_KEY || '';
  expect(key, 'MIGRATION_API_KEY is required for server-side dashboard E2E').not.toBe('');
  return key;
}

function isLoopbackUrl(url: string): boolean {
  const { hostname } = new URL(url);
  return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(hostname);
}

function isProductionLikeUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return PRODUCTION_RESOURCE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function extractSupabaseRefs(value: string): string[] {
  const refs = new Set<string>();
  const patterns = [
    /https?:\/\/([a-z0-9]{20})\.supabase\.co/gi,
    /(?:^|[.@:/])([a-z0-9]{20})\.supabase\.co/gi,
    /(?:^|[.@:/])db\.([a-z0-9]{20})\.supabase\.co/gi,
    /postgres(?:ql)?:\/\/[^:@/\s]*[.:]([a-z0-9]{20})(?=[:@])/gi,
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      refs.add(match[1].toLowerCase());
    }
  }
  return [...refs];
}

function assertLocalOperationalE2ERuntime(): void {
  const strictRuntime =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  expect(strictRuntime, 'ODATA2 operational E2E must not run in production-like runtime').toBe(
    false
  );
  expect(
    isProductionLikeUrl(apiBaseUrl) || isProductionLikeUrl(appBaseUrl),
    `ODATA2 operational E2E must not target production API/Web URLs. api=${apiBaseUrl}, app=${appBaseUrl}`
  ).toBe(false);

  const hasNonLoopbackRuntimeUrl = !isLoopbackUrl(apiBaseUrl) || !isLoopbackUrl(appBaseUrl);
  if (allowRemoteOperationalE2E) {
    if (hasNonLoopbackRuntimeUrl) {
      expect(
        process.env.OPERATIONAL_E2E_EXPECTED_SUPABASE_REF || '',
        'Remote operational E2E requires OPERATIONAL_E2E_EXPECTED_SUPABASE_REF'
      ).not.toBe('');
      const expectedRef = process.env.OPERATIONAL_E2E_EXPECTED_SUPABASE_REF?.trim() ?? '';
      expect(
        /^[a-z0-9]{20}$/.test(expectedRef),
        'OPERATIONAL_E2E_EXPECTED_SUPABASE_REF must be a 20-character Supabase ref'
      ).toBe(true);
      const runtimeRefs = [apiBaseUrl, appBaseUrl].flatMap(extractSupabaseRefs);
      expect(
        runtimeRefs.every((ref) => ref === expectedRef),
        'Remote operational E2E API/Web Supabase refs must match OPERATIONAL_E2E_EXPECTED_SUPABASE_REF'
      ).toBe(true);
    }
  }

  if (!allowRemoteOperationalE2E) {
    expect(
      !hasNonLoopbackRuntimeUrl,
      `ODATA2 operational E2E mutates test data and is local-only by default. api=${apiBaseUrl}, app=${appBaseUrl}`
    ).toBe(true);
  }

  const missingMocks = [
    'OPERATIONAL_E2E_MOCK_LGUPLUS',
    'OPERATIONAL_E2E_MOCK_POPBILL',
    'OPERATIONAL_E2E_MOCK_STORAGE',
  ].filter((name) => process.env[name] !== 'true');
  expect(missingMocks, 'ODATA2 operational E2E requires external boundary mock flags').toEqual([]);

  const externalCredentialNames = Object.keys(process.env).filter(
    (name) =>
      process.env[name] &&
      /^(POPBILL|LGUPLUS|GOOGLE_DRIVE|GOOGLE_APPLICATION_CREDENTIALS|R2_|AWS_)/i.test(name)
  );
  expect(
    externalCredentialNames,
    'ODATA2 operational E2E refuses external service credential env vars'
  ).toEqual([]);

  const dbEntries = ['DATABASE_URL', 'DIRECT_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']
    .map((name) => [name, process.env[name]] as const)
    .filter(([, value]) => Boolean(value));
  const dbRefs = dbEntries.flatMap(([name, value]) =>
    extractSupabaseRefs(String(value)).map((ref) => ({ name, ref }))
  );
  expect(
    dbEntries.some(([, value]) => String(value).toLowerCase().includes('supabase')) &&
      dbRefs.length === 0,
    'Supabase DB URL must contain a parseable project ref'
  ).toBe(false);
  if (dbRefs.length > 0) {
    const expectedRef = process.env.OPERATIONAL_E2E_EXPECTED_SUPABASE_REF?.trim() ?? '';
    expect(
      /^[a-z0-9]{20}$/.test(expectedRef),
      'Supabase DB URL requires OPERATIONAL_E2E_EXPECTED_SUPABASE_REF'
    ).toBe(true);
    expect(
      dbRefs.every((entry) => entry.ref === expectedRef),
      'Operational E2E DB Supabase refs must match OPERATIONAL_E2E_EXPECTED_SUPABASE_REF'
    ).toBe(true);
  }
}

async function expectApiOk(response: APIResponse, description: string): Promise<void> {
  expect(response.ok(), `${description} failed with status ${response.status()}`).toBe(true);
}

async function cleanupRequest(
  cleanupErrors: string[],
  description: string,
  requestFn: () => Promise<APIResponse>
): Promise<void> {
  try {
    const response = await requestFn();
    if (!response.ok() && response.status() !== 404) {
      cleanupErrors.push(`${description}: status ${response.status()}`);
    }
  } catch (error) {
    cleanupErrors.push(`${description}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getE2ESessionSecret(): string {
  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret && sessionSecret !== DEFAULT_SESSION_SECRET_SENTINEL) {
    return sessionSecret;
  }

  const strictRuntime =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  expect(strictRuntime, 'SESSION_SECRET is required in production-like E2E runtime').toBe(false);
  return DEV_ONLY_SESSION_SECRET;
}

function signSessionData(tokenAndData: string, sessionSecret: string): string {
  return crypto.createHmac('sha256', sessionSecret).update(tokenAndData).digest('hex');
}

function createBrowserSessionCookieValue(
  userType: 'admin' | 'company',
  userId: string | number
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const sessionData = JSON.stringify({
    kind: 'browser',
    userType,
    userId,
    iat: nowSeconds,
    exp: nowSeconds + E2E_SESSION_MAX_AGE_SECONDS,
  });
  const token = crypto.randomBytes(32).toString('hex');
  const tokenAndData = `${token}:${sessionData}`;
  const signature = signSessionData(tokenAndData, getE2ESessionSecret());

  return `${encodeURIComponent(tokenAndData)}.${signature}`;
}

function sessionCookieHeader(userType: 'admin' | 'company', userId: string | number): string {
  const cookieName = userType === 'company' ? 'company-session' : 'admin-session';
  return `${cookieName}=${createBrowserSessionCookieValue(userType, userId)}`;
}

function storedAdminCookieHeader(): string {
  const state = JSON.parse(fs.readFileSync(authFile, 'utf8')) as {
    cookies?: Array<{ name: string; value: string }>;
  };
  const adminCookie = state.cookies?.find((cookie) => cookie.name === 'admin-session');
  return `${requireValue(adminCookie?.name, 'Stored admin cookie name is required')}=${requireValue(
    adminCookie?.value,
    'Stored admin cookie value is required'
  )}`;
}

function adminHeaders(): Record<string, string> {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  return {
    Cookie: `${storedAdminCookieHeader()}; csrf-token=${csrfToken}`,
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json',
  };
}

function integrationHeaders(apiKey: string): Record<string, string> {
  return {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
}

async function createIntegrationApiKey(
  request: APIRequestContext,
  programType: string,
  suffix: string
): Promise<CreatedApiKey> {
  const response = await request.post(`${apiBaseUrl}/api/v1/integration/api-keys`, {
    headers: adminHeaders(),
    data: {
      name: `odata2-007-${programType}-${suffix}`,
      programType,
    },
  });
  await expectApiOk(response, `create ${programType} API key`);
  return (await response.json()) as CreatedApiKey;
}

async function getActiveCompany(request: APIRequestContext): Promise<CompanyOption> {
  const response = await request.get(`${apiBaseUrl}/api/v1/companies/names`, {
    headers: { 'X-API-Key': requireMigrationApiKey() },
  });
  await expectApiOk(response, 'company names lookup');
  const companies = (await response.json()) as CompanyOption[];
  expect(companies.length, 'At least one active company is required').toBeGreaterThan(0);
  return companies[0];
}

async function createContact(
  request: APIRequestContext,
  data: Record<string, unknown>
): Promise<ContactRecord> {
  const response = await request.post(`${apiBaseUrl}/api/v1/contacts`, {
    headers: { 'X-API-Key': requireMigrationApiKey() },
    data: {
      name: 'ODATA2 E2E 담당자',
      email: `odata2-${Date.now()}@example.com`,
      phone: '010-0000-0000',
      message: 'ODATA2 운영 워크프로세스 E2E fixture',
      ...data,
    },
  });
  await expectApiOk(response, 'contact create');
  return (await response.json()) as ContactRecord;
}

async function updateStage(
  request: APIRequestContext,
  apiKey: string,
  contactId: string,
  processStage: string,
  actorName: string
): Promise<Record<string, unknown>> {
  const response = await request.patch(
    `${apiBaseUrl}/api/v1/integration/contacts/${contactId}/process-stage`,
    {
      headers: integrationHeaders(apiKey),
      data: { processStage, actorName },
    }
  );
  await expectApiOk(response, `process-stage ${processStage}`);
  return (await response.json()) as Record<string, unknown>;
}

async function updateStageAsAdmin(
  request: APIRequestContext,
  contactId: string,
  processStage: string
): Promise<Record<string, unknown>> {
  const response = await request.patch(`${apiBaseUrl}/api/v1/contacts/${contactId}/process-stage`, {
    headers: adminHeaders(),
    data: { processStage },
  });
  await expectApiOk(response, `admin process-stage ${processStage}`);
  return (await response.json()) as Record<string, unknown>;
}

async function getContact(
  request: APIRequestContext,
  apiKey: string,
  contactId: string
): Promise<ContactRecord> {
  const response = await request.get(`${apiBaseUrl}/api/v1/contacts/${contactId}`, {
    headers: integrationHeaders(apiKey),
  });
  await expectApiOk(response, `contact ${contactId} lookup`);
  return (await response.json()) as ContactRecord;
}

async function findDuplicateContactId(
  request: APIRequestContext,
  apiKey: string,
  companyName: string,
  originalFilename: string
): Promise<string | null> {
  const response = await request.post(`${apiBaseUrl}/api/v1/contacts/find-duplicate`, {
    headers: integrationHeaders(apiKey),
    data: { companyName, originalFilename },
  });
  await expectApiOk(response, 'duplicate contact lookup');
  const body = (await response.json()) as { exists: boolean; contactId: string | null };
  return body.exists ? body.contactId : null;
}

async function pollContactByDuplicate(
  request: APIRequestContext,
  apiKey: string,
  companyName: string,
  originalFilename: string
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const contactId = await findDuplicateContactId(request, apiKey, companyName, originalFilename);
    if (contactId) return contactId;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for auto contact: ${companyName} / ${originalFilename}`);
}

async function getContactByNumber(
  request: APIRequestContext,
  apiKey: string,
  numberType: 'inquiry' | 'work',
  number: string
): Promise<ContactRecord> {
  const queryName = numberType === 'inquiry' ? 'inquiryNumber' : 'workNumber';
  const path = numberType === 'inquiry' ? 'by-inquiry-number' : 'by-work-number';
  const response = await request.get(
    `${apiBaseUrl}/api/v1/contacts/${path}?${queryName}=${encodeURIComponent(number)}`,
    { headers: integrationHeaders(apiKey) }
  );
  await expectApiOk(response, `${numberType} number lookup`);
  const body = (await response.json()) as { contact: ContactRecord };
  return body.contact;
}

async function expectCompanyDashboardContains(
  request: APIRequestContext,
  companyId: number,
  contactId: string
): Promise<void> {
  const response = await request.get(`${appBaseUrl}/api/company/dashboard?type=contacts`, {
    headers: { Cookie: sessionCookieHeader('company', companyId) },
  });
  await expectApiOk(response, 'company dashboard contacts lookup');
  const body = (await response.json()) as { contacts?: ContactRecord[] };
  const ids = (body.contacts ?? []).map((contact) => contact.id);
  expect(ids).toContain(contactId);
}

async function startDelivery(request: APIRequestContext, contactId: string): Promise<void> {
  const response = await request.post(`${apiBaseUrl}/api/v1/contacts/batch-start-delivery`, {
    headers: adminHeaders(),
    data: {
      contactIds: [contactId],
      actorType: 'admin',
      actorName: 'ODATA2 E2E admin',
    },
  });
  await expectApiOk(response, 'batch start delivery');
  const body = (await response.json()) as {
    results?: Array<{ contactId: string; success: boolean; error?: string }>;
  };
  expect(body.results).toContainEqual({ contactId, success: true });
}

async function findOrCreateFolder(
  request: APIRequestContext,
  name: string,
  parentId?: string,
  companyId?: number | null
): Promise<{ folder: FolderRecord; created: boolean }> {
  const params = parentId ? `?parentId=${encodeURIComponent(parentId)}` : '';
  const listResponse = await request.get(`${apiBaseUrl}/api/v1/folders${params}`, {
    headers: adminHeaders(),
  });
  await expectApiOk(listResponse, `folder list ${name}`);
  const listBody = (await listResponse.json()) as { folders: FolderRecord[] };
  const existing = listBody.folders.find((folder) => folder.name === name);
  if (existing) return { folder: existing, created: false };

  const createResponse = await request.post(`${apiBaseUrl}/api/v1/folders`, {
    headers: adminHeaders(),
    data: {
      name,
      ...(parentId ? { parentId } : {}),
      ...(companyId !== undefined ? { companyId } : {}),
    },
  });
  await expectApiOk(createResponse, `folder create ${name}`);
  return { folder: (await createResponse.json()) as FolderRecord, created: true };
}

async function confirmR2ExternalUpload(
  request: APIRequestContext,
  externalApiKey: string,
  folderId: string,
  filename: string
): Promise<FileRecord> {
  const response = await request.post(`${apiBaseUrl}/api/v1/files/confirm`, {
    headers: integrationHeaders(externalApiKey),
    data: {
      key: `odata2/e2e/${Date.now()}-${filename}`,
      name: filename,
      originalName: filename,
      size: 128,
      mimeType: 'application/dxf',
      folderId,
    },
  });
  await expectApiOk(response, `external R2 upload confirm ${filename}`);
  return (await response.json()) as FileRecord;
}

test.describe.serial('ODATA2-007 운영 워크프로세스 E2E', () => {
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const externalCompanyName = `ODATA2-외부업체-${suffix}`;
  const createdApiKeys: CreatedApiKey[] = [];
  const contactIds: string[] = [];
  const fileIds: string[] = [];
  const createdFolderIds: string[] = [];
  let folderAliasId: number | null = null;
  let managementKey: CreatedApiKey;
  let nestingKey: CreatedApiKey;
  let externalSyncKey: CreatedApiKey;
  let targetCompany: CompanyOption;

  test.beforeAll(async ({ request }) => {
    assertLocalOperationalE2ERuntime();
    requireMigrationApiKey();
    targetCompany = await getActiveCompany(request);
    managementKey = await createIntegrationApiKey(request, 'management_program', suffix);
    nestingKey = await createIntegrationApiKey(request, 'nesting_program', suffix);
    externalSyncKey = await createIntegrationApiKey(request, 'external_webhard_sync', suffix);
    createdApiKeys.push(managementKey, nestingKey, externalSyncKey);
  });

  test.afterAll(async ({ request }) => {
    const cleanupErrors: string[] = [];

    for (const fileId of [...fileIds].reverse()) {
      await cleanupRequest(cleanupErrors, `delete file ${fileId}`, () =>
        request.delete(`${apiBaseUrl}/api/v1/files/${fileId}`, {
          headers: adminHeaders(),
        })
      );
    }

    for (const contactId of [...contactIds].reverse()) {
      await cleanupRequest(cleanupErrors, `delete contact ${contactId}`, () =>
        request.delete(`${apiBaseUrl}/api/v1/contacts/${contactId}`, {
          headers: adminHeaders(),
          data: { permanent: true },
        })
      );
    }

    if (folderAliasId !== null) {
      await cleanupRequest(cleanupErrors, `delete folder alias ${folderAliasId}`, () =>
        request.delete(`${apiBaseUrl}/api/v1/companies/folder-aliases/${folderAliasId}`, {
          headers: adminHeaders(),
        })
      );
    }

    for (const folderId of [...createdFolderIds].reverse()) {
      await cleanupRequest(cleanupErrors, `delete folder ${folderId}`, () =>
        request.delete(`${apiBaseUrl}/api/v1/folders/${folderId}`, {
          headers: adminHeaders(),
        })
      );
    }

    for (const apiKey of [...createdApiKeys].reverse()) {
      await cleanupRequest(cleanupErrors, `delete api key ${apiKey.id}`, () =>
        request.delete(`${apiBaseUrl}/api/v1/integration/api-keys/${apiKey.id}`, {
          headers: adminHeaders(),
        })
      );
    }

    expect(cleanupErrors, cleanupErrors.join('\n')).toEqual([]);
  });

  test('E2E fixture는 Supabase direct table access를 쓰지 않는다', async () => {
    const source = fs.readFileSync(__filename, 'utf8');
    const forbiddenSupabaseClient = '@' + 'supabase/supabase-js';
    const forbiddenSupabaseQuery = 'supabase' + '.from(';
    const forbiddenSupabaseRest = '/rest' + '/v1/';

    expect(source).not.toContain(forbiddenSupabaseClient);
    expect(source).not.toContain(forbiddenSupabaseQuery);
    expect(source).not.toContain(forbiddenSupabaseRest);
    expect(source).toContain('/api/v1/contacts');
    expect(source).toContain('/api/v1/files/confirm');
  });

  test('개발 워크프로세스: 문의 생성 → 현장 전 단계 → 레이저 → 칼작업 → 납품완료 → 업체 대시보드', async ({
    request,
  }) => {
    const contact = await createContact(request, {
      companyName: targetCompany.company_name,
      inquiryType: 'cutting_request',
      inquiryTitle: `ODATA2 개발 워크프로세스 ${suffix}`,
      source: 'website',
    });
    contactIds.push(contact.id);

    const inquiryNumber = requireValue(
      contact.inquiry_number ?? contact.inquiryNumber,
      'cutting_request contact must receive an inquiry number'
    );

    const drawingConfirmed = await updateStageAsAdmin(request, contact.id, 'drawing_confirmed');
    const workNumber = requireValue(
      drawingConfirmed.work_number as string | null,
      'drawing_confirmed transition must issue a work number'
    );

    const byInquiry = await getContactByNumber(
      request,
      managementKey.key,
      'inquiry',
      inquiryNumber
    );
    expect(byInquiry.id).toBe(contact.id);
    expect(byInquiry.company_id ?? byInquiry.companyId).toBe(targetCompany.id);

    const byWork = await getContactByNumber(request, managementKey.key, 'work', workNumber);
    expect(byWork.id).toBe(contact.id);
    expect(byWork.work_number ?? byWork.workNumber).toBe(workNumber);

    const laser = await updateStage(
      request,
      managementKey.key,
      contact.id,
      'laser',
      'management_program'
    );
    expect(laser.process_stage).toBe('laser');

    const cutting = await updateStage(
      request,
      nestingKey.key,
      contact.id,
      'cutting',
      'nesting_program'
    );
    expect(cutting.process_stage).toBe('cutting');

    const delivery = await updateStageAsAdmin(request, contact.id, 'delivery');
    expect(delivery.process_stage).toBe('delivery');

    await startDelivery(request, contact.id);

    const finalContact = await getContact(request, managementKey.key, contact.id);
    expect(finalContact.process_stage ?? finalContact.processStage ?? null).toBeNull();
    expect(finalContact.status).toBe('delivered');
    expect(finalContact.company_id ?? finalContact.companyId).toBe(targetCompany.id);

    await expectCompanyDashboardContains(request, targetCompany.id, contact.id);
  });

  test('기존 워크프로세스: 미등록 외부웹하드 업로드 → 업체 매핑 → 기존/신규 데이터 업체 라우팅', async ({
    request,
  }) => {
    const externalRoot = await findOrCreateFolder(request, '외부웹하드');
    const externalCompany = await findOrCreateFolder(
      request,
      externalCompanyName,
      externalRoot.folder.id,
      null
    );
    const externalCutting = await findOrCreateFolder(
      request,
      '칼선의뢰',
      externalCompany.folder.id,
      null
    );
    if (externalCutting.created) createdFolderIds.push(externalCutting.folder.id);
    if (externalCompany.created) createdFolderIds.push(externalCompany.folder.id);
    if (externalRoot.created) createdFolderIds.push(externalRoot.folder.id);

    const legacyFilename = `odata2-legacy-${suffix}.dxf`;
    const legacyFile = await confirmR2ExternalUpload(
      request,
      externalSyncKey.key,
      externalCutting.folder.id,
      legacyFilename
    );
    fileIds.push(legacyFile.id);
    expect(legacyFile.company_id).toBeNull();
    expect(legacyFile.folder_id).toBe(externalCutting.folder.id);

    const legacyContactId = await pollContactByDuplicate(
      request,
      managementKey.key,
      externalCompanyName,
      legacyFilename
    );
    contactIds.push(legacyContactId);

    const aliasResponse = await request.post(`${apiBaseUrl}/api/v1/companies/folder-aliases`, {
      headers: adminHeaders(),
      data: {
        folderName: externalCompanyName,
        companyId: targetCompany.id,
        cascadeBackfill: true,
      },
    });
    await expectApiOk(aliasResponse, 'folder alias create with cascade backfill');
    const aliasBody = (await aliasResponse.json()) as {
      alias: { id: number };
      backfill?: { relocated: number };
    };
    folderAliasId = aliasBody.alias.id;
    expect(aliasBody.backfill?.relocated ?? 0).toBeGreaterThanOrEqual(1);

    const mappedLegacyContact = await getContact(request, managementKey.key, legacyContactId);
    expect(mappedLegacyContact.company_id ?? mappedLegacyContact.companyId).toBe(targetCompany.id);
    expect(mappedLegacyContact.company_name ?? mappedLegacyContact.companyName).toBe(
      targetCompany.company_name
    );
    await expectCompanyDashboardContains(request, targetCompany.id, legacyContactId);

    const routedFilename = `odata2-routed-${suffix}.dxf`;
    const routedFile = await confirmR2ExternalUpload(
      request,
      externalSyncKey.key,
      externalCutting.folder.id,
      routedFilename
    );
    fileIds.push(routedFile.id);
    expect(routedFile.company_id).toBe(targetCompany.id);
    expect(routedFile.folder_id).not.toBe(externalCutting.folder.id);

    const routedContactId = await pollContactByDuplicate(
      request,
      managementKey.key,
      targetCompany.company_name,
      routedFilename
    );
    contactIds.push(routedContactId);
    const routedContact = await getContact(request, managementKey.key, routedContactId);
    expect(routedContact.company_id ?? routedContact.companyId).toBe(targetCompany.id);
    expect(routedContact.company_name ?? routedContact.companyName).toBe(
      targetCompany.company_name
    );
    await expectCompanyDashboardContains(request, targetCompany.id, routedContactId);
  });
});
