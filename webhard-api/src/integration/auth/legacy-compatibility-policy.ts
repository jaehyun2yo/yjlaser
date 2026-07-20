import type {
  DeviceAuthEnvironment,
  DeviceAuthProgramType,
} from '../device-auth/device-auth.types';
import type { DeviceEndpointMethod } from './device-endpoint-policy';

export interface LegacyCompatibilityPolicy {
  readonly method: DeviceEndpointMethod;
  readonly pathTemplate: string;
  readonly programType: DeviceAuthProgramType;
  readonly apiKeyScope: string;
  readonly environment: DeviceAuthEnvironment;
  readonly graceDeadlineAt: string;
}

export const LEGACY_COMPATIBILITY_POLICIES: readonly LegacyCompatibilityPolicy[] = Object.freeze(
  []
);

export function findLegacyCompatibilityPolicy(
  method: DeviceEndpointMethod,
  pathTemplate: string,
  programType: DeviceAuthProgramType,
  environment: DeviceAuthEnvironment
): LegacyCompatibilityPolicy | undefined {
  return LEGACY_COMPATIBILITY_POLICIES.find(
    (policy) =>
      policy.method === method &&
      policy.pathTemplate === pathTemplate &&
      policy.programType === programType &&
      policy.environment === environment
  );
}
