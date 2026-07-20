### Task 3: Company-site device management UI

**Files:**

- Create: `yjlaser_website/src/app/(admin)/admin/integration/devices/_components/DeviceManagementPanel.tsx`
- Modify: `yjlaser_website/src/app/(admin)/admin/integration/devices/_lib/device-enrollment-api.ts`
- Modify: `yjlaser_website/src/app/(admin)/admin/integration/devices/page.tsx`
- Modify: `yjlaser_website/src/__tests__/admin/DeviceEnrollmentPage.test.tsx`
- Modify: `yjlaser_website/src/__tests__/admin/DeviceEnrollmentSecretBoundary.test.ts`
- Modify: `yjlaser_website/src/__tests__/admin/device-enrollment-api.test.ts`
- Create: `yjlaser_website/src/__tests__/admin/device-management-api.test.ts`

- [ ] **Step 1: Write failing safe-helper tests**

```ts
it('prepares CSRF then posts no body for an approval action', async () => {
  await approveManagedDevice(DEVICE_ID);
  expect(fetchMock).toHaveBeenLastCalledWith(
    `/nestapi/integration/devices/${DEVICE_ID}/approve-enrollment`,
    expect.objectContaining({ method: 'POST', credentials: 'include', cache: 'no-store', body: undefined })
  );
});
```

- [ ] **Step 2: Verify helper test fails**

Run: `cd yjlaser_website && pnpm exec jest --runInBand --no-cache src/__tests__/admin/device-management-api.test.ts`

Expected: FAIL because `approveManagedDevice` does not exist.

- [ ] **Step 3: Implement list/action helper and explicit confirmation UI**

```ts
export async function approveManagedDevice(deviceId: string): Promise<DeviceEnrollmentStatus> {
  return postManagedDeviceAction(`${DEVICE_MANAGEMENT_ENDPOINT}/${encodeURIComponent(deviceId)}/approve-enrollment`);
}

export async function revokeManagedDevice(deviceId: string): Promise<ManagedDeviceSummary> {
  return postManagedDeviceAction(`${DEVICE_MANAGEMENT_ENDPOINT}/${encodeURIComponent(deviceId)}/revoke`);
}
```

`approveManagedDevice` parses the returned `DeviceEnrollmentStatus`; `revokeManagedDevice` parses the returned `ManagedDeviceSummary`. Every response parser validates a finite safe whitelist and creates a new object; it never spreads, casts, stores, renders, or echoes unknown response fields. `ensureCsrfToken()` uses a clearing single-flight bootstrap promise. `postManagedDeviceAction` calls it once, sends no request body, `Content-Type`, or manual `Content-Length`, never retries POST or refreshes CSRF after a failure, and parses only the declared safe response schema. `DeviceManagementPanel` uses an abortable/generation-guarded list load so a stale initial response cannot overwrite an action refresh; it reports action success and refresh failure separately without retrying the action. It always refreshes the safe device list after either action rather than assuming approval returns a full summary. It renders only safe summaries, lets an admin approve pending entries, and requires a local confirmation state containing only `deviceId` and `displayName` before revoke. The destructive dialog has explicit Korean cancel/revoke controls, `aria-live` feedback, no generic close affordance, and disables duplicate/close interaction while an action is in flight. It clears confirmation/error state after completion and never stores raw credentials.

- [ ] **Step 4: Verify UI behavior and record the reviewed diff**

Run: `cd yjlaser_website && pnpm exec jest --runInBand --no-cache src/__tests__/admin/DeviceEnrollmentPage.test.tsx src/__tests__/admin/device-management-api.test.ts`

Expected: PASS for safe display, pending approval, explicit revoke confirmation, no POST after CSRF bootstrap failure, a single CSRF bootstrap under concurrent first actions, exactly one no-body POST with no `Content-Type`, no automatic POST retry, action refresh and stale-load race handling, refresh-failure message after completed action, and no credential source/storage (including unknown response fields). Record the focused test output and `git diff --check`; do not stage or commit without a separate user request.
