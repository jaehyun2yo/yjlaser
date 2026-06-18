# Secret Rotation Runbook

## Scope

This runbook covers rotating YJ Laser application secrets without exposing secret values in code,
logs, tickets, or documentation.

Secret categories:

- Browser and worker session signing secrets
- Backend API keys for server-to-server integration
- Account recovery API key
- Cloudflare R2 access keys
- SMTP credentials
- Database connection credentials

## General Rules

- Generate replacement values in the deployment provider or password manager.
- Never paste raw values into issue text, chat, commit messages, screenshots, or logs.
- Verify every environment separately: local development, preview/staging, frontend production,
  and backend production.
- Rotate one category at a time unless there is an active incident.
- Keep rollback values available only in the approved secret store, not in repository files.

## Session Signing Secret Rotation

1. Generate a new primary session signing secret.
2. Move the current primary value to the previous-secret environment variable.
3. Set the previous-secret expiry timestamp to the end of the compatibility window.
4. Deploy backend and frontend with the new primary plus previous-secret window.
5. Confirm new logins issue sessions signed by the new primary.
6. After the compatibility window expires, remove the previous-secret variables.
7. Verify old sessions no longer validate after expiry and current sessions still work.

## Backend API Key Rotation

1. Create a new key with the minimum required program scope.
2. Deploy consumers with the new key through environment variables or the program key store.
3. Confirm health checks and integration endpoints work with the new key.
4. Revoke the old key.
5. Confirm the old key returns unauthorized and does not create a user principal.

## Account Recovery Key Rotation

1. Set a new recovery key in both the frontend and backend environments.
2. Deploy backend first, then frontend, or use an agreed overlap window if supported.
3. Run account recovery request and confirmation checks without logging request secrets.
4. Remove the old value from the secret store after verification.

## R2 and SMTP Credential Rotation

1. Create replacement credentials with the same or narrower permissions.
2. Deploy the new credentials to the relevant runtime.
3. Run upload/download or mail delivery smoke checks.
4. Revoke old credentials after successful checks.
5. Monitor error logs for authentication failures.

## Incident Rotation

1. Revoke exposed credentials immediately where possible.
2. Deploy replacements to every affected runtime.
3. Invalidate active sessions when signing secrets may be exposed.
4. Review access logs for suspicious activity during the exposure window.
5. Document impact, affected categories, and verification results without recording secret values.
