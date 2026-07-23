import { NESTJS_CLIENT_API_BASE } from '@/lib/api/api-base';
import type { DeviceAuthEnvironment } from '@/app/(admin)/admin/integration/devices/_lib/device-auth-environment';

const DEVICE_ENROLLMENT_CODE_ENDPOINT = `${NESTJS_CLIENT_API_BASE}/integration/devices/enrollment-codes`;
const DEVICE_ENROLLMENT_CSRF_ENDPOINT = `${NESTJS_CLIENT_API_BASE}/integration/devices/csrf`;
const DEVICE_MANAGEMENT_ENDPOINT = `${NESTJS_CLIENT_API_BASE}/integration/devices`;
const DEVICE_RUNTIME_ENVIRONMENT_ENDPOINT = `${DEVICE_MANAGEMENT_ENDPOINT}/runtime-environment`;
const DEVICE_AUTH_EXPECTED_ENVIRONMENT_HEADER = 'x-device-auth-environment';
const DEVICE_MANAGEMENT_STATES = ['pending_approval', 'active', 'revoked'] as const;
const DEVICE_ROTATION_STATUSES = [
  'requested',
  'prepared',
  'acknowledged',
  'timed_out',
  'cancelled',
  'expired',
  'revoked',
] as const;
const CANONICAL_DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CANONICAL_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;
const SEMVER_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*))(?:\.(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*)))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const ENROLLMENT_CODE_RESPONSE_KEYS = [
  'enrollmentCode',
  'enrollmentId',
  'environment',
  'programType',
  'capabilityProfile',
  'expiresAt',
] as const;

const csrfBootstrapPromises = new Map<DeviceAuthEnvironment, Promise<string>>();

export const DEVICE_ENROLLMENT_PROGRAM_TYPES = [
  'external_webhard_sync',
  'management_program',
  'nesting_program',
] as const;

export const DEVICE_ENROLLMENT_CAPABILITY_PROFILES = ['standard', 'safe_canary'] as const;

export type DeviceEnrollmentProgramType = (typeof DEVICE_ENROLLMENT_PROGRAM_TYPES)[number];
export type DeviceEnrollmentCapabilityProfile =
  (typeof DEVICE_ENROLLMENT_CAPABILITY_PROFILES)[number];

export interface CreateDeviceEnrollmentCodeInput {
  readonly programType: DeviceEnrollmentProgramType;
  readonly capabilityProfile: DeviceEnrollmentCapabilityProfile;
  readonly expectedDisplayName: string;
}

export interface DeviceEnrollmentCodeResponse {
  readonly enrollmentCode: string;
  readonly enrollmentId: string;
  readonly environment: DeviceAuthEnvironment;
  readonly programType: DeviceEnrollmentProgramType;
  readonly capabilityProfile: DeviceEnrollmentCapabilityProfile;
  readonly expiresAt: string;
}

export type DeviceEnrollmentState = (typeof DEVICE_MANAGEMENT_STATES)[number];

export interface DeviceEnrollmentStatus {
  readonly deviceId: string;
  readonly environment: DeviceAuthEnvironment;
  readonly programType: DeviceEnrollmentProgramType;
  readonly capabilityProfile: DeviceEnrollmentCapabilityProfile;
  readonly state: DeviceEnrollmentState;
  readonly credentialVersion: number;
}

export interface ManagedDeviceSummary extends DeviceEnrollmentStatus {
  readonly displayName: string;
  readonly appVersion?: string;
  readonly enrolledAt: string;
  readonly approvedAt?: string;
  readonly lastHeartbeatAt?: string;
  readonly revokedAt?: string;
}

export type DeviceRotationStatus = (typeof DEVICE_ROTATION_STATUSES)[number];

export interface DeviceRotationSummary {
  readonly id: string;
  readonly deviceId: string;
  readonly status: DeviceRotationStatus;
  readonly deadlineAt: string;
  readonly credentialVersion?: number;
}

export interface ListManagedDevicesOptions {
  readonly expectedEnvironment: DeviceAuthEnvironment;
  readonly signal?: AbortSignal;
}

export interface GetDeviceAuthRuntimeEnvironmentOptions {
  readonly signal?: AbortSignal;
}

export class DeviceEnrollmentCodeRequestError extends Error {
  public constructor(status?: number) {
    super(
      status === undefined
        ? '장치 인증 코드 발급 요청에 실패했습니다.'
        : `장치 인증 코드 발급 요청에 실패했습니다. (HTTP ${status})`
    );
    this.name = 'DeviceEnrollmentCodeRequestError';
  }
}

export class DeviceManagementRequestError extends Error {
  public constructor() {
    super('장치 관리 요청에 실패했습니다. 다시 시도하세요.');
    this.name = 'DeviceManagementRequestError';
  }
}

