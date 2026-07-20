import {
  DEFAULT_DEVICE_ACCESS_PERMISSIONS,
  DEFAULT_INTEGRATION_WORKER_PERMISSIONS,
  INTEGRATION_PERMISSIONS,
  INTEGRATION_WORKER_TYPES,
  getDefaultIntegrationPermissions,
  hasIntegrationPermission,
  isIntegrationPermission,
} from './integration-permissions';

describe('integration permissions', () => {
  it('device access 기본 권한은 legacy worker 기본값과 분리한다', () => {
    expect(DEFAULT_DEVICE_ACCESS_PERMISSIONS).toEqual({
      external_webhard_sync: [
        'folder/read',
        'folder/write',
        'folder/move',
        'file/read',
        'file/write',
        'file/move',
      ],
      management_program: [
        'event/write',
        'job/read',
        'bank-notification/read',
        'bank-notification/manage',
      ],
      nesting_program: [],
    });

    expect(DEFAULT_INTEGRATION_WORKER_PERMISSIONS.external_webhard_sync).toEqual([
      'file/register',
      'event/write',
    ]);
  });

  it('계약 문서의 worker scope 이름을 상수로 고정한다', () => {
    expect(INTEGRATION_PERMISSIONS).toEqual([
      'contact/process-stage:write',
      'event/write',
      'file/register',
      'job/read',
      'operation/read',
      'bank-notification/write',
      'bank-notification/read',
      'bank-notification/manage',
      'folder/read',
      'folder/write',
      'folder/move',
      'file/read',
      'file/write',
      'file/move',
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
      'bank_notification_collector',
    ]);
    expect(DEFAULT_INTEGRATION_WORKER_PERMISSIONS).toEqual({
      external_webhard_sync: ['file/register', 'event/write'],
      website_worker: ['event/write'],
      management_program: [
        'event/write',
        'job/read',
        'contact/process-stage:write',
        'bank-notification/read',
        'bank-notification/manage',
      ],
      nesting_program: ['event/write', 'job/read', 'contact/process-stage:write'],
      manual_worker: ['event/write', 'job/read'],
      admin_dashboard: ['operation/read', 'job/read'],
      bank_notification_collector: ['bank-notification/write'],
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
      'contact/process-stage:write',
    ]);
    expect(getDefaultIntegrationPermissions('unknown_worker')).toEqual([]);
  });

  it('legacy all 권한은 서버-서버 키의 wildcard 로 동작한다', () => {
    expect(hasIntegrationPermission(['all'], 'job/read')).toBe(true);
    expect(hasIntegrationPermission(['event/write'], 'job/read')).toBe(false);
  });

  it('은행 알림 수집/관리 권한 계약을 고정한다', () => {
    expect(INTEGRATION_PERMISSIONS).toEqual(
      expect.arrayContaining([
        'bank-notification/write',
        'bank-notification/read',
        'bank-notification/manage',
      ])
    );
    expect(INTEGRATION_WORKER_TYPES).toContain('bank_notification_collector');
    expect(getDefaultIntegrationPermissions('bank_notification_collector')).toEqual([
      'bank-notification/write',
    ]);
    expect(getDefaultIntegrationPermissions('management_program')).toEqual(
      expect.arrayContaining(['bank-notification/read', 'bank-notification/manage'])
    );
    expect(
      hasIntegrationPermission(['bank-notification/read'], 'bank-notification/read' as never)
    ).toBe(true);
    expect(
      hasIntegrationPermission(['bank-notification/write'], 'bank-notification/manage' as never)
    ).toBe(false);
  });
});
