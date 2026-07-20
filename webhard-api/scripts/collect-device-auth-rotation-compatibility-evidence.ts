import 'reflect-metadata';

import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { deserializeDeviceCredentialRotationStatus } from '../src/integration/device-auth/device-auth-rotation-compatibility';
import { DeviceAuthModule } from '../src/integration/device-auth/device-auth.module';
import { DEVICE_CREDENTIAL_ROTATION_STATUSES } from '../src/integration/device-auth/device-auth.types';
import {
  DeviceCredentialRotationBearerController,
  DeviceCredentialRotationController,
} from '../src/integration/device-auth/device-credential-rotation.controller';
import {
  createDeviceRotationFeatureGateMiddleware,
  DeviceRotationFeatureGateMiddleware,
} from '../src/integration/device-auth/device-rotation-feature-gate.middleware';

const SOURCE_DIRECTORIES = ['src', 'prisma', 'scripts'] as const;
const SOURCE_ROOT_FILES = [
  'Dockerfile',
  'jest.config.js',
  'nest-cli.json',
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.build.json',
  'tsconfig.json',
] as const;
const EXCLUDED_PATH_SEGMENTS = new Set([
  '.git',
  'coverage',
  'dist',
  'evidence',
  'node_modules',
  'secrets',
]);
const REQUIRED_NULLABLE_ROTATION_COLUMNS = [
  'baseCredentialVersion',
  'predecessorCredentialId',
  'candidateCredentialId',
  'expiredAt',
  'revokedAt',
] as const;
const INVALID_ROTATION_STATUSES = ['unknown_status', 'requested ', 'REQUESTED'] as const;
const HTTP_ROTATION_TARGETS = [
  {
    operation: 'request',
    method: 'POST',
    controller: 'DeviceCredentialRotationController',
    handler: 'request',
    controllerPath: 'integration/devices',
    handlerPath: ':id/credential-rotations',
    requestPath:
      '/api/v1/integration/devices/11111111-1111-4111-8111-111111111111/credential-rotations',
  },
  {
    operation: 'status',
    method: 'GET',
    controller: 'DeviceCredentialRotationController',
    handler: 'get',
    controllerPath: 'integration/devices',
    handlerPath: ':id/credential-rotations/:rotationId',
    requestPath:
      '/api/v1/integration/devices/11111111-1111-4111-8111-111111111111/credential-rotations/22222222-2222-4222-8222-222222222222',
  },
  {
    operation: 'cancel',
    method: 'POST',
    controller: 'DeviceCredentialRotationController',
    handler: 'cancel',
    controllerPath: 'integration/devices',
    handlerPath: ':id/credential-rotations/:rotationId/cancel',
    requestPath:
      '/api/v1/integration/devices/11111111-1111-4111-8111-111111111111/credential-rotations/22222222-2222-4222-8222-222222222222/cancel',
  },
  {
    operation: 'prepare',
    method: 'POST',
    controller: 'DeviceCredentialRotationBearerController',
    handler: 'prepare',
    controllerPath: 'integration/devices/credential-rotations',
    handlerPath: ':rotationId/prepare',
    requestPath:
      '/api/v1/integration/devices/credential-rotations/22222222-2222-4222-8222-222222222222/prepare',
  },
  {
    operation: 'ack',
    method: 'POST',
    controller: 'DeviceCredentialRotationBearerController',
    handler: 'ack',
    controllerPath: 'integration/devices/credential-rotations',
    handlerPath: ':rotationId/ack',
    requestPath:
      '/api/v1/integration/devices/credential-rotations/22222222-2222-4222-8222-222222222222/ack',
  },
] as const;

interface RuntimeDisabledBoundaryEvidence {
  readonly rotationRuntimeEnabled: false;
  readonly httpTargetsVerified: readonly string[];
  readonly responseStatus: 404;
  readonly cacheControl: 'no-store, private';
  readonly nextCalls: 0;
  readonly bodyParserCalls: 0;
  readonly controllerCalls: 0;
  readonly serviceCalls: 0;
  readonly prismaWriteCalls: 0;
  readonly moduleConsumerWiringVerified: true;
  readonly rawGateBeforeBodyParserVerified: true;
  readonly genericParserBypassVerified: true;
  readonly tokenDirectiveSuppressionGateVerified: true;
}

