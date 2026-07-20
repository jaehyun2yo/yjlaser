import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { DeviceEnrollmentAdminRequestShapeGuard } from './device-enrollment-admin-request-shape.guard';

function makeContext(body: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body }),
    }),
  } as ExecutionContext;
}

function validBody(): Record<string, string> {
  return {
    programType: 'management_program',
    capabilityProfile: 'standard',
    expectedDisplayName: 'management-install-01',
  };
}

describe('DeviceEnrollmentAdminRequestShapeGuard', () => {
  it('accepts only the exact parsed JSON own-key shape', () => {
    const guard = new DeviceEnrollmentAdminRequestShapeGuard();

    expect(guard.canActivate(makeContext(validBody()))).toBe(true);
  });

  it.each([
    null,
    [],
    { ...validBody(), environment: 'prd' },
    { ...validBody(), actorHash: 'a'.repeat(64) },
    { ...validBody(), ownerReference: 'operator' },
    { ...validBody(), hostname: 'private-workstation' },
    { ...validBody(), hardwareId: 'private-hardware' },
    { ...validBody(), metadata: { path: 'C:\\private\\customer.dxf' } },
    { ...validBody(), appVersion: '1.2.3' },
    { programType: 'management_program', capabilityProfile: 'standard' },
    Object.assign(Object.create(null), validBody()),
    Object.assign(new (class RequestBody {})(), validBody()),
  ])('rejects a non-exact admin enrollment body: %p', (body) => {
    const guard = new DeviceEnrollmentAdminRequestShapeGuard();

    expect(() => guard.canActivate(makeContext(body))).toThrow(BadRequestException);
  });
});
