export type AccountRecoveryFlow = 'find-id' | 'find-password';

export interface AccountRecoveryRequestContext {
  flow: AccountRecoveryFlow;
  ip: string;
  fingerprint: string;
  frontendOrigin?: string;
}

export interface AccountRecoveryMailAllowanceInput {
  flow: AccountRecoveryFlow;
  companyId: number;
  fingerprint: string;
}

export interface AccountRecoveryMailAllowance {
  canSendMail: boolean;
}
