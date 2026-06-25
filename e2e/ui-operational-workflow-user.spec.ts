import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type Page,
  type Response as PlaywrightResponse,
} from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  adminStorageStatePath,
  clickFirstVisible,
  clearBrowserState,
  expectOneOfTexts,
  fillInputByName,
  fillStableInput,
  fixtureFile,
  gotoAuthed,
  loginAs,
  selectByName,
  setFileByName,
  waitForAppLoadingToSettle,
} from './helpers/ui-user-actions';
import { dismissAllModals, mockR2Uploads } from './helpers/webhard-helpers';
import { TEST_FILES } from './helpers/file-helpers';

const apiBaseUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
const appBaseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const authFile = path.join(__dirname, '..', '.auth', 'user.json');
const DEFAULT_SESSION_SECRET_SENTINEL = 'change-this-in-production';
const DEV_ONLY_SESSION_SECRET = 'change-this-in-production-dev-only';
const E2E_SESSION_MAX_AGE_SECONDS = 60 * 60 * 4;
const PRODUCTION_RESOURCE_PATTERNS = [
  'ibsbcuumkdhwesrpaqeb',
  'webhard-api-production',
  'yjlaser.net',
  'vercel.app',
  'production',
];

function isWebhardUploadInitResponse(response: PlaywrightResponse): boolean {
  const url = response.url();
  return (
    response.request().method() === 'POST' &&
    (url.includes('/api/webhard/files/presigned-url') ||
      url.includes('/api/webhard/files/batch/upload') ||
      url.includes('/api/webhard/upload/batch'))
  );
}

function isWebhardUploadConfirmResponse(response: PlaywrightResponse): boolean {
  const url = response.url();
  return (
    response.request().method() === 'POST' &&
    (url.includes('/api/webhard/files/confirm') ||
      url.includes('/api/webhard/upload/batch-complete'))
  );
}

type CreatedApiKey = {
  id: string;
  key: string;
};

type CompanyOption = {
  id: number;
  company_name: string;
};

type CompanyRecord = {
  id: number;
  company_name?: string | null;
  companyName?: string | null;
  username?: string | null;
  status?: string | null;
  is_approved?: boolean | null;
  isApproved?: boolean | null;
};

type ContactRecord = {
  id: string;
  status?: string | null;
  company_id?: number | null;
  companyId?: number | null;
  company_name?: string | null;
  companyName?: string | null;
  inquiry_title?: string | null;
  inquiryTitle?: string | null;
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

type OrderRecord = {
  id: string;
  inquiry_number?: string | null;
  title?: string | null;
  contact_id?: number | null;
};

type OrderTimelineResponse = {
  order_id: string;
  contact_id: string | null;
  legacy_order_contact_id: number | null;
  inquiry_number: string | null;
  events?: Array<{ event_type?: string | null }>;
};

type CleanupResourceType =
  | 'apiKey'
  | 'company'
  | 'contact'
  | 'file'
  | 'folder'
  | 'folderAlias'
  | 'order';

type PrismaOrderCleanupClient = {
  order: {
    deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
  };
  $disconnect(): Promise<void>;
};

type CleanupManifest = {
  createdApiResources?: Array<{
    type: CleanupResourceType;
    id: string;
    source: string;
    recordedAt: string;
  }>;
  [key: string]: unknown;
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
  expect(key, 'MIGRATION_API_KEY is required for operational UI E2E').not.toBe('');
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
  expect(strictRuntime, 'operational UI E2E must not run in production-like runtime').toBe(false);
  expect(
    isProductionLikeUrl(apiBaseUrl) || isProductionLikeUrl(appBaseUrl),
    `operational UI E2E must not target production API/Web URLs. api=${apiBaseUrl}, app=${appBaseUrl}`
  ).toBe(false);

  const allowRemoteOperationalE2E = process.env.ALLOW_REMOTE_OPERATIONAL_E2E === 'true';
  const hasNonLoopbackRuntimeUrl = !isLoopbackUrl(apiBaseUrl) || !isLoopbackUrl(appBaseUrl);
  if (!allowRemoteOperationalE2E) {
    expect(
      !hasNonLoopbackRuntimeUrl,
      `operational UI E2E mutates test data and is local-only by default. api=${apiBaseUrl}, app=${appBaseUrl}`
    ).toBe(true);
  }

  const missingMocks = [
    'OPERATIONAL_E2E_MOCK_LGUPLUS',
    'OPERATIONAL_E2E_MOCK_POPBILL',
    'OPERATIONAL_E2E_MOCK_STORAGE',
  ].filter((name) => process.env[name] !== 'true');
  expect(missingMocks, 'operational UI E2E requires external boundary mock flags').toEqual([]);

  const externalCredentialNames = Object.keys(process.env).filter(
    (name) =>
      process.env[name] &&
      /^(POPBILL|LGUPLUS|GOOGLE_DRIVE|GOOGLE_APPLICATION_CREDENTIALS|R2_|AWS_)/i.test(name)
  );
  expect(
    externalCredentialNames,
    'operational UI E2E refuses external service credential env vars'
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
      'Operational UI E2E DB Supabase refs must match OPERATIONAL_E2E_EXPECTED_SUPABASE_REF'
    ).toBe(true);
  }
}

