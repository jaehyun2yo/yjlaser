import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { DeviceEndpointPolicyGuard } from '../integration/auth/device-endpoint-policy.guard';
import { IntegrationPrincipalSourceGuard } from '../integration/auth/integration-principal-source.guard';
import { DeviceBearerGuard } from '../integration/device-auth/device-bearer.guard';
import { DeviceBearerRequestSourceGuard } from '../integration/device-auth/device-bearer-request-source.guard';
import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';
import { WebhardConfigService } from './webhard-config.service';

const FOLDER_ID = '550e8400-e29b-41d4-a716-446655440000';
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

const folders = {
  getFolders: jest.fn(),
  getFolderTemplate: jest.fn(),
  updateFolderTemplate: jest.fn(),
  initializeCompanyFolders: jest.fn(),
  getCompanyWebhardInfo: jest.fn(),
  getExternalUnmatchedFolders: jest.fn(),
  getEmptyExternalHusks: jest.fn(),
  cleanupEmptyExternalHusk: jest.fn(),
  getFolderTree: jest.fn(),
  getChildFolders: jest.fn(),
  getChildFoldersForDevice: jest.fn(),
  getBatchDeleteStats: jest.fn(),
  batchDeleteFolders: jest.fn(),
  getAncestors: jest.fn(),
  getFolderDetail: jest.fn(),
  createFolder: jest.fn(),
  createFolderForDevice: jest.fn(),
  renameFolder: jest.fn(),
  renameFolderForDevice: jest.fn(),
  moveFolder: jest.fn(),
  moveFolderForDevice: jest.fn(),
  deleteFolder: jest.fn(),
};

const config = {
  getStoredMappings: jest.fn(),
  updateFolderStatusMapping: jest.fn(),
  getExcludedFolders: jest.fn(),
  updateExcludedFolders: jest.fn(),
  getAutoContactExcludedFolders: jest.fn(),
  updateAutoContactExcludedFolders: jest.fn(),
};

const APPROVED = [
  {
    name: 'GET /folders/children',
    method: 'get' as const,
    path: '/folders/children',
    permission: 'folder/read',
    status: 200,
    deviceMethod: 'getChildFoldersForDevice' as const,
    legacyMethod: 'getChildFolders' as const,
  },
  {
    name: 'POST /folders',
    method: 'post' as const,
    path: '/folders',
    permission: 'folder/write',
    status: 201,
    body: { name: 'new-folder' },
    deviceMethod: 'createFolderForDevice' as const,
    legacyMethod: 'createFolder' as const,
  },
  {
    name: 'PATCH /folders/:id/rename',
    method: 'patch' as const,
    path: `/folders/${FOLDER_ID}/rename`,
    permission: 'folder/write',
    status: 200,
    body: { name: 'renamed-folder' },
    deviceMethod: 'renameFolderForDevice' as const,
    legacyMethod: 'renameFolder' as const,
  },
  {
    name: 'PATCH /folders/:id/move',
    method: 'patch' as const,
    path: `/folders/${FOLDER_ID}/move`,
    permission: 'folder/move',
    status: 200,
    body: { parentId: null },
    deviceMethod: 'moveFolderForDevice' as const,
    legacyMethod: 'moveFolder' as const,
  },
];

const HELD: ReadonlyArray<readonly [Method, string]> = [
  ['get', '/folders'],
  ['get', '/folders/template'],
  ['put', '/folders/template'],
  ['post', '/folders/initialize'],
  ['get', '/folders/company-info/4'],
  ['get', '/folders/external-unmatched'],
  ['get', '/folders/external-husk'],
  ['delete', `/folders/external-husk/${FOLDER_ID}`],
  ['get', '/folders/tree'],
  ['get', `/folders/batch-delete?folderIds=${FOLDER_ID}`],
  ['delete', '/folders/batch-delete'],
  ['get', '/folders/config/status-mapping'],
  ['put', '/folders/config/status-mapping'],
  ['get', '/folders/config/excluded-folders'],
  ['put', '/folders/config/excluded-folders'],
  ['get', '/folders/config/auto-contact-excluded'],
  ['put', '/folders/config/auto-contact-excluded'],
  ['get', `/folders/${FOLDER_ID}/ancestors`],
  ['get', `/folders/${FOLDER_ID}`],
  ['delete', `/folders/${FOLDER_ID}`],
];