export interface TreeHashEvidence {
  readonly sha256: string;
  readonly fileCount: number;
}

export interface DeviceAuthRotationCompatibilityEvidence {
  readonly formatVersion: 1;
  readonly baseHead: string;
  readonly source: TreeHashEvidence;
  readonly build: TreeHashEvidence | null;
  readonly schema: {
    readonly sha256: string;
  };
  readonly compatibility: {
    readonly rotationStatuses: readonly string[];
    readonly nullableColumns: readonly string[];
  };
  readonly runtimeDisabledBoundary: RuntimeDisabledBoundaryEvidence;
  readonly result: 'compatible';
}

export interface CollectEvidenceInput {
  readonly sourceRoot: string;
  readonly baseHead?: string;
  readonly rotationRuntimeEnabled: boolean;
}

interface BuiltCompatibilityModule {
  readonly deserializeDeviceCredentialRotationStatus?: (value: unknown) => unknown;
}

interface RuntimeModuleClass {
  new (): { configure(consumer: RuntimeMiddlewareConsumer): void };
}

interface RuntimeMiddlewareConsumer {
  apply(...middleware: readonly unknown[]): {
    forRoutes(...controllers: readonly unknown[]): void;
  };
}

interface RuntimeControllerClass {
  readonly name: string;
  readonly prototype: object;
}

type RuntimeGateFactory = (options: {
  readonly rotationRuntimeEnabled: boolean;
}) => (
  request: { readonly originalUrl: string; readonly url: string; readonly method: string },
  response: RuntimeGateResponse,
  next: () => void
) => void;

interface RuntimeGateResponse {
  setHeader(name: string, value: string): void;
  status(code: number): RuntimeGateResponse;
  json(body: unknown): RuntimeGateResponse;
}

export function computeScopedSourceTreeHash(sourceRoot: string): TreeHashEvidence {
  const apiRoot = resolveApiRoot(sourceRoot);
  const files = collectScopedSourceFiles(apiRoot);
  return hashFiles(apiRoot, files);
}

export function collectDeviceAuthRotationCompatibilityEvidence(
  input: CollectEvidenceInput
): DeviceAuthRotationCompatibilityEvidence {
  assertRotationRuntimeDisabled(input.rotationRuntimeEnabled);
  const apiRoot = resolveApiRoot(input.sourceRoot);
  const schemaPath = join(apiRoot, 'prisma', 'schema.prisma');
  if (!existsSync(schemaPath)) {
    throw new Error('rotation_schema_missing');
  }

  const schema = readFileSync(schemaPath, 'utf8');
  const compatibility = verifySchemaCompatibility(schema);
  verifyStatusDeserializer(
    deserializeDeviceCredentialRotationStatus,
    'rotation_status_deserializer_incompatible'
  );
  const runtimeDisabledBoundary = verifyRuntimeDisabledBoundary({
    moduleClass: DeviceAuthModule,
    gateMiddlewareClass: DeviceRotationFeatureGateMiddleware,
    gateFactory: createDeviceRotationFeatureGateMiddleware as RuntimeGateFactory,
    adminController: DeviceCredentialRotationController,
    bearerController: DeviceCredentialRotationBearerController,
    mainSource: readFileSync(join(apiRoot, 'src', 'main.ts'), 'utf8'),
    tokenExchangeServiceSource: readFileSync(
      join(apiRoot, 'src', 'integration', 'device-auth', 'device-token-exchange.service.ts'),
      'utf8'
    ),
  });

  const distRoot = join(apiRoot, 'dist');
  return Object.freeze({
    formatVersion: 1 as const,
    baseHead: input.baseHead ?? readBaseHead(resolve(input.sourceRoot)),
    source: computeScopedSourceTreeHash(input.sourceRoot),
    build: existsSync(distRoot) ? hashDirectory(distRoot) : null,
    schema: Object.freeze({ sha256: sha256(Buffer.from(schema, 'utf8')) }),
    compatibility,
    runtimeDisabledBoundary,
    result: 'compatible' as const,
  });
}