async function expectApiOk(response: APIResponse, description: string): Promise<void> {
  if (response.ok()) return;
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

async function cleanupOrders(orderIds: string[], cleanupErrors: string[]): Promise<void> {
  if (orderIds.length === 0) return;

  let prisma: PrismaOrderCleanupClient | null = null;
  try {
    const clientPath = path.join(
      __dirname,
      '..',
      'webhard-api',
      'node_modules',
      '@prisma',
      'client'
    );
    const clientModule = require(clientPath) as {
      PrismaClient: new () => PrismaOrderCleanupClient;
    };
    prisma = new clientModule.PrismaClient();
    await prisma.order.deleteMany({ where: { id: { in: [...new Set(orderIds)] } } });
  } catch (error) {
    cleanupErrors.push(
      `delete integration orders: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    await prisma?.$disconnect().catch((error: unknown) => {
      cleanupErrors.push(
        `disconnect Prisma cleanup client: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  }
}

function recordCleanupResource(type: CleanupResourceType, id: string | number): void {
  const manifestPath = process.env.OPERATIONAL_E2E_CLEANUP_MANIFEST_PATH;
  if (!manifestPath) return;

  const resourceId = String(id);
  const manifest = fs.existsSync(manifestPath)
    ? (JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as CleanupManifest)
    : {};
  const resources = Array.isArray(manifest.createdApiResources) ? manifest.createdApiResources : [];
  if (!resources.some((resource) => resource.type === type && resource.id === resourceId)) {
    resources.push({
      type,
      id: resourceId,
      source: 'ui-operational-workflow-user',
      recordedAt: new Date().toISOString(),
    });
  }
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({ ...manifest, createdApiResources: resources }, null, 2)}\n`
  );
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
  const signature = crypto
    .createHmac('sha256', getE2ESessionSecret())
    .update(tokenAndData)
    .digest('hex');

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
    'x-api-key': apiKey,
    Cookie: '',
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
      name: `odata2-ui-${programType}-${suffix}`,
      programType,
    },
  });
  await expectApiOk(response, `create ${programType} API key`);
  const body = (await response.json()) as Partial<CreatedApiKey> & {
    apiKey?: string;
    plaintextKey?: string;
  };
  return {
    id: requireValue(body.id, `created ${programType} API key id`),
    key: requireValue(
      body.key ?? body.apiKey ?? body.plaintextKey,
      `created ${programType} API key secret`
    ),
  };
}

async function getCompanyByUsername(
  request: APIRequestContext,
  username: string
): Promise<CompanyRecord | null> {
  const response = await request.get(
    `${apiBaseUrl}/api/v1/companies/by-username/${encodeURIComponent(username)}`,
    {
      headers: { 'X-API-Key': requireMigrationApiKey() },
      failOnStatusCode: false,
    }
  );
  if (response.status() === 404) return null;
  await expectApiOk(response, `company lookup ${username}`);
  return (await response.json()) as CompanyRecord;
}

async function approveCompany(request: APIRequestContext, companyId: number): Promise<void> {
  const response = await request.post(`${apiBaseUrl}/api/v1/companies/${companyId}/approve`, {
    headers: { 'X-API-Key': requireMigrationApiKey(), 'Content-Type': 'application/json' },
    data: { approvedBy: 'operational-ui-e2e' },
  });
  await expectApiOk(response, `approve company ${companyId}`);

  const accessResponse = await request.patch(
    `${apiBaseUrl}/api/v1/companies/${companyId}/webhard-access`,
    {
      headers: { 'X-API-Key': requireMigrationApiKey(), 'Content-Type': 'application/json' },
      data: { allowed: true },
    }
  );
  await expectApiOk(accessResponse, `enable webhard access ${companyId}`);
}

async function getActiveCompanies(request: APIRequestContext): Promise<CompanyOption[]> {
  const response = await request.get(`${apiBaseUrl}/api/v1/companies/names`, {
    headers: { 'X-API-Key': requireMigrationApiKey() },
  });
  await expectApiOk(response, 'company names lookup');
  return (await response.json()) as CompanyOption[];
}

async function pollContactBySearch(
  request: APIRequestContext,
  apiKey: string,
  search: string,
  predicate: (contact: ContactRecord) => boolean
): Promise<ContactRecord> {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const params = new URLSearchParams({
      search,
      page: '1',
      limit: '25',
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
    const response = await request.get(`${apiBaseUrl}/api/v1/contacts?${params.toString()}`, {
      headers: integrationHeaders(apiKey),
      failOnStatusCode: false,
    });
    if (response.ok()) {
      const body = (await response.json()) as { contacts?: ContactRecord[] };
      const contact = (body.contacts ?? []).find(predicate);
      if (contact) return contact;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(`Timed out waiting for contact search result: ${search}`);
}

async function pollOrderByInquiryNumber(
  request: APIRequestContext,
  apiKey: string,
  companyName: string,
  inquiryNumber: string
): Promise<OrderRecord> {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const params = new URLSearchParams({
      companyName,
      page: '1',
      limit: '50',
      sortBy: 'created_at',
      sortOrder: 'desc',
    });
    const response = await request.get(
      `${apiBaseUrl}/api/v1/integration/orders?${params.toString()}`,
      {
        headers: integrationHeaders(apiKey),
        failOnStatusCode: false,
      }
    );
    if (response.ok()) {
      const body = (await response.json()) as { orders?: OrderRecord[] };
      const order = (body.orders ?? []).find(
        (candidate) => candidate.inquiry_number === inquiryNumber
      );
      if (order) return order;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(`Timed out waiting for integration order: ${inquiryNumber}`);
}

async function getOrderTimeline(
  request: APIRequestContext,
  apiKey: string,
  orderId: string
): Promise<OrderTimelineResponse> {
  const response = await request.get(
    `${apiBaseUrl}/api/v1/integration/orders/${orderId}/timeline`,
    {
      headers: integrationHeaders(apiKey),
    }
  );
  await expectApiOk(response, `order ${orderId} timeline lookup`);
  return (await response.json()) as OrderTimelineResponse;
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

async function startDelivery(request: APIRequestContext, contactId: string): Promise<void> {
  const response = await request.post(`${apiBaseUrl}/api/v1/contacts/batch-start-delivery`, {
    headers: adminHeaders(),
    data: {
      contactIds: [contactId],
      actorType: 'admin',
      actorName: 'ODATA2 UI E2E admin',
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

async function getCompanyFolders(
  request: APIRequestContext,
  companyId: number
): Promise<FolderRecord[]> {
  const response = await request.get(
    `${apiBaseUrl}/api/v1/folders?companyId=${companyId}&includeAll=true`,
    {
      headers: adminHeaders(),
    }
  );
  await expectApiOk(response, `company folders lookup ${companyId}`);
  const body = (await response.json()) as { folders?: FolderRecord[] };
  return (body.folders ?? []).filter((folder) => folder.company_id === companyId);
}

function sortFoldersParentsFirst(folders: FolderRecord[]): FolderRecord[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const depthOf = (folder: FolderRecord): number => {
    let depth = 0;
    let current = folder.parent_id ? byId.get(folder.parent_id) : null;
    while (current) {
      depth += 1;
      current = current.parent_id ? byId.get(current.parent_id) : null;
    }
    return depth;
  };
  return [...folders].sort((a, b) => depthOf(a) - depthOf(b));
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
      key: `odata2/ui-e2e/${Date.now()}-${filename}`,
      name: filename,
      originalName: filename,
      size: 128,
      mimeType: 'application/dxf',
      folderId,
    },
  });
  await expectApiOk(response, `external upload confirm ${filename}`);
  return (await response.json()) as FileRecord;
}

async function pollContactByDuplicate(
  request: APIRequestContext,
  apiKey: string,
  companyName: string,
  originalFilename: string
): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await request.post(`${apiBaseUrl}/api/v1/contacts/find-duplicate`, {
      headers: integrationHeaders(apiKey),
      data: { companyName, originalFilename },
    });
    await expectApiOk(response, 'duplicate contact lookup');
    const body = (await response.json()) as { exists: boolean; contactId: string | null };
    if (body.exists && body.contactId) return body.contactId;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(`Timed out waiting for auto contact: ${companyName} / ${originalFilename}`);
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
  expect((body.contacts ?? []).map((contact) => contact.id)).toContain(contactId);
}

async function registerCompanyViaUi(
  page: Page,
  input: {
    username: string;
    password: string;
    companyName: string;
    businessRegistrationNumber: string;
    email: string;
  }
): Promise<void> {
  const browserDiagnostics: string[] = [];
  const addBrowserDiagnostic = (entry: string) => {
    if (browserDiagnostics.length >= 20) return;
    browserDiagnostics.push(maskOperationalLogText(entry));
  };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      addBrowserDiagnostic(`console:${message.text().slice(0, 500)}`);
    }
  });
  page.on('pageerror', (error) => {
    addBrowserDiagnostic(`pageerror:${error.message.slice(0, 500)}`);
  });

  await page.goto('/register', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(1500);

  await fillInputByName(page, 'username', input.username);
  await fillInputByName(page, 'password', input.password);
  await fillInputByName(page, 'password_confirm', input.password);
  await fillInputByName(page, 'company_name', input.companyName);
  await fillInputByName(page, 'representative_name', '운영UI대표');
  await fillInputByName(page, 'business_registration_number', input.businessRegistrationNumber);
  await fillInputByName(page, 'business_type', '제조업');
  await fillInputByName(page, 'business_category', '패키지');
  await fillInputByName(page, 'business_address', '서울특별시 중구 운영로 1');
  await fillInputByName(page, 'manager_name', '운영UI담당');
  await fillInputByName(page, 'manager_position', '팀장');
  await fillInputByName(page, 'manager_phone', '010-9100-1234');
  await fillInputByName(page, 'manager_email', input.email);
  await fillInputByName(page, 'accountant_name', '운영UI회계');
  await fillInputByName(page, 'accountant_phone', '010-9100-5678');
  await fillInputByName(page, 'accountant_email', `account-${input.email}`);
  await page.getByText('이메일', { exact: true }).click();
  await expect(page.locator('input[name="quote_method"][value="email"]')).toBeChecked();
  await setFileByName(page, 'business_registration_file', fixtureFile.businessRegistration);
  const registrationFileInput = page.locator('input[name="business_registration_file"]').first();
  await expect(registrationFileInput).toHaveJSProperty('files.length', 1);
  await expect
    .poll(
      async () =>
        registrationFileInput.evaluate(
          (element) => (element as HTMLInputElement).files?.[0]?.name ?? ''
        ),
      { timeout: 10_000 }
    )
    .toBe('business-registration.pdf');

  const submitButton = page.locator('form').getByRole('button', { name: '업체등록 신청' });
  const successText = /업체등록이 완료되었습니다|승인 대기|등록.*완료|회원가입.*완료|관리자 승인/;
  await installRegisterSubmitProbe(page);
  let lastSubmitDiagnostics: RegisterSubmitDiagnostics | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expect(submitButton).toBeEnabled({ timeout: 15000 });
    await submitButton.scrollIntoViewIfNeeded();
    await submitButton.click();

    const processingStarted = await expect(page.getByRole('button', { name: /처리 중/ }))
      .toBeVisible({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    const success = await expect(page.locator('body'))
      .toContainText(successText, { timeout: processingStarted ? 60000 : 15000 })
      .then(() => true)
      .catch(() => false);
    if (success) return;
    lastSubmitDiagnostics = await collectRegisterSubmitDiagnostics(page);

    const validationText = await page
      .locator('body')
      .innerText({ timeout: 5000 })
      .catch(() => '');
    if (/입력해주세요|올바르지|일치하지|이미 사용|이미 등록|실패|오류/.test(validationText)) {
      throw new Error(
        `company registration validation/server error: ${validationText.slice(0, 1200)}`
      );
    }
  }

  const bodyText = await page
    .locator('body')
    .innerText({ timeout: 5000 })
    .catch(() => '');
  throw new Error(
    `company registration did not reach success state: ${bodyText.slice(0, 1200)}\n` +
      `diagnostics=${JSON.stringify({
        submit: lastSubmitDiagnostics,
        browser: browserDiagnostics,
      })}`
  );
}

interface RegisterSubmitDiagnostics {
  submitCount: number;
  formValid: boolean | null;
  invalidControls: Array<{ name: string; message: string }>;
  activeElement: string;
  submitButtonDisabled: boolean | null;
  urlPath: string;
}

async function installRegisterSubmitProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probeWindow = window as Window & {
      __opE2eRegisterSubmitCount?: number;
      __opE2eRegisterSubmitHooked?: boolean;
    };
    if (probeWindow.__opE2eRegisterSubmitHooked) return;
    probeWindow.__opE2eRegisterSubmitCount = 0;
    document.querySelector('form')?.addEventListener(
      'submit',
      () => {
        probeWindow.__opE2eRegisterSubmitCount = (probeWindow.__opE2eRegisterSubmitCount ?? 0) + 1;
      },
      true
    );
    probeWindow.__opE2eRegisterSubmitHooked = true;
  });
}

async function collectRegisterSubmitDiagnostics(page: Page): Promise<RegisterSubmitDiagnostics> {
  return page.evaluate(() => {
    const probeWindow = window as Window & { __opE2eRegisterSubmitCount?: number };
    const form = document.querySelector('form') as HTMLFormElement | null;
    const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    const invalidControls = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input, select, textarea'
      )
    )
      .filter((element) => !element.checkValidity())
      .map((element) => ({
        name: element.name || element.id || element.type,
        message: element.validationMessage,
      }));

    return {
      submitCount: probeWindow.__opE2eRegisterSubmitCount ?? 0,
      formValid: form?.checkValidity() ?? null,
      invalidControls,
      activeElement: document.activeElement?.tagName ?? '',
      submitButtonDisabled: submitButton?.disabled ?? null,
      urlPath: location.pathname,
    };
  });
}

function maskOperationalLogText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>')
    .replace(/\b\d{2,3}-\d{3,4}-\d{4}\b/g, '<phone>')
    .replace(/\b(api[_-]?key|secret|token|password)\b[^\s,;}\\]"]*/gi, '$1=<redacted>');
}

async function submitContactViaUi(
  page: Page,
  input: {
    companyName: string;
    inquiryTitle: string;
    email: string;
  }
): Promise<void> {
  await page.goto('/contact', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  await fillInputByName(page, 'inquiry_title', input.inquiryTitle);
  await fillInputByName(page, 'company_name', input.companyName);
  await fillInputByName(page, 'name', '운영UI문의');
  await fillInputByName(page, 'position', '팀장');
  await fillInputByName(page, 'phone', '010-9200-1234');
  await fillInputByName(page, 'email', input.email);
  await selectByName(page, 'referralSource', '구글');

  const stepTwoHeading = page.getByRole('heading', { name: '도면 및 샘플' });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await clickFirstVisible(page, ['다음 단계']);
    if (await stepTwoHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
      break;
    }
  }
  await expect(stepTwoHeading).toBeVisible({ timeout: 15000 });

  await clickFirstVisible(page, ['샘플 제작이 필요합니다.']);
  await clickFirstVisible(page, ['샘플 제작에 필요한 도면이나 사진이 있습니다.']);
  await setFileByName(page, 'reference_photos', fixtureFile.drawing);
  await fillInputByName(page, 'length', '120');
  await fillInputByName(page, 'width', '80');
  await fillInputByName(page, 'height', '30');
  await fillInputByName(page, 'material', 'E2E fixture');
  await clickFirstVisible(page, ['다음 단계']);

  await expect(page.getByRole('heading', { name: '일정 조율' })).toBeVisible({ timeout: 15000 });
  const deliveryMethodButton = page
    .locator('button')
    .filter({ hasText: /택배 및 퀵으로 (수령|수정)/ })
    .first();
  await expect(deliveryMethodButton).toBeVisible({ timeout: 15000 });
  await deliveryMethodButton.click();
  const parcelRadio = page.locator('input[name="delivery_type"][value="parcel"]').first();
  await expect(parcelRadio).toBeAttached({ timeout: 15000 });
  await page
    .locator('label')
    .filter({ hasText: /^택배$/ })
    .first()
    .click();
  await expect(parcelRadio).toBeChecked({ timeout: 5000 });
  await fillVisibleInputByName(page, 'delivery_address', '서울특별시 중구 운영로 1');
  await fillVisibleInputByName(page, 'delivery_name', '운영UI수령');
  await fillVisibleInputByName(page, 'delivery_phone', '010-9200-5678');
  await clickFirstVisible(page, ['다음 단계']);

  await expect(page.getByRole('heading', { name: '내용 확인' })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('body')).toContainText(input.inquiryTitle);
  await page.getByRole('button', { name: '문의하기' }).click();
  await expect(page.getByRole('heading', { name: '문의가 전송되었습니다' })).toBeVisible({
    timeout: 90000,
  });
}

async function fillVisibleInputByName(page: Page, name: string, value: string): Promise<void> {
  const input = page.locator(`input:not([type="hidden"])[name="${name}"]`).first();
  await fillStableInput(page, input, value);
}

async function waitForWebhardUi(page: Page): Promise<void> {
  await expectOneOfTexts(page, [/파일명|웹하드|업로드된 파일이 없습니다|파일 목록/]);
  await waitForAppLoadingToSettle(page, 60000);
  await dismissAllModals(page);
}

async function uploadCompanyWebhardFileViaUi(
  page: Page,
  fileName: string
): Promise<FileRecord | null> {
  await page.goto('/webhard', { waitUntil: 'domcontentloaded' });
  await waitForWebhardUi(page);
  await mockR2Uploads(page);

  let folderTemplateReady = false;
  const onFolderResponse = async (response: PlaywrightResponse) => {
    if (!response.url().includes('/api/webhard/folders') || !response.ok()) return;
    const body = (await response.json().catch(() => null)) as
      | { folders?: Array<{ name?: string; parent_id?: string | null }> }
      | Array<{ name?: string; parent_id?: string | null }>
      | null;
    const folders = Array.isArray(body) ? body : (body?.folders ?? []);
    const hasCutting = folders.some((folder) => folder.name === '칼선의뢰');
    const hasMold = folders.some((folder) => folder.name === '목형의뢰');
    if (hasCutting && hasMold) {
      folderTemplateReady = true;
    }
    console.log(
      `[operational-ui] webhard folders query includeAll=${response.url().includes('includeAll=true')} parentScoped=${response.url().includes('parentId=')} count=${folders.length} roots=${folders.filter((folder) => folder.parent_id === null).length} hasCutting=${folders.some((folder) => folder.name === '칼선의뢰')} hasMold=${folders.some((folder) => folder.name === '목형의뢰')}`
    );
  };
  page.on('response', onFolderResponse);

  const testFile = TEST_FILES.dxf(fileName, 32 * 1024);
  const uploadResponsePromise = page
    .waitForResponse(isWebhardUploadInitResponse, { timeout: 90000 })
    .catch(() => null);
  const confirmResponsePromise = page
    .waitForResponse(isWebhardUploadConfirmResponse, { timeout: 90000 })
    .catch(() => null);

  const fileInput = page
    .locator('[data-testid="file-upload-input"]')
    .or(page.locator('input[type="file"]').first());
  const buffer = Buffer.from(await testFile.arrayBuffer());
  try {
    await fileInput.setInputFiles({
      name: testFile.name,
      mimeType: testFile.type,
      buffer,
    });

    await expect(page.getByRole('heading', { name: '의뢰 유형 선택' })).toBeVisible({
      timeout: 15000,
    });
    await expect
      .poll(() => folderTemplateReady, {
        message: 'company webhard template folders should be loaded before inquiry-type click',
        timeout: 30000,
      })
      .toBe(true);
    const moldRequestButton = page.getByRole('button', { name: /목형 의뢰/ }).first();
    await expect(moldRequestButton).toBeVisible({ timeout: 15000 });
    await moldRequestButton.click();

    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse, 'webhard upload init API response').not.toBeNull();
    expect(uploadResponse?.ok(), `webhard upload init status ${uploadResponse?.status()}`).toBe(
      true
    );

    const confirmResponse = await confirmResponsePromise;
    expect(confirmResponse, 'webhard upload confirm API response').not.toBeNull();
    expect(
      confirmResponse?.ok(),
      `webhard upload confirm status ${confirmResponse?.status()}`
    ).toBe(true);
    const confirmBody = (await confirmResponse?.json().catch(() => null)) as
      | FileRecord
      | { file?: FileRecord; files?: FileRecord[] }
      | null
      | undefined;
    const confirmedFile =
      confirmBody && 'id' in confirmBody
        ? confirmBody
        : (confirmBody?.file ?? confirmBody?.files?.[0] ?? null);

    await dismissAllModals(page);
    return confirmedFile;
  } finally {
    page.off('response', onFolderResponse);
  }
}

async function setAdminStatusViaUi(
  page: Page,
  request: APIRequestContext,
  apiKey: string,
  contactId: string,
  status: string
): Promise<void> {
  await gotoAuthed(page, `/admin/work-management/${contactId}`);
  const statusSelect = page.getByTestId('admin-status-select');
  await expect(statusSelect).toBeVisible({ timeout: 30000 });
  await expect(statusSelect).toHaveAttribute('data-hydrated', 'true', { timeout: 30000 });
  await expect(statusSelect).toBeEnabled({ timeout: 30000 });
  await statusSelect.selectOption(status);
  await expect
    .poll(async () => (await getContact(request, apiKey, contactId)).status ?? null, {
      timeout: 60000,
    })
    .toBe(status);
}

async function setAdminProcessStageViaUi(
  page: Page,
  request: APIRequestContext,
  apiKey: string,
  contactId: string,
  processStage: string
): Promise<ContactRecord> {
  await gotoAuthed(page, `/admin/work-management/${contactId}`);
  const dialogMessages: string[] = [];
  const onDialog = async (dialog: { message: () => string; dismiss: () => Promise<void> }) => {
    dialogMessages.push(dialog.message());
    await dialog.dismiss();
  };
  page.on('dialog', onDialog);
  const stageSelect = page.getByTestId('admin-process-stage-select');

  let observed: ContactRecord | null = null;
  try {
    await expect(stageSelect).toBeVisible({ timeout: 30000 });
    await expect(stageSelect).toHaveAttribute('data-hydrated', 'true', { timeout: 30000 });
    await expect(stageSelect).toBeEnabled({ timeout: 30000 });
    await stageSelect.selectOption(processStage);
    await expect
      .poll(
        async () => {
          observed = await getContact(request, apiKey, contactId);
          return observed.process_stage ?? observed.processStage ?? null;
        },
        { timeout: 60000 }
      )
      .toBe(processStage);
    return requireValue(observed, 'contact should be observed after process-stage UI change');
  } catch (error) {
    throw new Error(
      `process-stage UI change to ${processStage} was not persisted. dialogs=${dialogMessages.join(' | ') || 'none'} cause=${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    page.off('dialog', onDialog);
  }
}

async function openCompanyDashboardWithSession(
  browser: Browser,
  companyId: number,
  expectedText: string
): Promise<void> {
  const context = await browser.newContext({ baseURL: appBaseUrl });
  try {
    const url = new URL(appBaseUrl);
    await context.addCookies([
      {
        name: 'company-session',
        value: createBrowserSessionCookieValue('company', companyId),
        domain: url.hostname,
        path: '/',
        httpOnly: true,
        secure: url.protocol === 'https:',
        sameSite: 'Lax',
        expires: Math.floor(Date.now() / 1000) + E2E_SESSION_MAX_AGE_SECONDS,
      },
    ]);
    const page = await context.newPage();
    await page.goto('/company/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(expectedText, { timeout: 60000 });
  } finally {
    await context.close();
  }
}

test.describe.serial('ODATA2-007 운영 워크프로세스 실제 UI 보강 E2E', () => {
  test.use({ storageState: adminStorageStatePath });

  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const createdApiKeys: CreatedApiKey[] = [];
  const contactIds: string[] = [];
  const orderIds: string[] = [];
  const fileIds: string[] = [];
  const createdFolderIds: string[] = [];
  const createdCompanyIds: number[] = [];
  const folderAliasIds: number[] = [];
  let managementKey: CreatedApiKey;
  let nestingKey: CreatedApiKey;
  let externalSyncKey: CreatedApiKey;

  test.beforeAll(async ({ request }) => {
    assertLocalOperationalE2ERuntime();
    requireMigrationApiKey();
    managementKey = await createIntegrationApiKey(request, 'management_program', suffix);
    nestingKey = await createIntegrationApiKey(request, 'nesting_program', suffix);
    externalSyncKey = await createIntegrationApiKey(request, 'external_webhard_sync', suffix);
    createdApiKeys.push(managementKey, nestingKey, externalSyncKey);
    createdApiKeys.forEach((apiKey) => recordCleanupResource('apiKey', apiKey.id));
  });

  test.afterAll(async ({ request }) => {
    const cleanupErrors: string[] = [];

    await cleanupOrders(orderIds, cleanupErrors);

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

    for (const aliasId of [...folderAliasIds].reverse()) {
      await cleanupRequest(cleanupErrors, `delete folder alias ${aliasId}`, () =>
        request.delete(`${apiBaseUrl}/api/v1/companies/folder-aliases/${aliasId}`, {
          headers: adminHeaders(),
        })
      );
    }

    for (const folderId of [...createdFolderIds].reverse()) {
      await cleanupRequest(cleanupErrors, `delete folder ${folderId}`, () =>
        request.delete(`${apiBaseUrl}/api/v1/folders/${folderId}/delete`, {
          headers: adminHeaders(),
        })
      );
    }

    for (const companyId of [...createdCompanyIds].reverse()) {
      await cleanupRequest(cleanupErrors, `soft-delete company ${companyId}`, () =>
        request.delete(`${apiBaseUrl}/api/v1/companies/${companyId}`, {
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

  test('브라우저 업로드 워크플로우: 업체등록 → 로그인 문의 → 자체웹하드 업로드 → 관리자 UI 도면확정 → 레이저/납품 추적', async ({
    browser,
    page: adminPage,
    request,
  }) => {
    test.setTimeout(240000);

    const username = `odata2_ui_${suffix.replace(/[^a-z0-9]/gi, '_')}`;
    const password = 'test1234!';
    const companyName = `ODATA2-UI업체-${suffix}`;
    const inquiryTitle = `ODATA2 UI 브라우저 업로드 ${suffix}`;
    const webhardFileName = `odata2-ui-webhard-${suffix}.dxf`;
    const email = `odata2-ui-${suffix}@example.com`;
    const digits = `${Date.now()}${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`.slice(-10);
    const businessRegistrationNumber = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;

    const userContext = await browser.newContext({ baseURL: appBaseUrl });
    const userPage = await userContext.newPage();
    try {
      await registerCompanyViaUi(userPage, {
        username,
        password,
        companyName,
        businessRegistrationNumber,
        email,
      });

      const createdCompany = await expect
        .poll(async () => getCompanyByUsername(request, username), { timeout: 60000 })
        .not.toBeNull()
        .then(async () =>
          requireValue(await getCompanyByUsername(request, username), 'created company')
        );
      const companyId = createdCompany.id;
      createdCompanyIds.push(companyId);
      recordCleanupResource('company', companyId);

      await approveCompany(request, companyId);
      await expect
        .poll(async () => (await getCompanyFolders(request, companyId)).length, {
          timeout: 60000,
        })
        .toBeGreaterThan(0);
      const companyFolders = sortFoldersParentsFirst(await getCompanyFolders(request, companyId));
      companyFolders.forEach((folder) => recordCleanupResource('folder', folder.id));

      await clearBrowserState(userPage);
      await loginAs(userPage, { username, password }, '/contact');

      await submitContactViaUi(userPage, { companyName, inquiryTitle, email });

      const contact = await pollContactBySearch(
        request,
        managementKey.key,
        inquiryTitle,
        (candidate) =>
          Boolean((candidate.inquiry_title ?? candidate.inquiryTitle)?.includes(inquiryTitle)) &&
          ((candidate.company_id ?? candidate.companyId) === companyId ||
            (candidate.company_name ?? candidate.companyName) === companyName)
      );
      contactIds.push(contact.id);
      recordCleanupResource('contact', contact.id);
      const inquiryNumber = requireValue(
        contact.inquiry_number ?? contact.inquiryNumber,
        'UI-created contact must receive an inquiry number'
      );
      const integrationOrder = await pollOrderByInquiryNumber(
        request,
        managementKey.key,
        companyName,
        inquiryNumber
      );
      orderIds.push(integrationOrder.id);
      recordCleanupResource('order', integrationOrder.id);
      expect(
        integrationOrder.contact_id,
        'Order must not use legacy BigInt contact_id for UUID Contact'
      ).toBeNull();

      const orderTimeline = await getOrderTimeline(request, managementKey.key, integrationOrder.id);
      expect(orderTimeline.contact_id).toBe(contact.id);
      expect(orderTimeline.inquiry_number).toBe(inquiryNumber);
      expect(orderTimeline.legacy_order_contact_id).toBeNull();
      expect(
        (orderTimeline.events ?? []).some((event) => event.event_type === 'order_created')
      ).toBe(true);

      await userPage.getByRole('button', { name: '확인' }).click();
      await userPage.goto('/company/dashboard', { waitUntil: 'domcontentloaded' });
      await expect(userPage.locator('body')).toContainText(inquiryTitle, { timeout: 60000 });

      const webhardUploadedFile = await uploadCompanyWebhardFileViaUi(userPage, webhardFileName);
      if (webhardUploadedFile?.id) {
        fileIds.push(webhardUploadedFile.id);
        recordCleanupResource('file', webhardUploadedFile.id);
      }

      await gotoAuthed(
        adminPage,
        `/admin/work-management?search=${encodeURIComponent(inquiryNumber)}`
      );
      await expect(adminPage.locator('body')).toContainText(inquiryNumber, { timeout: 60000 });
      await expect(adminPage.locator('body')).toContainText(companyName);

      await setAdminStatusViaUi(adminPage, request, managementKey.key, contact.id, 'drawing');
      const drawingConfirmed = await setAdminProcessStageViaUi(
        adminPage,
        request,
        managementKey.key,
        contact.id,
        'drawing_confirmed'
      );
      const workNumber = requireValue(
        drawingConfirmed.work_number ?? drawingConfirmed.workNumber,
        'drawing_confirmed UI transition must issue a work number'
      );

      await updateStage(request, managementKey.key, contact.id, 'laser', 'management_program');
      await updateStage(request, nestingKey.key, contact.id, 'cutting', 'nesting_program');
      await setAdminProcessStageViaUi(
        adminPage,
        request,
        managementKey.key,
        contact.id,
        'delivery'
      );
      await startDelivery(request, contact.id);

      const finalContact = await getContact(request, managementKey.key, contact.id);
      expect(finalContact.status).toBe('delivered');
      expect(finalContact.company_id ?? finalContact.companyId).toBe(companyId);
      expect(finalContact.inquiry_number ?? finalContact.inquiryNumber).toBe(inquiryNumber);
      expect(finalContact.work_number ?? finalContact.workNumber).toBe(workNumber);

      await gotoAuthed(
        adminPage,
        `/admin/work-management/delivered?search=${encodeURIComponent(workNumber)}`
      );
      await expect(adminPage.locator('body')).toContainText(workNumber, { timeout: 60000 });
      await expectCompanyDashboardContains(request, companyId, contact.id);
    } finally {
      await userContext.close();
    }
  });

  test('외부웹하드 유입 워크플로우: 미등록 폴더 fixture → 관리자 매핑 UI → 신규 업로드 업체 라우팅', async ({
    browser,
    page,
    request,
  }) => {
    test.setTimeout(240000);

    const companies = await getActiveCompanies(request);
    const targetCompany =
      companies.find((company) => company.company_name === '테스트거래처A') ?? companies[0];
    expect(targetCompany, 'At least one active company is required').toBeTruthy();

    const externalCompanyName = `ODATA2-외부UI-${suffix}`;
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
    [externalCutting, externalCompany, externalRoot].forEach((entry) => {
      if (entry.created) recordCleanupResource('folder', entry.folder.id);
    });

    const legacyFilename = `odata2-ui-legacy-${suffix}.dxf`;
    const legacyFile = await confirmR2ExternalUpload(
      request,
      externalSyncKey.key,
      externalCutting.folder.id,
      legacyFilename
    );
    fileIds.push(legacyFile.id);
    recordCleanupResource('file', legacyFile.id);
    expect(legacyFile.company_id).toBeNull();

    const legacyContactId = await pollContactByDuplicate(
      request,
      managementKey.key,
      externalCompanyName,
      legacyFilename
    );
    contactIds.push(legacyContactId);
    recordCleanupResource('contact', legacyContactId);

    await gotoAuthed(page, '/admin/integration/companies');
    await expect(page.getByRole('heading', { name: '외부웹하드 폴더 매핑' })).toBeVisible({
      timeout: 60000,
    });
    await expect(page.locator('body')).toContainText(externalCompanyName, { timeout: 60000 });

    const unmatchedRow = page.locator('tr').filter({ hasText: externalCompanyName }).first();
    await unmatchedRow.getByRole('button', { name: '이 폴더 매핑' }).click();

    const folderInput = page.locator('input[placeholder^="예:"]').first();
    await expect(folderInput).toHaveValue(externalCompanyName, { timeout: 10000 });
    const companySearch = page.locator('input[placeholder="업체명 검색"]').first();
    await companySearch.fill(targetCompany.company_name);
    await page.getByRole('button', { name: targetCompany.company_name }).first().click();
    const cascadeCheckbox = page
      .locator('label')
      .filter({ hasText: '기존 누적분 일괄 이동' })
      .locator('input');
    await expect(cascadeCheckbox).toBeChecked();

    await page.getByRole('button', { name: '매핑 등록' }).click();
    await expect(page.locator('body')).toContainText(/매핑 완료|Contact [1-9]/, {
      timeout: 90000,
    });

    const aliasResponse = await request.get(
      `${apiBaseUrl}/api/v1/companies/folder-aliases?status=approved&page=1&pageSize=100`,
      { headers: adminHeaders() }
    );
    await expectApiOk(aliasResponse, 'folder alias lookup after UI mapping');
    const aliasBody = (await aliasResponse.json()) as {
      items?: Array<{ id: number; folderName: string; companyId: number }>;
    };
    const alias = (aliasBody.items ?? []).find(
      (item) => item.folderName === externalCompanyName && item.companyId === targetCompany.id
    );
    const aliasId = requireValue(alias?.id, 'UI-created folder alias id');
    folderAliasIds.push(aliasId);
    recordCleanupResource('folderAlias', aliasId);

    const mappedLegacyContact = await getContact(request, managementKey.key, legacyContactId);
    expect(mappedLegacyContact.company_id ?? mappedLegacyContact.companyId).toBe(targetCompany.id);
    expect(mappedLegacyContact.company_name ?? mappedLegacyContact.companyName).toBe(
      targetCompany.company_name
    );

    const routedFilename = `odata2-ui-routed-${suffix}.dxf`;
    const routedFile = await confirmR2ExternalUpload(
      request,
      externalSyncKey.key,
      externalCutting.folder.id,
      routedFilename
    );
    fileIds.push(routedFile.id);
    recordCleanupResource('file', routedFile.id);
    expect(routedFile.company_id).toBe(targetCompany.id);
    expect(routedFile.folder_id).not.toBe(externalCutting.folder.id);

    const routedContactId = await pollContactByDuplicate(
      request,
      managementKey.key,
      targetCompany.company_name,
      routedFilename
    );
    contactIds.push(routedContactId);
    recordCleanupResource('contact', routedContactId);
    const routedContact = await getContact(request, managementKey.key, routedContactId);
    expect(routedContact.company_id ?? routedContact.companyId).toBe(targetCompany.id);
    expect(routedContact.company_name ?? routedContact.companyName).toBe(
      targetCompany.company_name
    );

    await openCompanyDashboardWithSession(browser, targetCompany.id, routedFilename);
    await expectCompanyDashboardContains(request, targetCompany.id, routedContactId);
  });
});
