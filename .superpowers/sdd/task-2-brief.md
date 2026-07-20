### Task 2: Administrator-only API boundary

**Files:**

- Create: `yjlaser_website/webhard-api/src/integration/device-auth/device-management.controller.ts`
- Create: `yjlaser_website/webhard-api/src/integration/device-auth/device-management.controller.spec.ts`
- Create: `yjlaser_website/webhard-api/src/integration/device-auth/device-enrollment-admin-empty-body.guard.ts`
- Create: `yjlaser_website/webhard-api/src/integration/device-auth/device-enrollment-admin-empty-body.guard.spec.ts`
- Modify: `yjlaser_website/webhard-api/src/integration/device-auth/device-enrollment-admin-session-source.guard.ts`
- Modify: `yjlaser_website/webhard-api/src/integration/device-auth/device-enrollment-admin-session-source.guard.spec.ts`
- Modify: `yjlaser_website/webhard-api/src/integration/device-auth/device-auth.module.ts`

**Routes:**

```text
GET  /api/v1/integration/devices
POST /api/v1/integration/devices/:id/approve-enrollment
POST /api/v1/integration/devices/:id/revoke
```

- [ ] **Step 1: Write failing HTTP tests**

```ts
it('lets only an admin session list safe devices', async () => {
  const response = await adminGet('/api/v1/integration/devices').expect(200);
  expect(response.headers['cache-control']).toContain('no-store');
  expect(response.body).toEqual([expect.objectContaining({ deviceId: DEVICE_ID })]);
});

it('rejects a nonempty revoke body before the service', async () => {
  await adminPost(`/api/v1/integration/devices/${DEVICE_ID}/revoke`, { reason: 'private' }).expect(400);
  expect(managementService.revokeDevice).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Verify HTTP tests fail**

Run: `cd yjlaser_website/webhard-api && pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-management.controller.spec.ts`

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Implement controller and empty-body guard**

```ts
@Controller('integration/devices')
@UseGuards(SessionAuthGuard, AdminGuard, DeviceEnrollmentAdminSessionSourceGuard)
export class DeviceManagementController {
  @Get()
  list(@Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store, private');
    return this.managementService.listDevices();
  }

  @Post(':id/approve-enrollment')
  @UseGuards(DeviceEnrollmentAdminEmptyBodyGuard)
  approve(@Param('id') id: string, @CurrentUser() user: SessionUser,
          @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store, private');
    return this.managementService.approveDevice({ deviceId: id, actorHash: this.actorHasher.hashAdmin(user) });
  }

  @Post(':id/revoke')
  @UseGuards(DeviceEnrollmentAdminEmptyBodyGuard)
  revoke(@Param('id') id: string, @CurrentUser() user: SessionUser,
         @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store, private');
    return this.managementService.revokeDevice({ deviceId: id, actorHash: this.actorHasher.hashAdmin(user) });
  }
}
```

`DeviceEnrollmentAdminEmptyBodyGuard` permits only `undefined` or a normal empty `{}` and rejects null, arrays, non-plain objects, and every own key before the global whitelist pipe. The shared session-source guard also rejects any `Authorization` header (including an empty one) so both new routes and enrollment-code issuance remain strictly session-only. Map management invalid/conflict/unavailable to generic 400/409/503 response envelopes.

- [ ] **Step 4: Verify HTTP route matrix and record the reviewed diff**

Run: `cd yjlaser_website/webhard-api && pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-management.controller.spec.ts src/integration/device-auth/device-enrollment-admin-empty-body.guard.spec.ts`

Expected: PASS for admin success, no session 401, company 403, missing/mismatched CSRF 403, API/recovery/Authorization header including empty 403, action body 400, terminal/cross-environment 409, unavailable 503, and secret-free response. Record the focused test output and `git diff --check`; do not stage or commit without a separate user request.
