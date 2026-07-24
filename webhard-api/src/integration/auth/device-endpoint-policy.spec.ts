import { DEFAULT_DEVICE_ACCESS_PERMISSIONS } from './integration-permissions';
import {
  DEVICE_ENDPOINT_POLICIES,
  getDeviceEndpointPolicy,
  normalizeDeviceEndpointPathTemplate,
} from './device-endpoint-policy';

describe('device endpoint policy registry', () => {
  it('locks the reviewed initial approved matrix with mandatory server-derived permissions', () => {
    expect(DEVICE_ENDPOINT_POLICIES.filter((policy) => policy.disposition === 'approved')).toEqual([
      expect.objectContaining({
        method: 'GET',
        pathTemplate: '/folders/children',
        programType: 'external_webhard_sync',
        permission: 'folder/read',
      }),
      expect.objectContaining({
        method: 'POST',
        pathTemplate: '/folders',
        programType: 'external_webhard_sync',
        permission: 'folder/write',
      }),
      expect.objectContaining({
        method: 'PATCH',
        pathTemplate: '/folders/:id/rename',
        programType: 'external_webhard_sync',
        permission: 'folder/write',
      }),
      expect.objectContaining({
        method: 'PATCH',
        pathTemplate: '/folders/:id/move',
        programType: 'external_webhard_sync',
        permission: 'folder/move',
      }),
      expect.objectContaining({
        method: 'GET',
        pathTemplate: '/files',
        programType: 'external_webhard_sync',
        permission: 'file/read',
      }),
      expect.objectContaining({
        method: 'POST',
        pathTemplate: '/files/presigned-url',
        programType: 'external_webhard_sync',
        permission: 'file/write',
      }),
      expect.objectContaining({
        method: 'POST',
        pathTemplate: '/files/confirm',
        programType: 'external_webhard_sync',
        permission: 'file/write',
      }),
      expect.objectContaining({
        method: 'PATCH',
        pathTemplate: '/files/:id/rename',
        programType: 'external_webhard_sync',
        permission: 'file/write',
      }),
      expect.objectContaining({
        method: 'PATCH',
        pathTemplate: '/files/:id/move',
        programType: 'external_webhard_sync',
        permission: 'file/move',
      }),
      expect.objectContaining({
        method: 'POST',
        pathTemplate: '/integration/events',
        programType: 'management_program',
        permission: 'event/write',
      }),
      expect.objectContaining({
        method: 'GET',
        pathTemplate: '/integration/orders',
        programType: 'management_program',
        permission: 'job/read',
      }),
      expect.objectContaining({
        method: 'GET',
        pathTemplate: '/integration/bank-notifications',
        programType: 'management_program',
        permission: 'bank-notification/read',
      }),
      expect.objectContaining({
        method: 'PATCH',
        pathTemplate: '/integration/bank-notifications/mark-processed',
        programType: 'management_program',
        permission: 'bank-notification/manage',
      }),
      expect.objectContaining({
        method: 'POST',
        pathTemplate: '/integration/bank-notifications/backup-batches',
        programType: 'management_program',
        permission: 'bank-notification/manage',
      }),
    ]);
    for (const policy of DEVICE_ENDPOINT_POLICIES) {
      expect(Object.isFrozen(policy)).toBe(true);
      if (policy.disposition === 'approved') {
        expect(DEFAULT_DEVICE_ACCESS_PERMISSIONS[policy.programType]).toContain(policy.permission);
      }
    }
    expect(Object.isFrozen(DEVICE_ENDPOINT_POLICIES)).toBe(true);
  });

  it('uses exact method, normalized template, and program type keys with default deny', () => {
    expect(normalizeDeviceEndpointPathTemplate(' /files//:id/move/ ')).toBe('/files/:id/move');
    expect(
      getDeviceEndpointPolicy('PATCH', ' /files//:id/move/ ', 'external_webhard_sync')
    ).toMatchObject({ disposition: 'approved', permission: 'file/move' });
    expect(
      getDeviceEndpointPolicy('POST', '/files/:id/move', 'external_webhard_sync')
    ).toMatchObject({ disposition: 'hard_hold' });
    expect(getDeviceEndpointPolicy('PATCH', '/files/:id/move', 'management_program')).toMatchObject(
      { disposition: 'hard_hold' }
    );
    expect(getDeviceEndpointPolicy('GET', '/unregistered', 'nesting_program')).toMatchObject({
      disposition: 'hard_hold',
    });
  });
});