export function verifyBuiltArtifactCompatibility(
  artifactRoot: string,
  rotationRuntimeEnabled: boolean
): {
  readonly rotationStatusesAccepted: number;
  readonly invalidStatusesRejected: number;
  readonly runtimeDisabledBoundary: RuntimeDisabledBoundaryEvidence;
} {
  assertRotationRuntimeDisabled(rotationRuntimeEnabled);
  const root = resolve(artifactRoot);
  const candidates = [
    join(
      root,
      'dist',
      'src',
      'integration',
      'device-auth',
      'device-auth-rotation-compatibility.js'
    ),
    join(root, 'dist', 'integration', 'device-auth', 'device-auth-rotation-compatibility.js'),
  ];
  const modulePath = candidates.find((candidate) => existsSync(candidate));
  if (!modulePath) {
    throw new Error('built_artifact_compatibility_module_missing');
  }

  const compatibilityModule = require(modulePath) as BuiltCompatibilityModule;
  if (typeof compatibilityModule.deserializeDeviceCredentialRotationStatus !== 'function') {
    throw new Error('built_artifact_compatibility_exports_missing');
  }
  verifyStatusDeserializer(
    compatibilityModule.deserializeDeviceCredentialRotationStatus,
    'built_artifact_rotation_status_incompatible'
  );

  const artifactSourceRoot = modulePath.startsWith(join(root, 'dist', 'src'))
    ? join(root, 'dist', 'src')
    : join(root, 'dist');
  const gateModulePath = join(
    artifactSourceRoot,
    'integration',
    'device-auth',
    'device-rotation-feature-gate.middleware.js'
  );
  const authModulePath = join(
    artifactSourceRoot,
    'integration',
    'device-auth',
    'device-auth.module.js'
  );
  const controllerModulePath = join(
    artifactSourceRoot,
    'integration',
    'device-auth',
    'device-credential-rotation.controller.js'
  );
  if (
    !existsSync(gateModulePath) ||
    !existsSync(authModulePath) ||
    !existsSync(controllerModulePath)
  ) {
    throw new Error('built_artifact_runtime_boundary_missing');
  }
  const gateModule = require(gateModulePath) as {
    readonly DeviceRotationFeatureGateMiddleware?: unknown;
    readonly createDeviceRotationFeatureGateMiddleware?: RuntimeGateFactory;
  };
  const authModule = require(authModulePath) as { readonly DeviceAuthModule?: RuntimeModuleClass };
  const controllerModule = require(controllerModulePath) as {
    readonly DeviceCredentialRotationController?: RuntimeControllerClass;
    readonly DeviceCredentialRotationBearerController?: RuntimeControllerClass;
  };
  if (
    typeof gateModule.DeviceRotationFeatureGateMiddleware !== 'function' ||
    typeof gateModule.createDeviceRotationFeatureGateMiddleware !== 'function' ||
    typeof authModule.DeviceAuthModule !== 'function' ||
    typeof controllerModule.DeviceCredentialRotationController !== 'function' ||
    typeof controllerModule.DeviceCredentialRotationBearerController !== 'function'
  ) {
    throw new Error('built_artifact_runtime_boundary_missing');
  }

  const mainPath = join(artifactSourceRoot, 'main.js');
  const tokenServicePath = join(
    artifactSourceRoot,
    'integration',
    'device-auth',
    'device-token-exchange.service.js'
  );
  if (!existsSync(mainPath) || !existsSync(tokenServicePath)) {
    throw new Error('built_artifact_runtime_boundary_missing');
  }
  const runtimeDisabledBoundary = verifyRuntimeDisabledBoundary({
    moduleClass: authModule.DeviceAuthModule,
    gateMiddlewareClass: gateModule.DeviceRotationFeatureGateMiddleware,
    gateFactory: gateModule.createDeviceRotationFeatureGateMiddleware,
    adminController: controllerModule.DeviceCredentialRotationController,
    bearerController: controllerModule.DeviceCredentialRotationBearerController,
    mainSource: readFileSync(mainPath, 'utf8'),
    tokenExchangeServiceSource: readFileSync(tokenServicePath, 'utf8'),
  });

  return Object.freeze({
    rotationStatusesAccepted: DEVICE_CREDENTIAL_ROTATION_STATUSES.length,
    invalidStatusesRejected: INVALID_ROTATION_STATUSES.length,
    runtimeDisabledBoundary,
  });
}