function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;

  const rawToken = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/)?.[1];
  if (!rawToken) return undefined;

  try {
    return decodeURIComponent(rawToken);
  } catch {
    return undefined;
  }
}

async function ensureCsrfToken(expectedEnvironment: DeviceAuthEnvironment): Promise<string> {
  const existingToken = getCsrfToken();
  if (existingToken) return existingToken;

  let bootstrapPromise = csrfBootstrapPromises.get(expectedEnvironment);
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapCsrfToken(expectedEnvironment);
    csrfBootstrapPromises.set(expectedEnvironment, bootstrapPromise);
  }

  try {
    return await bootstrapPromise;
  } finally {
    if (csrfBootstrapPromises.get(expectedEnvironment) === bootstrapPromise) {
      csrfBootstrapPromises.delete(expectedEnvironment);
    }
  }
}

async function bootstrapCsrfToken(expectedEnvironment: DeviceAuthEnvironment): Promise<string> {
  const response = await fetch(DEVICE_ENROLLMENT_CSRF_ENDPOINT, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      [DEVICE_AUTH_EXPECTED_ENVIRONMENT_HEADER]: expectedEnvironment,
    },
  });

  if (!response.ok) {
    throw new DeviceEnrollmentCodeRequestError(response.status);
  }

  const csrfToken = getCsrfToken();
  if (!csrfToken) {
    throw new DeviceEnrollmentCodeRequestError();
  }

  return csrfToken;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProgramType(value: unknown): value is DeviceEnrollmentProgramType {
  return (
    typeof value === 'string' &&
    DEVICE_ENROLLMENT_PROGRAM_TYPES.includes(value as DeviceEnrollmentProgramType)
  );
}

function isCapabilityProfile(value: unknown): value is DeviceEnrollmentCapabilityProfile {
  return (
    typeof value === 'string' &&
    DEVICE_ENROLLMENT_CAPABILITY_PROFILES.includes(value as DeviceEnrollmentCapabilityProfile)
  );
}

function isDeviceEnrollmentState(value: unknown): value is DeviceEnrollmentState {
  return (
    typeof value === 'string' && DEVICE_MANAGEMENT_STATES.includes(value as DeviceEnrollmentState)
  );
}

function isDeviceRotationStatus(value: unknown): value is DeviceRotationStatus {
  return (
    typeof value === 'string' && DEVICE_ROTATION_STATUSES.includes(value as DeviceRotationStatus)
  );
}

function isDeviceEnvironment(value: unknown): value is DeviceAuthEnvironment {
  return value === 'dev' || value === 'stg' || value === 'prd';
}

function isCredentialVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCanonicalDeviceId(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_DEVICE_ID_PATTERN.test(value);
}

function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_UTC_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }

  return new Date(value).toISOString() === value;
}

function assertOnlyAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): void {
  if (!hasOnlyAllowedKeys(value, allowedKeys)) {
    throw new DeviceManagementRequestError();
  }
}

function hasOnlyAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function parseOptionalTimestamp(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (!isCanonicalUtcTimestamp(value)) throw new DeviceManagementRequestError();

  return value;
}

function parseManagedDisplayName(value: unknown): string {
  const normalizedValue = typeof value === 'string' ? value.trim() : undefined;
  if (
    !normalizedValue ||
    normalizedValue.length > 100 ||
    CONTROL_CHARACTER_PATTERN.test(normalizedValue)
  ) {
    throw new DeviceManagementRequestError();
  }

  return normalizedValue;
}

function parseOptionalAppVersion(value: unknown): string | undefined {
  if (value === undefined) return undefined;

  const normalizedValue = typeof value === 'string' ? value.trim() : undefined;
  if (
    !normalizedValue ||
    normalizedValue.length > 20 ||
    CONTROL_CHARACTER_PATTERN.test(normalizedValue) ||
    !SEMVER_PATTERN.test(normalizedValue)
  ) {
    throw new DeviceManagementRequestError();
  }

  return normalizedValue;
}

function parseDeviceEnrollmentStatus(value: unknown): DeviceEnrollmentStatus {
  if (!isRecord(value)) {
    throw new DeviceManagementRequestError();
  }

  assertOnlyAllowedKeys(value, [
    'deviceId',
    'environment',
    'programType',
    'capabilityProfile',
    'state',
    'credentialVersion',
  ]);

  const { deviceId, environment, programType, capabilityProfile, state, credentialVersion } = value;
  if (
    !isCanonicalDeviceId(deviceId) ||
    !isDeviceEnvironment(environment) ||
    !isProgramType(programType) ||
    !isCapabilityProfile(capabilityProfile) ||
    !isDeviceEnrollmentState(state) ||
    !isCredentialVersion(credentialVersion)
  ) {
    throw new DeviceManagementRequestError();
  }

  return {
    deviceId,
    environment,
    programType,
    capabilityProfile,
    state,
    credentialVersion,
  };
}

