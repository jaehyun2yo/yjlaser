import {
  DEFAULT_INTEGRATION_WORKER_PERMISSIONS,
  INTEGRATION_PERMISSIONS,
  INTEGRATION_WORKER_TYPES,
  getDefaultIntegrationPermissions,
  isIntegrationPermission,
} from './integration-permissions';

describe('integration permissions', () => {
  it('계약 문서의 worker scope 이름을 상수로 고정한다', () => {
    expect(INTEGRATION_PERMISSIONS).toEqual([
      'event/write',
      'file/register',
      'job/read',
      'operation/read',
    ]);
  });

  it('worker type별 기본 허용 action을 고정한다', () => {
    expect(INTEGRATION_WORKER_TYPES).toEqual([
      'external_webhard_sync',
      'website_worker',
      'management_program',
      'nesting_program',
      'manual_worker',
      'admin_dashboard',
    ]);
    expect(DEFAULT_INTEGRATION_WORKER_PERMISSIONS).toEqual({
      external_webhard_sync: ['file/register', 'event/write'],
      website_worker: ['event/write'],
      management_program: ['event/write', 'job/read'],
      nesting_program: ['event/write', 'job/read'],
      manual_worker: ['event/write', 'job/read'],
      admin_dashboard: ['operation/read'],
    });
  });

  it('worker별 기본 권한은 정의된 permission enum 안에서만 선택된다', () => {
    for (const permissions of Object.values(DEFAULT_INTEGRATION_WORKER_PERMISSIONS)) {
      for (const permission of permissions) {
        expect(isIntegrationPermission(permission)).toBe(true);
      }
    }
  });

  it('기존 ApiKey.permissions 문자열 배열과 호환되는 조회 helper를 제공한다', () => {
    expect(isIntegrationPermission('event/write')).toBe(true);
    expect(isIntegrationPermission('contacts:read')).toBe(false);
    expect(getDefaultIntegrationPermissions('nesting_program')).toEqual([
      'event/write',
      'job/read',
    ]);
    expect(getDefaultIntegrationPermissions('unknown_worker')).toEqual([]);
  });
});
