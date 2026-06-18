import { SetMetadata } from '@nestjs/common';

export const ALLOW_INTEGRATION_PRINCIPAL_KEY = 'allowIntegrationPrincipal';

export const AllowIntegrationPrincipal = () => SetMetadata(ALLOW_INTEGRATION_PRINCIPAL_KEY, true);
