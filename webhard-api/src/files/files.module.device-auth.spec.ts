import { ApiKeyGuard } from '../integration/auth/api-key.guard';
import { DeviceEndpointPolicyGuard } from '../integration/auth/device-endpoint-policy.guard';
import { IntegrationPrincipalSourceGuard } from '../integration/auth/integration-principal-source.guard';
import { DeviceAuthModule } from '../integration/device-auth/device-auth.module';
import { FilesModule } from './files.module';

describe('FilesModule device authentication wiring', () => {
  it('imports device authentication and registers the composite route guards', () => {
    const imports = Reflect.getMetadata('imports', FilesModule) as unknown[];
    const providers = Reflect.getMetadata('providers', FilesModule) as unknown[];

    expect(imports).toContain(DeviceAuthModule);
    expect(providers).toEqual(
      expect.arrayContaining([
        ApiKeyGuard,
        IntegrationPrincipalSourceGuard,
        DeviceEndpointPolicyGuard,
      ])
    );
  });
});
