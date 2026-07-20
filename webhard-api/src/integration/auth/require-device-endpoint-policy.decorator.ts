import { SetMetadata } from '@nestjs/common';
import {
  normalizeDeviceEndpointPathTemplate,
  type DeviceEndpointMethod,
} from './device-endpoint-policy';

export const DEVICE_ENDPOINT_POLICY_KEY = 'device_endpoint_policy';

export interface DeviceEndpointPolicyRequirement {
  readonly method: DeviceEndpointMethod;
  readonly pathTemplate: string;
}

export function RequireDeviceEndpointPolicy(
  method: DeviceEndpointMethod,
  pathTemplate: string
): MethodDecorator {
  const requirement: DeviceEndpointPolicyRequirement = Object.freeze({
    method,
    pathTemplate: normalizeDeviceEndpointPathTemplate(pathTemplate),
  });
  return SetMetadata(DEVICE_ENDPOINT_POLICY_KEY, requirement);
}
