import { SetMetadata } from '@nestjs/common';
import type { IntegrationPermission } from './integration-permissions';

export const INTEGRATION_PERMISSION_KEY = 'integration:permission';

export const RequireIntegrationPermission = (permission: IntegrationPermission) =>
  SetMetadata(INTEGRATION_PERMISSION_KEY, permission);
