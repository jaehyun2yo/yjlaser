import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  collectDeviceAuthRotationCompatibilityEvidence,
  computeScopedSourceTreeHash,
  verifyBuiltArtifactCompatibility,
} from './collect-device-auth-rotation-compatibility-evidence';

function write(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

const compatibleSchema = `
enum DeviceCredentialRotationStatus {
  requested
  prepared
  acknowledged
  timed_out
  cancelled
  expired
  revoked
}

model DeviceCredentialRotation {
  baseCredentialVersion   Int?
  predecessorCredentialId String?
  candidateCredentialId   String?
  expiredAt                DateTime?
  revokedAt                DateTime?
}
`;

const nullableColumns = [
  'baseCredentialVersion',
  'predecessorCredentialId',
  'candidateCredentialId',
  'expiredAt',
  'revokedAt',
] as const;

describe('device-auth rotation compatibility evidence collector', () => {
  it('hashes the exact central source scope deterministically, including untracked files and excluding sensitive/output paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'device-auth-source-hash-'));
    write(root, 'webhard-api/src/tracked.ts', 'tracked');
    write(root, 'webhard-api/src/untracked-task-6.ts', 'untracked');
    write(root, 'webhard-api/prisma/schema.prisma', compatibleSchema);
    write(root, 'webhard-api/package.json', '{}');
    write(root, 'webhard-api/.env.local', 'DO_NOT_HASH=one');
    write(root, 'webhard-api/secrets/private.txt', 'DO_NOT_HASH=two');
    write(root, 'webhard-api/node_modules/dependency/index.js', 'DO_NOT_HASH=three');
    write(root, 'webhard-api/dist/main.js', 'DO_NOT_HASH=four');
    write(
      root,
      '.superpowers/sdd/device-auth-rotation-compatibility-evidence.json',
      'DO_NOT_HASH=five'
    );

    const first = computeScopedSourceTreeHash(root);
    const second = computeScopedSourceTreeHash(root);

    expect(second).toEqual(first);
    expect(first.fileCount).toBe(4);

    write(root, 'webhard-api/.env.local', 'CHANGED');
    write(root, 'webhard-api/dist/main.js', 'CHANGED');
    expect(computeScopedSourceTreeHash(root)).toEqual(first);

    write(root, 'webhard-api/src/untracked-task-6.ts', 'changed included source');
    expect(computeScopedSourceTreeHash(root).sha256).not.toBe(first.sha256);
  });

  it('locks every rotation status and nullable compatibility column while runtime writes stay disabled', () => {
    const root = mkdtempSync(join(tmpdir(), 'device-auth-compat-'));
    write(root, 'webhard-api/src/source.ts', 'source');
    write(root, 'webhard-api/prisma/schema.prisma', compatibleSchema);
    write(root, 'webhard-api/package.json', '{}');
    write(
      root,
      'webhard-api/src/main.ts',
      `const shouldSkipBodyParser = req => isDeviceRotationAdminRequest(req);
rawExpressApp.use(createDeviceRotationFeatureGateMiddleware(rotationOptions));
rawExpressApp.use(skipBodyParserForDriveUpload(json({ limit: '10mb' })));`
    );
    write(
      root,
      'webhard-api/src/integration/device-auth/device-token-exchange.service.ts',
      `const liveRotation = this.rotationOptions.rotationRuntimeEnabled
  ? await transaction.deviceCredentialRotation.findFirst({ where: {} })
  : null;`
    );

    const evidence = collectDeviceAuthRotationCompatibilityEvidence({
      sourceRoot: root,
      baseHead: 'synthetic-head',
      rotationRuntimeEnabled: false,
    });

    expect(evidence.compatibility.rotationStatuses).toEqual([
      'requested',
      'prepared',
      'acknowledged',
      'timed_out',
      'cancelled',
      'expired',
      'revoked',
    ]);
    expect(evidence.compatibility.nullableColumns).toEqual([
      'baseCredentialVersion',
      'predecessorCredentialId',
      'candidateCredentialId',
      'expiredAt',
      'revokedAt',
    ]);
    expect(evidence.runtimeDisabledBoundary).toEqual({
      rotationRuntimeEnabled: false,
      httpTargetsVerified: ['request', 'status', 'cancel', 'prepare', 'ack'],
      responseStatus: 404,
      cacheControl: 'no-store, private',
      nextCalls: 0,
      bodyParserCalls: 0,
      controllerCalls: 0,
      serviceCalls: 0,
      prismaWriteCalls: 0,
      moduleConsumerWiringVerified: true,
      rawGateBeforeBodyParserVerified: true,
      genericParserBypassVerified: true,
      tokenDirectiveSuppressionGateVerified: true,
    });
    expect(JSON.stringify(evidence)).not.toMatch(/credential-value|token=|api[_-]?key=/i);
  });

  it.each(nullableColumns)(
    'fails independently when nullable compatibility column %s is missing',
    (column) => {
      const root = mkdtempSync(join(tmpdir(), 'device-auth-nullable-missing-'));
      write(root, 'webhard-api/src/source.ts', 'source');
      write(
        root,
        'webhard-api/prisma/schema.prisma',
        compatibleSchema.replace(new RegExp(`^\\s*${column}\\s+\\w+\\?\\s*$`, 'mu'), '')
      );
      write(root, 'webhard-api/package.json', '{}');

      expect(() =>
        collectDeviceAuthRotationCompatibilityEvidence({
          sourceRoot: root,
          baseHead: 'synthetic-head',
          rotationRuntimeEnabled: false,
        })
      ).toThrow('rotation_schema_incompatible');
    }
  );

  it.each(nullableColumns)(
    'fails independently when compatibility column %s becomes non-nullable',
    (column) => {
      const root = mkdtempSync(join(tmpdir(), 'device-auth-nullable-required-'));
      write(root, 'webhard-api/src/source.ts', 'source');
      write(
        root,
        'webhard-api/prisma/schema.prisma',
        compatibleSchema.replace(new RegExp(`(^\\s*${column}\\s+\\w+)\\?`, 'mu'), '$1')
      );
      write(root, 'webhard-api/package.json', '{}');

      expect(() =>
        collectDeviceAuthRotationCompatibilityEvidence({
          sourceRoot: root,
          baseHead: 'synthetic-head',
          rotationRuntimeEnabled: false,
        })
      ).toThrow('rotation_schema_incompatible');
    }
  );

  it.each([
    ['additional', compatibleSchema.replace('  revoked\n', '  revoked\n  superseded\n')],
    ['mutated', compatibleSchema.replace('  timed_out\n', '  timedout\n')],
  ])('fails closed for an %s schema rotation status', (_label, schema) => {
    const root = mkdtempSync(join(tmpdir(), 'device-auth-status-schema-'));
    write(root, 'webhard-api/src/source.ts', 'source');
    write(root, 'webhard-api/prisma/schema.prisma', schema);
    write(root, 'webhard-api/package.json', '{}');

    expect(() =>
      collectDeviceAuthRotationCompatibilityEvidence({
        sourceRoot: root,
        baseHead: 'synthetic-head',
        rotationRuntimeEnabled: false,
      })
    ).toThrow('rotation_schema_incompatible');
  });

  it('fails closed when compatibility is missing or rotation runtime is enabled', () => {
    const root = mkdtempSync(join(tmpdir(), 'device-auth-incompatible-'));
    write(root, 'webhard-api/src/source.ts', 'source');
    write(root, 'webhard-api/prisma/schema.prisma', compatibleSchema.replace('  revoked\n', ''));
    write(root, 'webhard-api/package.json', '{}');

    expect(() =>
      collectDeviceAuthRotationCompatibilityEvidence({
        sourceRoot: root,
        baseHead: 'synthetic-head',
        rotationRuntimeEnabled: false,
      })
    ).toThrow('rotation_schema_incompatible');

    write(root, 'webhard-api/prisma/schema.prisma', compatibleSchema);
    expect(() =>
      collectDeviceAuthRotationCompatibilityEvidence({
        sourceRoot: root,
        baseHead: 'synthetic-head',
        rotationRuntimeEnabled: true,
      })
    ).toThrow('rotation_runtime_must_be_disabled');
  });

  it('fails closed when a built artifact is absent and verifies a synthetic compiled compatibility module without starting a process', () => {
    const root = mkdtempSync(join(tmpdir(), 'device-auth-built-artifact-'));
    expect(() => verifyBuiltArtifactCompatibility(root, false)).toThrow(
      'built_artifact_compatibility_module_missing'
    );

    write(
      root,
      'dist/src/integration/device-auth/device-auth-rotation-compatibility.js',
      `const statuses = new Set(['requested','prepared','acknowledged','timed_out','cancelled','expired','revoked']);
exports.deserializeDeviceCredentialRotationStatus = value => {
  if (!statuses.has(value)) throw new Error('device_rotation_incompatible');
  return value;
};`
    );

    expect(() => verifyBuiltArtifactCompatibility(root, false)).toThrow(
      'built_artifact_runtime_boundary_missing'
    );

    write(
      root,
      'dist/src/integration/device-auth/device-rotation-feature-gate.middleware.js',
      `exports.DeviceRotationFeatureGateMiddleware = class DeviceRotationFeatureGateMiddleware {};
exports.createDeviceRotationFeatureGateMiddleware = () => (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.status(404).json({ statusCode: 404, message: 'Not Found' });
};`
    );
    write(
      root,
      'dist/src/integration/device-auth/device-auth.module.js',
      `const gate = require('./device-rotation-feature-gate.middleware.js');
const controllers = require('./device-credential-rotation.controller.js');
exports.DeviceAuthModule = class DeviceAuthModule {
  configure(consumer) {
    consumer.apply(gate.DeviceRotationFeatureGateMiddleware).forRoutes(
      controllers.DeviceCredentialRotationController,
      controllers.DeviceCredentialRotationBearerController
    );
  }
};`
    );
    write(
      root,
      'dist/src/integration/device-auth/device-credential-rotation.controller.js',
      `class DeviceCredentialRotationController {}
class DeviceCredentialRotationBearerController {}
Reflect.defineMetadata('path', 'integration/devices', DeviceCredentialRotationController);
Reflect.defineMetadata('path', 'integration/devices/credential-rotations', DeviceCredentialRotationBearerController);
for (const [Controller, handler, method, path] of [
  [DeviceCredentialRotationController, 'request', 1, ':id/credential-rotations'],
  [DeviceCredentialRotationController, 'get', 0, ':id/credential-rotations/:rotationId'],
  [DeviceCredentialRotationController, 'cancel', 1, ':id/credential-rotations/:rotationId/cancel'],
  [DeviceCredentialRotationBearerController, 'prepare', 1, ':rotationId/prepare'],
  [DeviceCredentialRotationBearerController, 'ack', 1, ':rotationId/ack']
]) {
  Controller.prototype[handler] = function () {};
  Reflect.defineMetadata('path', path, Controller.prototype[handler]);
  Reflect.defineMetadata('method', method, Controller.prototype[handler]);
}
exports.DeviceCredentialRotationController = DeviceCredentialRotationController;
exports.DeviceCredentialRotationBearerController = DeviceCredentialRotationBearerController;`
    );
    write(
      root,
      'dist/src/integration/device-auth/device-token-exchange.service.js',
      `async function loadDirective(transaction) {
  const liveRotation = this.rotationOptions.rotationRuntimeEnabled
    ? await transaction.deviceCredentialRotation.findFirst({ where: {} })
    : null;
  return liveRotation;
}
exports.loadDirective = loadDirective;`
    );
    write(
      root,
      'dist/src/main.js',
      `rawExpressApp.use(createDeviceRotationFeatureGateMiddleware(rotationOptions));
const shouldSkipBodyParser = req => isDeviceRotationAdminRequest(req);
rawExpressApp.use(skipBodyParserForDriveUpload(json({ limit: '10mb' })));`
    );

    expect(verifyBuiltArtifactCompatibility(root, false)).toMatchObject({
      rotationStatusesAccepted: 7,
      invalidStatusesRejected: 3,
      runtimeDisabledBoundary: {
        httpTargetsVerified: ['request', 'status', 'cancel', 'prepare', 'ack'],
        responseStatus: 404,
        nextCalls: 0,
        bodyParserCalls: 0,
        controllerCalls: 0,
        serviceCalls: 0,
        prismaWriteCalls: 0,
        moduleConsumerWiringVerified: true,
        rawGateBeforeBodyParserVerified: true,
        genericParserBypassVerified: true,
        tokenDirectiveSuppressionGateVerified: true,
      },
    });
    expect(() => verifyBuiltArtifactCompatibility(root, true)).toThrow(
      'rotation_runtime_must_be_disabled'
    );
  });
});