function verifyStatusDeserializer(
  deserialize: (value: unknown) => unknown,
  errorCode: string
): void {
  for (const status of DEVICE_CREDENTIAL_ROTATION_STATUSES) {
    if (deserialize(status) !== status) {
      throw new Error(errorCode);
    }
  }
  for (const invalidStatus of INVALID_ROTATION_STATUSES) {
    let rejected = false;
    try {
      deserialize(invalidStatus);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error(errorCode);
    }
  }
}

function verifyRuntimeDisabledBoundary(input: {
  readonly moduleClass: RuntimeModuleClass;
  readonly gateMiddlewareClass: unknown;
  readonly gateFactory: RuntimeGateFactory;
  readonly adminController: RuntimeControllerClass;
  readonly bearerController: RuntimeControllerClass;
  readonly mainSource: string;
  readonly tokenExchangeServiceSource: string;
}): RuntimeDisabledBoundaryEvidence {
  verifyModuleConsumerWiring(input);
  verifyControllerMetadata(input.adminController, input.bearerController);

  let nextCalls = 0;
  let bodyParserCalls = 0;
  let controllerCalls = 0;
  let serviceCalls = 0;
  let prismaWriteCalls = 0;
  const verifiedTargets: string[] = [];
  for (const target of HTTP_ROTATION_TARGETS) {
    let responseStatus: number | undefined;
    let cacheControl: string | undefined;
    let responseBody: unknown;
    const response: RuntimeGateResponse = {
      setHeader(name, value) {
        if (name.toLowerCase() === 'cache-control') cacheControl = value;
      },
      status(code) {
        responseStatus = code;
        return response;
      },
      json(body) {
        responseBody = body;
        return response;
      },
    };
    const next = (): void => {
      nextCalls += 1;
      bodyParserCalls += 1;
      controllerCalls += 1;
      serviceCalls += 1;
      prismaWriteCalls += 1;
    };
    input.gateFactory({ rotationRuntimeEnabled: false })(
      {
        originalUrl: target.requestPath,
        url: target.requestPath,
        method: target.method,
      },
      response,
      next
    );
    if (
      responseStatus !== 404 ||
      cacheControl !== 'no-store, private' ||
      !isNotFoundBody(responseBody)
    ) {
      throw new Error('rotation_runtime_disabled_http_boundary_invalid');
    }
    verifiedTargets.push(target.operation);
  }

  if (
    nextCalls !== 0 ||
    bodyParserCalls !== 0 ||
    controllerCalls !== 0 ||
    serviceCalls !== 0 ||
    prismaWriteCalls !== 0
  ) {
    throw new Error('rotation_runtime_disabled_downstream_reached');
  }

  const rawGateBeforeBodyParserVerified = verifyRawGateBeforeBodyParser(input.mainSource);
  const genericParserBypassVerified = verifyGenericParserBypass(input.mainSource);
  const tokenDirectiveSuppressionGateVerified = verifyTokenDirectiveSuppressionGate(
    input.tokenExchangeServiceSource
  );

  return Object.freeze({
    rotationRuntimeEnabled: false as const,
    httpTargetsVerified: Object.freeze(verifiedTargets),
    responseStatus: 404 as const,
    cacheControl: 'no-store, private' as const,
    nextCalls: 0 as const,
    bodyParserCalls: 0 as const,
    controllerCalls: 0 as const,
    serviceCalls: 0 as const,
    prismaWriteCalls: 0 as const,
    moduleConsumerWiringVerified: true as const,
    rawGateBeforeBodyParserVerified,
    genericParserBypassVerified,
    tokenDirectiveSuppressionGateVerified,
  });
}

