import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { DeviceBearerGuard } from '../integration/device-auth/device-bearer.guard';
import { DeviceBearerRequestSourceGuard } from '../integration/device-auth/device-bearer-request-source.guard';
import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { DeviceEndpointPolicyGuard } from '../integration/auth/device-endpoint-policy.guard';
import { IntegrationPrincipalSourceGuard } from '../integration/auth/integration-principal-source.guard';
import { StorageService } from '../storage/storage.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { ZipService } from './zip.service';

const FILE_ID = '550e8400-e29b-41d4-a716-446655440000';

type ApprovedRow = {
  readonly name: string;
  readonly method: 'get' | 'post' | 'patch' | 'delete' | 'put';
  readonly path: string;
  readonly permission: 'file/read' | 'file/write' | 'file/move';
  readonly status: number;
  readonly body?: Record<string, unknown>;
  readonly serviceMethod: keyof typeof service;
  readonly legacyServiceMethod: keyof typeof service;
};

const service = {
  getFiles: jest.fn(),
  getFilesForDevice: jest.fn(),
  searchFiles: jest.fn(),
  getBadgeCounts: jest.fn(),
  getNewFiles: jest.fn(),
  markDownloaded: jest.fn(),
  getUploadPresignedUrl: jest.fn(),
  getUploadPresignedUrlForDevice: jest.fn(),
  getBatchUploadPresignedUrls: jest.fn(),
  confirmUpload: jest.fn(),
  confirmUploadForDevice: jest.fn(),
  batchConfirmUpload: jest.fn(),
  getDownloadStream: jest.fn(),
  getDownloadUrl: jest.fn(),
  renameFile: jest.fn(),
  renameFileForDevice: jest.fn(),
  moveFile: jest.fn(),
  moveFileForDevice: jest.fn(),
  batchMoveFiles: jest.fn(),
  deleteFile: jest.fn(),
  batchDeleteFiles: jest.fn(),
  getFilesForZip: jest.fn(),
};

const storage = {
  initiateMultipartUpload: jest.fn(),
  getMultipartPresignedUrl: jest.fn(),
  completeMultipartUpload: jest.fn(),
  abortMultipartUpload: jest.fn(),
};

const zip = { createZipStream: jest.fn() };

const APPROVED_ROWS: readonly ApprovedRow[] = [
  {
    name: 'GET /files',
    method: 'get',
    path: '/files',
    permission: 'file/read',
    status: 200,
    serviceMethod: 'getFilesForDevice',
    legacyServiceMethod: 'getFiles',
  },
  {
    name: 'POST /files/presigned-url',
    method: 'post',
    path: '/files/presigned-url',
    permission: 'file/write',
    status: 201,
    body: { filename: 'sample.dxf', contentType: 'application/octet-stream' },
    serviceMethod: 'getUploadPresignedUrlForDevice',
    legacyServiceMethod: 'getUploadPresignedUrl',
  },
  {
    name: 'POST /files/confirm',
    method: 'post',
    path: '/files/confirm',
    permission: 'file/write',
    status: 201,
    body: { name: 'sample.dxf' },
    serviceMethod: 'confirmUploadForDevice',
    legacyServiceMethod: 'confirmUpload',
  },
  {
    name: 'PATCH /files/:id/rename',
    method: 'patch',
    path: `/files/${FILE_ID}/rename`,
    permission: 'file/write',
    status: 200,
    body: { name: 'renamed.dxf' },
    serviceMethod: 'renameFileForDevice',
    legacyServiceMethod: 'renameFile',
  },
  {
    name: 'PATCH /files/:id/move',
    method: 'patch',
    path: `/files/${FILE_ID}/move`,
    permission: 'file/move',
    status: 200,
    body: { folderId: null },
    serviceMethod: 'moveFileForDevice',
    legacyServiceMethod: 'moveFile',
  },
];

const HELD_ROWS = [
  ['get', '/files/search'],
  ['get', '/files/badge-counts'],
  ['get', '/files/new'],
  ['post', '/files/mark-downloaded'],
  ['post', '/files/batch/upload'],
  ['post', '/files/batch/confirm'],
  ['get', `/files/${FILE_ID}/download`],
  ['get', `/files/${FILE_ID}/download/stream`],
  ['post', '/files/batch/move'],
  ['delete', `/files/${FILE_ID}`],
  ['post', '/files/batch/delete'],
  ['post', '/files/batch/download-zip'],
  ['put', '/files/google-drive/upload'],
  ['post', '/files/multipart/initiate'],
  ['post', '/files/multipart/presign'],
  ['post', '/files/multipart/complete'],
  ['post', '/files/multipart/abort'],
] as const;

