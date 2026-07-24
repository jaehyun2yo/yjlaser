import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type {
  DeviceAccessPrincipal,
  DeviceAuthProgramType,
} from '../device-auth/device-auth.types';
import { getDeviceEndpointPolicy, type DeviceEndpointMethod } from './device-endpoint-policy';
import { DEFAULT_DEVICE_ACCESS_PERMISSIONS } from './integration-permissions';
import {
  DEVICE_ENDPOINT_POLICY_KEY,
  type DeviceEndpointPolicyRequirement,
} from './require-device-endpoint-policy.decorator';
import { getIntegrationPrincipalMode } from './integration-principal-source.guard';

type DevicePolicyRequest = Request & { readonly deviceAuthInfo?: DeviceAccessPrincipal };

@Injectable()
export class DeviceEndpointPolicyGuard implements CanActivate {
  public constructor(private readonly reflector: Reflector) {}

  public canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<DeviceEndpointPolicyRequirement>(
      DEVICE_ENDPOINT_POLICY_KEY,
      [context.getHandler(), context.getClass()]
    );
    const request = context.switchToHttp().getRequest<DevicePolicyRequest>();
    const mode = getIntegrationPrincipalMode(request);
    if (!mode) throw principalNotAllowed();
    if (mode !== 'device_bearer') {
      if (request.deviceAuthInfo !== undefined) throw principalNotAllowed();
      return true;
    }

    const principal = request.deviceAuthInfo;
    if (
      !requirement ||
      !principal ||
      principal.capabilityProfile !== 'standard' ||
      request.method !== requirement.method ||
      !isDeviceProgramType(principal.programType)
    ) {
      throw principalNotAllowed();
    }

    const policy = getDeviceEndpointPolicy(
      requirement.method as DeviceEndpointMethod,
      requirement.pathTemplate,
      principal.programType
    );
    if (policy.disposition !== 'approved') {
      throw principalNotAllowed();
    }
    if (
      !DEFAULT_DEVICE_ACCESS_PERMISSIONS[principal.programType].includes(policy.permission) ||
      !principal.permissions.includes(policy.permission)
    ) {
      throw permissionDenied(policy.permission);
    }
    return true;
  }
}

function isDeviceProgramType(value: string): value is DeviceAuthProgramType {
  return Object.prototype.hasOwnProperty.call(DEFAULT_DEVICE_ACCESS_PERMISSIONS, value);
}

function principalNotAllowed(): ForbiddenException {
  return new ForbiddenException({
    code: 'DEVICE_PRINCIPAL_NOT_ALLOWED',
    message: 'Device principal is not allowed for this endpoint',
  });
}

function permissionDenied(requiredPermission: string): ForbiddenException {
  return new ForbiddenException({
    code: 'INTEGRATION_PERMISSION_DENIED',
    message: 'Integration permission required',
    required_permission: requiredPermission,
  });
}