function verifyModuleConsumerWiring(input: {
  readonly moduleClass: RuntimeModuleClass;
  readonly gateMiddlewareClass: unknown;
  readonly adminController: RuntimeControllerClass;
  readonly bearerController: RuntimeControllerClass;
}): void {
  const applications: Array<{
    readonly middleware: readonly unknown[];
    readonly controllers: readonly unknown[];
  }> = [];
  const consumer: RuntimeMiddlewareConsumer = {
    apply(...middleware) {
      return {
        forRoutes(...controllers): void {
          applications.push({ middleware, controllers });
        },
      };
    },
  };
  new input.moduleClass().configure(consumer);
  const gateApplication = applications.find((application) =>
    application.middleware.includes(input.gateMiddlewareClass)
  );
  if (
    !gateApplication ||
    gateApplication.controllers.length !== 2 ||
    gateApplication.controllers[0] !== input.adminController ||
    gateApplication.controllers[1] !== input.bearerController
  ) {
    throw new Error('rotation_runtime_disabled_module_wiring_invalid');
  }
}

function verifyControllerMetadata(
  adminController: RuntimeControllerClass,
  bearerController: RuntimeControllerClass
): void {
  const controllers = new Map<string, RuntimeControllerClass>([
    [adminController.name, adminController],
    [bearerController.name, bearerController],
  ]);
  for (const target of HTTP_ROTATION_TARGETS) {
    const controller = controllers.get(target.controller);
    const handler = (controller?.prototype as Record<string, unknown> | undefined)?.[
      target.handler
    ];
    if (!controller || typeof handler !== 'function') {
      throw new Error('rotation_controller_metadata_invalid');
    }
    const controllerPath = Reflect.getMetadata('path', controller) as unknown;
    const handlerPath = Reflect.getMetadata('path', handler) as unknown;
    const requestMethod = Reflect.getMetadata('method', handler) as unknown;
    if (
      controllerPath !== target.controllerPath ||
      handlerPath !== target.handlerPath ||
      requestMethodToName(requestMethod) !== target.method
    ) {
      throw new Error('rotation_controller_metadata_invalid');
    }
  }
}

function requestMethodToName(value: unknown): 'GET' | 'POST' | undefined {
  if (value === 0) return 'GET';
  if (value === 1) return 'POST';
  return undefined;
}

function verifyRawGateBeforeBodyParser(mainSource: string): true {
  const gateMatch =
    /rawExpressApp\.use\([^;\n]*createDeviceRotationFeatureGateMiddleware[^;\n]*rotationOptions[^;\n]*\)/u.exec(
      mainSource
    );
  const parserMatch =
    /rawExpressApp\.use\([^;\n]*skipBodyParserForDriveUpload[^;\n]*(?:json|urlencoded)[^;\n]*\)/u.exec(
      mainSource
    );
  if (!gateMatch || !parserMatch || gateMatch.index >= parserMatch.index) {
    throw new Error('rotation_raw_gate_order_invalid');
  }
  return true;
}

function verifyGenericParserBypass(mainSource: string): true {
  if (
    !mainSource.includes('isDeviceRotationAdminRequest(req)') &&
    !mainSource.includes('isDeviceRotationAdminRequest)(req)')
  ) {
    throw new Error('rotation_generic_parser_bypass_missing');
  }
  return true;
}

function verifyTokenDirectiveSuppressionGate(tokenServiceSource: string): true {
  if (
    !/rotationOptions\.rotationRuntimeEnabled[\s\S]{0,1800}\?[^:]+deviceCredentialRotation\.findFirst[\s\S]{0,1800}: null/u.test(
      tokenServiceSource
    )
  ) {
    throw new Error('rotation_token_directive_suppression_gate_missing');
  }
  return true;
}

