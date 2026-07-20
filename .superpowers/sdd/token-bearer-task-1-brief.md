### Task 1: Additive token-exchange persistence and revoke terminalization

**Files:**

- Modify: yjlaser_website/webhard-api/prisma/schema.prisma
- Create: yjlaser_website/webhard-api/prisma/migrations/20260720100000_add_device_token_exchanges/migration.sql
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-auth.types.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-auth.persistence.spec.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-management.service.ts
- Modify: yjlaser_website/webhard-api/src/integration/device-auth/device-management.service.spec.ts

**Consumes:** existing IntegrationDevice, DeviceRefreshCredential, DeviceCredentialRotation, and admin revoke transaction.

**Produces:** predecessor/successor-bound DeviceTokenExchange and revoke terminalization.

- [ ] **Step 1: Write the failing persistence and revoke tests**

Add source-schema assertions for DeviceTokenExchangeStatus(completed, revoked, expired), deviceId, previousCredentialId, successorCredentialId, requestIdDigest, credentialVersion, status, completedAt, recoverableUntil, revokedAt, composite FKs, unique(deviceId, requestIdDigest), unique(successorCredentialId), indexes, RLS, and PUBLIC/anon/authenticated revokes.

Add the revoke assertion:

~~~ts
expect(transaction.deviceTokenExchange.updateMany).toHaveBeenCalledWith({
  where: { deviceId: DEVICE_ID, status: 'completed', revokedAt: null },
  data: { status: 'revoked', revokedAt: NOW },
});
~~~

Run:

~~~powershell
cd yjlaser_website/webhard-api
pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-auth.persistence.spec.ts src/integration/device-auth/device-management.service.spec.ts
~~~

Expected: FAIL because token exchange persistence and revoke update do not exist.

- [ ] **Step 2: Add immutable schema and migration**

Keep the 20260719120000 migration unchanged. Add this Prisma shape plus inverse relations on IntegrationDevice and DeviceRefreshCredential:

~~~prisma
enum DeviceTokenExchangeStatus {
  completed
  revoked
  expired
}

model DeviceTokenExchange {
  id                    String                    @id @default(uuid())
  deviceId              String                    @map("device_id")
  previousCredentialId  String                    @map("previous_credential_id")
  successorCredentialId String                    @unique @map("successor_credential_id")
  requestIdDigest       String                    @map("request_id_digest") @db.VarChar(128)
  credentialVersion     Int                       @map("credential_version")
  status                DeviceTokenExchangeStatus @default(completed)
  completedAt           DateTime                  @map("completed_at")
  recoverableUntil      DateTime                  @map("recoverable_until")
  revokedAt             DateTime?                 @map("revoked_at")
  createdAt             DateTime                  @default(now()) @map("created_at")

  device     IntegrationDevice       @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  previous   DeviceRefreshCredential @relation("DeviceTokenExchangePrevious", fields: [previousCredentialId, deviceId], references: [id, deviceId], onDelete: Cascade)
  successor  DeviceRefreshCredential @relation("DeviceTokenExchangeSuccessor", fields: [successorCredentialId, deviceId], references: [id, deviceId], onDelete: Cascade)

  @@unique([deviceId, requestIdDigest])
  @@index([previousCredentialId, status])
  @@index([recoverableUntil])
  @@map("device_token_exchanges")
}
~~~

SQL must add hash/version positive checks, terminal-state checks, same-device composite FKs, no now()-dependent partial index, RLS enablement, and the same no-PUBLIC/no-anon/no-authenticated grants as the original device tables. recoverableUntil is the successor credential expiry; expired is set only by service logic when an old exchange is encountered.

- [ ] **Step 3: Terminalize exchanges inside revoke**

After credential/rotation terminalization and before the existing audit write, add:

~~~ts
await transaction.deviceTokenExchange.updateMany({
  where: { deviceId: device.id, status: 'completed', revokedAt: null },
  data: { status: 'revoked', revokedAt: transactionNow },
});
~~~

Keep it in the same serializable callback. Do not add exchange fields to management responses.

- [ ] **Step 4: Generate and verify**

~~~powershell
cd yjlaser_website/webhard-api
pnpm prisma:generate
pnpm exec jest --runInBand --no-cache src/integration/device-auth/device-auth.persistence.spec.ts src/integration/device-auth/device-management.service.spec.ts
pnpm exec prisma validate
~~~

Expected: schema/client/static tests pass without a database connection.

- [ ] **Step 5: Leave the result unstaged**

Do not run git add, git commit, migration deploy, seed, or database inspection.
