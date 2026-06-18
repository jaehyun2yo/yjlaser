import { Request } from 'express';
import { AccountRecoveryFlow, AccountRecoveryRequestContext } from './account-recovery.types';

function headerValue(request: Request, headerName: string): string {
  const value = request.headers[headerName];
  if (Array.isArray(value)) {
    return value[0] || '';
  }

  return typeof value === 'string' ? value : '';
}

export function buildAccountRecoveryContext(
  request: Request,
  flow: AccountRecoveryFlow
): AccountRecoveryRequestContext {
  return {
    flow,
    ip:
      headerValue(request, 'x-account-recovery-client-ip') ||
      headerValue(request, 'x-forwarded-for').split(',')[0]?.trim() ||
      request.ip ||
      'unknown',
    fingerprint: headerValue(request, 'x-account-recovery-fingerprint') || `${flow}:unknown`,
    frontendOrigin: headerValue(request, 'x-account-recovery-origin') || undefined,
  };
}