function parseManagedDeviceSummary(value: unknown): ManagedDeviceSummary {
  if (!isRecord(value)) {
    throw new DeviceManagementRequestError();
  }

  assertOnlyAllowedKeys(value, [
    'deviceId',
    'environment',
    'programType',
    'capabilityProfile',
    'displayName',
    'appVersion',
    'state',
    'credentialVersion',
    'enrolledAt',
    'approvedAt',
    'lastHeartbeatAt',
    'revokedAt',
  ]);

  const { deviceId, environment, programType, capabilityProfile, state, credentialVersion } = value;
  const displayName = parseManagedDisplayName(value.displayName);
  const appVersion = parseOptionalAppVersion(value.appVersion);
  const approvedAt = parseOptionalTimestamp(value.approvedAt);
  const lastHeartbeatAt = parseOptionalTimestamp(value.lastHeartbeatAt);
  const revokedAt = parseOptionalTimestamp(value.revokedAt);
  if (
    !isCanonicalDeviceId(deviceId) ||
    !isDeviceEnvironment(environment) ||
    !isProgramType(programType) ||
    !isCapabilityProfile(capabilityProfile) ||
    !isDeviceEnrollmentState(state) ||
    !isCredentialVersion(credentialVersion) ||
    !isCanonicalUtcTimestamp(value.enrolledAt)
  ) {
    throw new DeviceManagementRequestError();
  }

  const summary: {
    deviceId: string;
    environment: DeviceEnrollmentCodeResponse['environment'];
    programType: DeviceEnrollmentProgramType;
    capabilityProfile: DeviceEnrollmentCapabilityProfile;
    displayName: string;
    appVersion?: string;
    state: DeviceEnrollmentState;
    credentialVersion: number;
    enrolledAt: string;
    approvedAt?: string;
    lastHeartbeatAt?: string;
    revokedAt?: string;
  } = {
    deviceId,
    environment,
    programType,
    capabilityProfile,
    displayName,
    state,
    credentialVersion,
    enrolledAt: value.enrolledAt,
  };

  if (appVersion !== undefined) summary.appVersion = appVersion;
  if (approvedAt !== undefined) summary.approvedAt = approvedAt;
  if (lastHeartbeatAt !== undefined) summary.lastHeartbeatAt = lastHeartbeatAt;
  if (revokedAt !== undefined) summary.revokedAt = revokedAt;

  return summary;
}

function parseManagedDeviceList(value: unknown): readonly ManagedDeviceSummary[] {
  if (!Array.isArray(value)) {
    throw new DeviceManagementRequestError();
  }

  return value.map((item) => parseManagedDeviceSummary(item));
}

function parseDeviceAuthRuntimeEnvironment(value: unknown): DeviceAuthEnvironment {
  if (!isRecord(value)) {
    throw new DeviceManagementRequestError();
  }

  assertOnlyAllowedKeys(value, ['environment']);
  if (!isDeviceEnvironment(value.environment)) {
    throw new DeviceManagementRequestError();
  }

  return value.environment;
}

function parseDeviceRotationSummary(value: unknown): DeviceRotationSummary {
  if (!isRecord(value)) {
    throw new DeviceManagementRequestError();
  }

  assertOnlyAllowedKeys(value, ['id', 'deviceId', 'status', 'deadlineAt', 'credentialVersion']);

  const { id, deviceId, status, deadlineAt, credentialVersion } = value;
  if (
    !isCanonicalDeviceId(id) ||
    !isCanonicalDeviceId(deviceId) ||
    !isDeviceRotationStatus(status) ||
    !isCanonicalUtcTimestamp(deadlineAt) ||
    (credentialVersion !== undefined && !isCredentialVersion(credentialVersion))
  ) {
    throw new DeviceManagementRequestError();
  }

  return {
    id,
    deviceId,
    status,
    deadlineAt,
    ...(credentialVersion === undefined ? {} : { credentialVersion }),
  };
}

async function parseManagedDeviceResponse<T>(
  response: Response,
  parser: (value: unknown) => T
): Promise<T> {
  if (!response.ok) {
    throw new DeviceManagementRequestError();
  }

  try {
    return parser(await response.json());
  } catch (error: unknown) {
    if (error instanceof DeviceManagementRequestError) {
      throw error;
    }

    throw new DeviceManagementRequestError();
  }
}

async function requestManagedDeviceJson<T>(
  endpoint: string,
  options: RequestInit,
  parser: (value: unknown) => T
): Promise<T> {
  try {
    const response = await fetch(endpoint, options);
    return await parseManagedDeviceResponse(response, parser);
  } catch (error: unknown) {
    if (error instanceof DeviceManagementRequestError) {
      throw error;
    }

    throw new DeviceManagementRequestError();
  }
}

