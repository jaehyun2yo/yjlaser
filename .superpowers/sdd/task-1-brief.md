### Task 1: Safe device-management service

**Files:**

- Create: `yjlaser_website/webhard-api/src/integration/device-auth/device-management.service.ts`
- Create: `yjlaser_website/webhard-api/src/integration/device-auth/device-management.service.spec.ts`
- Modify: `yjlaser_website/webhard-api/src/integration/device-auth/device-auth.types.ts`
- Modify: `yjlaser_website/webhard-api/src/integration/device-auth/device-auth.tokens.ts`
- Modify: `yjlaser_website/webhard-api/src/integration/device-auth/device-auth.module.ts`

**Interfaces:**

```ts
export type DeviceManagementErrorCode =
  | 'DEVICE_MANAGEMENT_INVALID'
  | 'DEVICE_MANAGEMENT_CONFLICT'
  | 'DEVICE_MANAGEMENT_UNAVAILABLE';

export interface ManagedDeviceSummary {
  readonly deviceId: string;
  readonly environment: DeviceAuthEnvironment;
  readonly programType: DeviceAuthProgramType;
  readonly capabilityProfile: DeviceCapabilityProfile;
  readonly displayName: string;
  readonly appVersion?: string;
  readonly state: 'pending_approval' | 'active' | 'revoked';
  readonly credentialVersion: number;
  readonly enrolledAt: Date;
  readonly approvedAt?: Date;
  readonly lastHeartbeatAt?: Date;
  readonly revokedAt?: Date;
}

export class DeviceManagementService {
  listDevices(): Promise<readonly ManagedDeviceSummary[]>;
  approveDevice(input: ApproveEnrollmentInput): Promise<DeviceEnrollmentStatus>;
  revokeDevice(input: { readonly deviceId: string; readonly actorHash: string }): Promise<ManagedDeviceSummary>;
}
```

- [ ] **Step 1: Write failing summary and delegation tests**

```ts
it('lists only selected-environment safe fields', async () => {
  prisma.integrationDevice.findMany.mockResolvedValue([activeDevice]);
  await expect(service.listDevices()).resolves.toEqual([
    expect.objectContaining({ deviceId: activeDevice.id, environment: 'dev', state: 'active' }),
  ]);
  expect(prisma.integrationDevice.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { environment: 'dev' } })
  );
});

it('delegates pending approval to the enrollment lifecycle once', async () => {
  await service.approveDevice({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH });
  expect(enrollmentService.approveEnrollment).toHaveBeenCalledWith({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH });
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `cd yjlaser_website/webhard-api && pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-management.service.spec.ts -t "lists only|delegates"`

Expected: FAIL because `DeviceManagementService` does not exist.

- [ ] **Step 3: Implement strict selected-environment summaries**

```ts
public async listDevices(): Promise<readonly ManagedDeviceSummary[]> {
  const rows = await this.runSafeDatabaseOperation(() => this.prisma.integrationDevice.findMany({
    where: { environment: this.config.environment },
    orderBy: [{ enrolledAt: 'desc' }, { id: 'asc' }],
    select: {
      id: true, environment: true, programType: true, capabilityProfile: true,
      displayName: true, appVersion: true, status: true, credentialVersion: true,
      enrolledAt: true, approvedAt: true, lastHeartbeatAt: true, revokedAt: true,
    },
  }));
  return rows.map(toManagedDeviceSummary);
}

public approveDevice(input: ApproveEnrollmentInput): Promise<DeviceEnrollmentStatus> {
  return this.enrollmentService.approveEnrollment(input);
}
```

- [ ] **Step 4: Verify the summary and delegation tests pass**

Run: `cd yjlaser_website/webhard-api && pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-management.service.spec.ts -t "lists only|delegates"`

Expected: PASS and serialized summaries contain no secret/hash/private metadata field.

- [ ] **Step 5: Write failing atomic revoke tests**

```ts
it('revokes device, every current credential, and live rotations in one transaction', async () => {
  await expect(service.revokeDevice({ deviceId: DEVICE_ID, actorHash: ACTOR_HASH })).resolves.toMatchObject({
    deviceId: DEVICE_ID, state: 'revoked', credentialVersion: 8,
  });
  expect(transaction.integrationDevice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: 'revoked', credentialVersion: { increment: 1 } }),
  }));
  expect(transaction.deviceRefreshCredential.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: 'revoked' }),
  }));
  expect(transaction.deviceCredentialRotation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: 'cancelled' }),
  }));
});
```

- [ ] **Step 6: Verify the revoke test fails**

Run: `cd yjlaser_website/webhard-api && pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-management.service.spec.ts -t "revokes device"`

Expected: FAIL because `revokeDevice` does not exist.

- [ ] **Step 7: Implement serializable revoke CAS**

```ts
const device = await transaction.integrationDevice.findFirst({
  where: { id: deviceId, environment: this.config.environment, revokedAt: null,
    status: { in: ['pending_approval', 'active'] } },
  select: managedDeviceSelect,
});
if (!device) throw new DeviceManagementError('DEVICE_MANAGEMENT_CONFLICT');
const updated = await transaction.integrationDevice.updateMany({
  where: { id: device.id, environment: this.config.environment, status: device.status,
    credentialVersion: device.credentialVersion, revokedAt: null },
  data: { status: 'revoked', revokedAt: now, credentialVersion: { increment: 1 } },
});
if (updated.count !== 1) throw new DeviceManagementError('DEVICE_MANAGEMENT_CONFLICT');
await transaction.deviceRefreshCredential.updateMany({
  where: { deviceId: device.id, status: { in: ['prepared', 'active'] }, revokedAt: null },
  data: { status: 'revoked', revokedAt: now, actorHash },
});
await transaction.deviceCredentialRotation.updateMany({
  where: { deviceId: device.id, status: { in: ['requested', 'prepared'] } },
  data: { status: 'cancelled', cancelledAt: now, actorHash },
});
await transaction.deviceCredentialAuditLog.create({
  data: { deviceId: device.id, action: 'device_revoked', actorHash,
    expiresAt: new Date(now.getTime() + this.options.auditLogTtlMs) },
});
```

The transaction retries only Prisma `P2034` serialization errors at the established lifecycle limit. It maps all other persistence failures to `DEVICE_MANAGEMENT_UNAVAILABLE` without raw error text.

- [ ] **Step 8: Verify terminal-state regressions pass**

Run: `cd yjlaser_website/webhard-api && pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-management.service.spec.ts`

Expected: PASS for cross-environment/already-revoked conflict, CAS miss, no-audit transaction failure, prepared+active credential revocation, requested+prepared rotation cancellation, and unavailable DB mapping.

- [ ] **Step 9: Register only factory-backed provider and record the reviewed diff**

```ts
{
  provide: DEVICE_MANAGEMENT_SERVICE,
  inject: [PrismaService, DEVICE_AUTH_CONFIG, DEVICE_ENROLLMENT_OPTIONS, DEVICE_ENROLLMENT_SERVICE],
  useFactory: (prisma, config, options, enrollmentService) =>
    new DeviceManagementService(prisma, config, options, enrollmentService),
}
```

Run: `cd yjlaser_website/webhard-api && pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-auth.module.spec.ts`

Expected: PASS with a synthetic validated configuration. Record `git diff --check` and the focused test output; do not stage or commit without a separate user request.
