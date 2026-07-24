import {
  assertPrdControlInvocation,
  parsePrdControlCommand,
} from '../../../scripts/device-auth-prd-client-e2e-control';
import { fingerprintDatabaseTarget } from '../../../scripts/device-auth-dev-lifecycle-smoke';

const DATABASE_URL = 'postgresql://prod_user:secret@prod.example.test:5432/yjlaser';
const DATABASE_FINGERPRINT = fingerprintDatabaseTarget(DATABASE_URL);
const ENVIRONMENT = {
  DOPPLER_CONFIG: 'prd',
  DEVICE_AUTH_ENVIRONMENT: 'prd',
  DATABASE_URL,
};

describe('PRD client E2E control safety boundary', () => {
  it('requires the explicit production write confirmation', () => {
    expect(() => assertPrdControlInvocation([], ENVIRONMENT, DATABASE_FINGERPRINT)).toThrow(
      'device_auth_prd_control_confirmation_required'
    );
  });

  it.each([
    { ...ENVIRONMENT, DOPPLER_CONFIG: 'dev' },
    { ...ENVIRONMENT, DEVICE_AUTH_ENVIRONMENT: 'dev' },
  ])('rejects a non-production environment', (environment) => {
    expect(() =>
      assertPrdControlInvocation(['--confirm-prd-write'], environment, DATABASE_FINGERPRINT)
    ).toThrow('device_auth_prd_control_environment_mismatch');
  });

  it('pins the exact production database target', () => {
    expect(() =>
      assertPrdControlInvocation(['--confirm-prd-write'], ENVIRONMENT, 'A'.repeat(64))
    ).toThrow('device_auth_prd_control_database_target_mismatch');
    expect(() =>
      assertPrdControlInvocation(['--confirm-prd-write'], ENVIRONMENT, DATABASE_FINGERPRINT)
    ).not.toThrow();
  });

  it('accepts only synthetic production display names and known programs', () => {
    expect(
      parsePrdControlCommand([
        'issue',
        'management_program',
        'codex-prd-client-e2e-management-01',
        '--confirm-prd-write',
      ])
    ).toEqual({
      action: 'issue',
      programType: 'management_program',
      displayName: 'codex-prd-client-e2e-management-01',
    });
    expect(() =>
      parsePrdControlCommand(['issue', 'management_program', 'office-pc', '--confirm-prd-write'])
    ).toThrow('device_auth_prd_control_command_invalid');
  });
});