async function postManagedDeviceAction<T>(
  endpoint: string,
  expectedEnvironment: DeviceAuthEnvironment,
  parser: (value: unknown) => T
): Promise<T> {
  let csrfToken: string;
  try {
    csrfToken = await ensureCsrfToken(expectedEnvironment);
  } catch {
    throw new DeviceManagementRequestError();
  }

  return requestManagedDeviceJson(
    endpoint,
    {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'x-csrf-token': csrfToken,
        [DEVICE_AUTH_EXPECTED_ENVIRONMENT_HEADER]: expectedEnvironment,
      },
      body: undefined,
    },
    parser
  );
}

export async function listManagedDevices(
  options: ListManagedDevicesOptions
): Promise<readonly ManagedDeviceSummary[]> {
  return requestManagedDeviceJson(
    DEVICE_MANAGEMENT_ENDPOINT,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        [DEVICE_AUTH_EXPECTED_ENVIRONMENT_HEADER]: options.expectedEnvironment,
      },
      signal: options.signal,
    },
    parseManagedDeviceList
  );
}

export async function getDeviceAuthRuntimeEnvironment(
  options: GetDeviceAuthRuntimeEnvironmentOptions = {}
): Promise<DeviceAuthEnvironment> {
  return requestManagedDeviceJson(
    DEVICE_RUNTIME_ENVIRONMENT_ENDPOINT,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    },
    parseDeviceAuthRuntimeEnvironment
  );
}

export async function approveManagedDevice(
  deviceId: string,
  expectedEnvironment: DeviceAuthEnvironment
): Promise<DeviceEnrollmentStatus> {
  return postManagedDeviceAction(
    `${DEVICE_MANAGEMENT_ENDPOINT}/${encodeURIComponent(deviceId)}/approve-enrollment`,
    expectedEnvironment,
    parseDeviceEnrollmentStatus
  );
}

export async function revokeManagedDevice(
  deviceId: string,
  expectedEnvironment: DeviceAuthEnvironment
): Promise<ManagedDeviceSummary> {
  return postManagedDeviceAction(
    `${DEVICE_MANAGEMENT_ENDPOINT}/${encodeURIComponent(deviceId)}/revoke`,
    expectedEnvironment,
    parseManagedDeviceSummary
  );
}

export async function requestManagedDeviceCredentialRotation(
  deviceId: string,
  expectedEnvironment: DeviceAuthEnvironment
): Promise<DeviceRotationSummary> {
  const summary = await postManagedDeviceAction(
    `${DEVICE_MANAGEMENT_ENDPOINT}/${encodeURIComponent(deviceId)}/credential-rotations`,
    expectedEnvironment,
    parseDeviceRotationSummary
  );

  if (summary.deviceId !== deviceId) {
    throw new DeviceManagementRequestError();
  }

  return summary;
}

function parseEnrollmentCodeResponse(value: unknown): DeviceEnrollmentCodeResponse {
  if (
    !isRecord(value) ||
    !hasOnlyAllowedKeys(value, ENROLLMENT_CODE_RESPONSE_KEYS) ||
    typeof value.enrollmentCode !== 'string' ||
    typeof value.enrollmentId !== 'string' ||
    (value.environment !== 'dev' && value.environment !== 'stg' && value.environment !== 'prd') ||
    !isProgramType(value.programType) ||
    !isCapabilityProfile(value.capabilityProfile) ||
    typeof value.expiresAt !== 'string'
  ) {
    throw new DeviceEnrollmentCodeRequestError();
  }

  return {
    enrollmentCode: value.enrollmentCode,
    enrollmentId: value.enrollmentId,
    environment: value.environment,
    programType: value.programType,
    capabilityProfile: value.capabilityProfile,
    expiresAt: value.expiresAt,
  };
}

/**
 * 등록 코드는 호출자에게 한 번만 반환한다. 이 헬퍼는 브라우저 저장소나 query cache를
 * 사용하지 않으며, 호출 화면이 일회성 메모리에서만 표시·복사하도록 한다.
 */
export async function createDeviceEnrollmentCode(
  input: CreateDeviceEnrollmentCodeInput,
  expectedEnvironment: DeviceAuthEnvironment
): Promise<DeviceEnrollmentCodeResponse> {
  const csrfToken = await ensureCsrfToken(expectedEnvironment);
  const response = await fetch(DEVICE_ENROLLMENT_CODE_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': csrfToken,
      [DEVICE_AUTH_EXPECTED_ENVIRONMENT_HEADER]: expectedEnvironment,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new DeviceEnrollmentCodeRequestError(response.status);
  }

  try {
    return parseEnrollmentCodeResponse(await response.json());
  } catch (error: unknown) {
    if (error instanceof DeviceEnrollmentCodeRequestError) {
      throw error;
    }

    throw new DeviceEnrollmentCodeRequestError();
  }
}
