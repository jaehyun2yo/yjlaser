import { DeviceRotationAckRequestShapeGuard } from './device-rotation-request-shape.guard';

describe('DeviceRotationAckRequestShapeGuard', () => {
  it('accepts only the candidate credential proof', () => {
    const guard = new DeviceRotationAckRequestShapeGuard();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ body: { candidateCredential: 'candidate' } }),
      }),
    };

    expect(guard.canActivate(context as never)).toBe(true);
  });
});