describe('FoldersController device endpoint policy', () => {
  let app: INestApplication;
  const canActivateStrict = jest.fn((context: ExecutionContext): boolean => {
    const req = context.switchToHttp().getRequest();
    if (req.headers['x-api-key']) {
      req.user = {
        userType: 'integration',
        userId: 'legacy-key',
        companyId: null,
        programType: 'external_webhard_sync',
        permissions: ['file/register'],
      };
      req.apiKeyInfo = { id: 'legacy-key' };
      return true;
    }
    const cookie = String(req.headers.cookie ?? '');
    if (cookie.includes('admin-session=')) {
      req.user = { userType: 'admin', userId: 'admin', companyId: 0 };
      return true;
    }
    return false;
  });
  const apiKeyGuard = {
    canActivate: jest.fn((context: ExecutionContext): boolean => canActivateStrict(context)),
    canActivateStrict,
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [FoldersController],
      providers: [
        Reflector,
        CompanyAccessGuard,
        IntegrationPrincipalSourceGuard,
        DeviceEndpointPolicyGuard,
        { provide: AdminGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        {
          provide: DeviceBearerRequestSourceGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        {
          provide: DeviceBearerGuard,
          useValue: {
            canActivate: jest.fn((context: ExecutionContext) => {
              const req = context.switchToHttp().getRequest();
              const state = req.headers['x-test-device-state'];
              if (state === 'revoked' || state === 'stale' || state === 'wrong_environment') {
                throw new UnauthorizedException(`synthetic ${state} device`);
              }
              req.deviceAuthInfo = {
                deviceId: 'device-1',
                environment: 'prd',
                programType: req.headers['x-test-program'] ?? 'external_webhard_sync',
                capabilityProfile: req.headers['x-test-capability'] ?? 'standard',
                permissions: String(req.headers['x-test-permissions'] ?? '')
                  .split(',')
                  .filter(Boolean),
                credentialVersion: 7,
              };
              return true;
            }),
          },
        },
        { provide: ApiKeyGuard, useValue: apiKeyGuard },
        { provide: FoldersService, useValue: folders },
        { provide: WebhardConfigService, useValue: config },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue(apiKeyGuard)
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    for (const mock of Object.values(folders)) mock.mockResolvedValue({ ok: true });
    for (const mock of Object.values(config)) mock.mockResolvedValue({ ok: true });
  });

  it.each(APPROVED)('$name allows only its exact device tuple', async (row) => {
    await send(row.method, row.path, row.body, {
      Authorization: 'Bearer synthetic.jwt.token',
      'X-Test-Permissions': row.permission,
    }).expect(row.status);
    expect(folders[row.deviceMethod]).toHaveBeenCalledTimes(1);

    const denied: Array<Record<string, string>> = [
      { 'X-Test-Program': 'management_program', 'X-Test-Permissions': row.permission },
      { 'X-Test-Permissions': '' },
      { 'X-Test-Capability': 'safe_canary', 'X-Test-Permissions': row.permission },
      { 'X-Test-Device-State': 'revoked', 'X-Test-Permissions': row.permission },
      { 'X-Test-Device-State': 'stale', 'X-Test-Permissions': row.permission },
      { 'X-Test-Device-State': 'wrong_environment', 'X-Test-Permissions': row.permission },
      { 'X-API-Key': 'legacy-key', 'X-Test-Permissions': row.permission },
    ];
    for (const headers of denied) {
      jest.clearAllMocks();
      await send(row.method, row.path, row.body, {
        Authorization: 'Bearer synthetic.jwt.token',
        ...headers,
      }).expect((res) => {
        if (![401, 403].includes(res.status)) throw new Error(`expected deny, got ${res.status}`);
      });
      expect(folders[row.deviceMethod]).not.toHaveBeenCalled();
    }
  });

  it.each(APPROVED)('$name preserves admin session dispatch', async (row) => {
    await send(row.method, row.path, row.body, { Cookie: 'admin-session=synthetic' }).expect(
      row.status
    );
    expect(folders[row.deviceMethod]).not.toHaveBeenCalled();
    expect(folders[row.legacyMethod]).toHaveBeenCalledTimes(1);
  });

  it.each(APPROVED)('$name preserves existing legacy API-key scope', async (row) => {
    const allowed = row.path === '/folders/children' || row.path === '/folders';
    await send(row.method, row.path, row.body, { 'X-API-Key': 'legacy-key' }).expect(
      allowed ? row.status : 403
    );
    expect(folders[row.deviceMethod]).not.toHaveBeenCalled();
    expect(folders[row.legacyMethod]).toHaveBeenCalledTimes(allowed ? 1 : 0);
  });

  it.each(HELD)('%s %s rejects bearer before folder/config service calls', async (method, path) => {
    await send(
      method,
      path,
      {},
      {
        Authorization: 'Bearer synthetic.jwt.token',
        'X-Test-Permissions': 'folder/read,folder/write,folder/move',
      }
    ).expect(403);
    expect(Object.values(folders).every((mock) => mock.mock.calls.length === 0)).toBe(true);
    expect(Object.values(config).every((mock) => mock.mock.calls.length === 0)).toBe(true);
  });

  function send(
    method: Method,
    path: string,
    body: Record<string, unknown> | undefined,
    headers: Record<string, string>
  ) {
    const agent = request(app.getHttpServer());
    const call =
      method === 'get'
        ? agent.get(path)
        : method === 'post'
          ? agent.post(path)
          : method === 'put'
            ? agent.put(path)
            : method === 'patch'
              ? agent.patch(path)
              : agent.delete(path);
    for (const [name, value] of Object.entries(headers)) call.set(name, value);
    if (body !== undefined) call.send(body);
    return call;
  }
});
