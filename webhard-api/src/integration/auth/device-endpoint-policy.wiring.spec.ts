import { Type } from '@nestjs/common';
import { FilesModule } from '../../files/files.module';
import { FilesController } from '../../files/files.controller';
import { FoldersModule } from '../../folders/folders.module';
import { FoldersController } from '../../folders/folders.controller';
import { BankNotificationsController } from '../bank-notifications/bank-notifications.controller';
import { BankNotificationsModule } from '../bank-notifications/bank-notifications.module';
import { DeviceAuthModule } from '../device-auth/device-auth.module';
import { EventsController } from '../events/events.controller';
import { EventsModule } from '../events/events.module';
import { OrdersController } from '../orders/orders.controller';
import { OrdersModule } from '../orders/orders.module';
import { ApiKeyGuard } from './api-key.guard';
import { DEVICE_ENDPOINT_POLICIES } from './device-endpoint-policy';
import { DeviceEndpointPolicyGuard } from './device-endpoint-policy.guard';
import { IntegrationPrincipalSourceGuard } from './integration-principal-source.guard';
import { DEVICE_ENDPOINT_POLICY_KEY } from './require-device-endpoint-policy.decorator';

describe('device endpoint policy sibling module wiring', () => {
  it.each([
    ['FilesModule', FilesModule],
    ['FoldersModule', FoldersModule],
    ['EventsModule', EventsModule],
    ['OrdersModule', OrdersModule],
    ['BankNotificationsModule', BankNotificationsModule],
  ] as const)(
    '%s imports exported device auth and owns the shared route guards',
    (_name, module) => {
      const imports = Reflect.getMetadata('imports', module) as Type<unknown>[];
      const providers = Reflect.getMetadata('providers', module) as Type<unknown>[];

      expect(imports).toContain(DeviceAuthModule);
      expect(providers).toEqual(
        expect.arrayContaining([
          ApiKeyGuard,
          IntegrationPrincipalSourceGuard,
          DeviceEndpointPolicyGuard,
        ])
      );
    }
  );

  it('DeviceAuthModule exports both bearer source providers used by sibling composite guards', () => {
    const exported = Reflect.getMetadata('exports', DeviceAuthModule) as unknown[];
    expect(exported.map((value) => (value as { name?: string }).name)).toEqual(
      expect.arrayContaining(['DeviceBearerRequestSourceGuard', 'DeviceBearerGuard'])
    );
  });

  it('wires every approved registry row to exactly one controller handler', () => {
    const handlers = [
      FilesController.prototype.getFiles,
      FilesController.prototype.getPresignedUrl,
      FilesController.prototype.confirmUpload,
      FilesController.prototype.renameFile,
      FilesController.prototype.moveFile,
      FoldersController.prototype.getChildFolders,
      FoldersController.prototype.createFolder,
      FoldersController.prototype.renameFolder,
      FoldersController.prototype.moveFolder,
      EventsController.prototype.createEvent,
      OrdersController.prototype.getOrders,
      BankNotificationsController.prototype.list,
      BankNotificationsController.prototype.markProcessed,
      BankNotificationsController.prototype.createBackupBatch,
    ];
    const wired = handlers.map((handler) =>
      Reflect.getMetadata(DEVICE_ENDPOINT_POLICY_KEY, handler)
    );
    const approved = DEVICE_ENDPOINT_POLICIES.map(({ method, pathTemplate }) => ({
      method,
      pathTemplate,
    }));

    expect(wired).toHaveLength(DEVICE_ENDPOINT_POLICIES.length);
    expect(wired).toEqual(expect.arrayContaining(approved));
    expect(new Set(wired.map((entry) => `${entry.method} ${entry.pathTemplate}`)).size).toBe(
      approved.length
    );
  });
});