function isNotFoundBody(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).statusCode === 404 &&
    (value as Record<string, unknown>).message === 'Not Found'
  );
}

function verifySchemaCompatibility(schema: string): {
  readonly rotationStatuses: readonly string[];
  readonly nullableColumns: readonly string[];
} {
  const enumValues = extractBlock(schema, 'enum', 'DeviceCredentialRotationStatus')
    .split(/\r?\n/u)
    .map(
      (line) =>
        line
          .replace(/\/\/.*$/u, '')
          .trim()
          .split(/\s+/u)[0]
    )
    .filter((value) => value.length > 0);
  if (
    enumValues.length !== DEVICE_CREDENTIAL_ROTATION_STATUSES.length ||
    enumValues.some((value, index) => value !== DEVICE_CREDENTIAL_ROTATION_STATUSES[index])
  ) {
    throw new Error('rotation_schema_incompatible');
  }

  const model = extractBlock(schema, 'model', 'DeviceCredentialRotation');
  for (const column of REQUIRED_NULLABLE_ROTATION_COLUMNS) {
    const nullableField = new RegExp(`^\\s*${column}\\s+\\w+\\?`, 'mu');
    if (!nullableField.test(model)) {
      throw new Error('rotation_schema_incompatible');
    }
  }

  return Object.freeze({
    rotationStatuses: Object.freeze([...DEVICE_CREDENTIAL_ROTATION_STATUSES]),
    nullableColumns: Object.freeze([...REQUIRED_NULLABLE_ROTATION_COLUMNS]),
  });
}

function extractBlock(schema: string, kind: 'enum' | 'model', name: string): string {
  const match = new RegExp(`${kind}\\s+${name}\\s*\\{([\\s\\S]*?)\\}`, 'u').exec(schema);
  if (!match) {
    throw new Error('rotation_schema_incompatible');
  }
  return match[1];
}

function resolveApiRoot(sourceRoot: string): string {
  const root = resolve(sourceRoot);
  const nested = join(root, 'webhard-api');
  if (existsSync(join(nested, 'package.json'))) {
    return nested;
  }
  if (existsSync(join(root, 'package.json'))) {
    return root;
  }
  throw new Error('source_root_invalid');
}

function collectScopedSourceFiles(apiRoot: string): string[] {
  const files: string[] = [];
  for (const directory of SOURCE_DIRECTORIES) {
    const path = join(apiRoot, directory);
    if (existsSync(path)) {
      walkFiles(apiRoot, path, files);
    }
  }
  for (const file of SOURCE_ROOT_FILES) {
    const path = join(apiRoot, file);
    if (existsSync(path) && lstatSync(path).isFile()) {
      files.push(path);
    }
  }
  files.sort((left, right) =>
    normalizeRelative(apiRoot, left).localeCompare(normalizeRelative(apiRoot, right), 'en')
  );
  return files;
}

function walkFiles(apiRoot: string, directory: string, files: string[]): void {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name, 'en')
  );
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const relativePath = normalizeRelative(apiRoot, path);
    if (shouldExclude(relativePath)) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      throw new Error('source_scope_symlink_not_allowed');
    }
    if (entry.isDirectory()) {
      walkFiles(apiRoot, path, files);
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
}

function shouldExclude(relativePath: string): boolean {
  const segments = relativePath.split('/');
  return segments.some(
    (segment) => segment.startsWith('.env') || EXCLUDED_PATH_SEGMENTS.has(segment.toLowerCase())
  );
}

function hashDirectory(root: string): TreeHashEvidence {
  const files: string[] = [];
  walkFiles(root, root, files);
  files.sort((left, right) =>
    normalizeRelative(root, left).localeCompare(normalizeRelative(root, right), 'en')
  );
  return hashFiles(root, files);
}