describe('FilesController device endpoint policy', () => {
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
    if (cookie.includes('company-session=')) {
      req.user = { userType: 'company', userId: 4, companyId: 4 };
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
      controllers: [FilesController],
      providers: [
        Reflector,
        CompanyAccessGuard,
        IntegrationPrincipalSourceGuard,
        DeviceEndpointPolicyGuard,
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
        { provide: FilesService, useValue: service },
        { provide: StorageService, useValue: storage },
        { provide: ZipService, useValue: zip },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue(apiKeyGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    for (const mock of Object.values(service)) mock.mockResolvedValue({ ok: true });
    for (const mock of Object.values(storage)) mock.mockResolvedValue({ ok: true });
  });

  it.each(APPROVED_ROWS)('$name allows only the exact device tuple', async (row) => {
    await send(row, {
      Authorization: 'Bearer synthetic.jwt.token',
      'X-Test-Permissions': row.permission,
    }).expect(row.status);

    expect(service[row.serviceMethod]).toHaveBeenCalledTimes(1);

    const deniedHeaders: Array<Record<string, string>> = [
      { 'X-Test-Program': 'management_program', 'X-Test-Permissions': row.permission },
      { 'X-Test-Permissions': '' },
      { 'X-Test-Capability': 'safe_canary', 'X-Test-Permissions': row.permission },
      { 'X-Test-Device-State': 'revoked', 'X-Test-Permissions': row.permission },
      { 'X-Test-Device-State': 'stale', 'X-Test-Permissions': row.permission },
      { 'X-Test-Device-State': 'wrong_environment', 'X-Test-Permissions': row.permission },
      { 'X-API-Key': 'legacy-key', 'X-Test-Permissions': row.permission },
    ];

    for (const headers of deniedHeaders) {
      jest.clearAllMocks();
      await send(row, { Authorization: 'Bearer synthetic.jwt.token', ...headers }).expect((res) => {
        if (![401, 403].includes(res.status))
          throw new Error(`expected deny, received ${res.status}`);
      });
      expect(service[row.serviceMethod]).not.toHaveBeenCalled();
    }
  });

  it.each(APPROVED_ROWS)('$name preserves admin session behavior', async (row) => {
    await send(row, { Cookie: 'admin-session=synthetic' }).expect(row.status);
    expect(service[row.serviceMethod]).not.toHaveBeenCalled();
    expect(service[row.legacyServiceMethod]).toHaveBeenCalledTimes(1);
  });

  it.each(APPROVED_ROWS)('$name preserves its existing legacy API-key scope', async (row) => {
    const previouslyAllowed = row.path === '/files/presigned-url' || row.path === '/files/confirm';
    await send(row, { 'X-API-Key': 'legacy-key' }).expect(previouslyAllowed ? row.status : 403);
    expect(service[row.serviceMethod]).not.toHaveBeenCalled();
    expect(service[row.legacyServiceMethod]).toHaveBeenCalledTimes(previouslyAllowed ? 1 : 0);
  });

  it.each(HELD_ROWS)(
    '%s %s rejects device bearer before every service/storage write',
    async (method, path) => {
      await send({ method, path, body: {}, status: 403 } as ApprovedRow, {
        Authorization: 'Bearer synthetic.jwt.token',
        'X-Test-Permissions': 'file/read,file/write,file/move',
      }).expect(403);

      expect(Object.values(service).every((mock) => mock.mock.calls.length === 0)).toBe(true);
      expect(Object.values(storage).every((mock) => mock.mock.calls.length === 0)).toBe(true);
      expect(zip.createZipStream).not.toHaveBeenCalled();
    }
  );

  function send(
    row: Pick<ApprovedRow, 'method' | 'path' | 'body'>,
    headers: Record<string, string>
  ) {
    const agent = request(app.getHttpServer());
    const call =
      row.method === 'get'
        ? agent.get(row.path)
        : row.method === 'post'
          ? agent.post(row.path)
          : row.method === 'patch'
            ? agent.patch(row.path)
            : row.method === 'delete'
              ? agent.delete(row.path)
              : agent.put(row.path);
    for (const [name, value] of Object.entries(headers)) call.set(name, value);
    if (row.body !== undefined) call.send(row.body);
    return call;
  }
});