function hashFiles(root: string, files: readonly string[]): TreeHashEvidence {
  const hash = createHash('sha256');
  for (const path of files) {
    const content = readFileSync(path);
    hash.update(normalizeRelative(root, path), 'utf8');
    hash.update('\0');
    hash.update(String(content.byteLength), 'utf8');
    hash.update('\0');
    hash.update(content);
    hash.update('\0');
  }
  return Object.freeze({ sha256: hash.digest('hex'), fileCount: files.length });
}

function normalizeRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

function assertRotationRuntimeDisabled(
  rotationRuntimeEnabled: boolean
): asserts rotationRuntimeEnabled is false {
  if (rotationRuntimeEnabled) {
    throw new Error('rotation_runtime_must_be_disabled');
  }
}

function readBaseHead(workspaceRoot: string): string {
  const gitEntry = join(workspaceRoot, '.git');
  if (!existsSync(gitEntry)) {
    throw new Error('base_head_unavailable');
  }
  const stat = lstatSync(gitEntry);
  const gitDirectory = stat.isDirectory()
    ? gitEntry
    : resolveGitDirectory(workspaceRoot, readFileSync(gitEntry, 'utf8'));
  const head = readFileSync(join(gitDirectory, 'HEAD'), 'utf8').trim();
  if (/^[0-9a-f]{40}$/u.test(head)) {
    return head;
  }
  if (!head.startsWith('ref: ')) {
    throw new Error('base_head_unavailable');
  }
  const reference = head.slice(5);
  const directReference = join(gitDirectory, ...reference.split('/'));
  if (existsSync(directReference)) {
    return validateHead(readFileSync(directReference, 'utf8').trim());
  }
  const commonDirectory = readCommonDirectory(gitDirectory);
  const commonReference = join(commonDirectory, ...reference.split('/'));
  if (existsSync(commonReference)) {
    return validateHead(readFileSync(commonReference, 'utf8').trim());
  }
  const packedRefs = join(commonDirectory, 'packed-refs');
  if (existsSync(packedRefs)) {
    const line = readFileSync(packedRefs, 'utf8')
      .split(/\r?\n/u)
      .find((candidate) => candidate.endsWith(` ${reference}`));
    if (line) {
      return validateHead(line.split(' ')[0]);
    }
  }
  throw new Error('base_head_unavailable');
}

function resolveGitDirectory(workspaceRoot: string, gitFile: string): string {
  const match = /^gitdir:\s*(.+)$/mu.exec(gitFile);
  if (!match) {
    throw new Error('base_head_unavailable');
  }
  return isAbsolute(match[1]) ? resolve(match[1]) : resolve(workspaceRoot, match[1]);
}

function readCommonDirectory(gitDirectory: string): string {
  const commonDirPath = join(gitDirectory, 'commondir');
  return existsSync(commonDirPath)
    ? resolve(gitDirectory, readFileSync(commonDirPath, 'utf8').trim())
    : gitDirectory;
}

function validateHead(value: string): string {
  if (!/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error('base_head_unavailable');
  }
  return value;
}

function parseBooleanArgument(value: string | undefined): boolean {
  if (value === 'false') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  throw new Error('rotation_runtime_argument_invalid');
}

function readArgument(argumentsList: readonly string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = argumentsList.find((argument) => argument.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = argumentsList.indexOf(name);
  return index >= 0 ? argumentsList[index + 1] : undefined;
}

function main(argumentsList: readonly string[]): void {
  const rotationRuntimeEnabled = parseBooleanArgument(
    readArgument(argumentsList, '--rotation-runtime-enabled') ?? 'false'
  );
  if (argumentsList.includes('--verify-built-artifact')) {
    const result = verifyBuiltArtifactCompatibility(process.cwd(), rotationRuntimeEnabled);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  const sourceRoot = resolve(readArgument(argumentsList, '--source-root') ?? '..');
  if (argumentsList.includes('--source-hash-only')) {
    process.stdout.write(`${computeScopedSourceTreeHash(sourceRoot).sha256}\n`);
    return;
  }
  const evidence = collectDeviceAuthRotationCompatibilityEvidence({
    sourceRoot,
    rotationRuntimeEnabled,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : 'compatibility_evidence_failed';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  }
}
