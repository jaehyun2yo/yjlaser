import { ApiKeyGuard } from './auth/api-key.guard';
import { DeviceEndpointPolicyGuard } from './auth/device-endpoint-policy.guard';
import { IntegrationPrincipalSourceGuard } from './auth/integration-principal-source.guard';
import { DeviceAuthModule } from './device-auth/device-auth.module';
import { IntegrationModule } from './integration.module';

describe('IntegrationModule device authentication wiring', () => {
  it('registers and exports composite source/policy guards without attaching them to legacy controllers', () => {
    const imports = Reflect.getMetadata('imports', IntegrationModule) as unknown[];
    const providers = Reflect.getMetadata('providers', IntegrationModule) as unknown[];
    const exports = Reflect.getMetadata('exports', IntegrationModule) as unknown[];

    expect(imports).toContain(DeviceAuthModule);
    expect(providers).toEqual(
      expect.arrayContaining([
        ApiKeyGuard,
        IntegrationPrincipalSourceGuard,
        DeviceEndpointPolicyGuard,
      ])
    );
    expect(exports).toEqual(
      expect.arrayContaining([IntegrationPrincipalSourceGuard, DeviceEndpointPolicyGuard])
    );
  });
});
jest.mock('../prisma/prisma.module', () => ({ PrismaModule: class PrismaModule {} }));
jest.mock('../auth/auth.module', () => ({ AuthModule: class AuthModule {} }));
jest.mock('./orders/orders.module', () => ({ OrdersModule: class OrdersModule {} }));
jest.mock('./events/events.module', () => ({ EventsModule: class EventsModule {} }));
jest.mock('./programs/programs.module', () => ({ ProgramsModule: class ProgramsModule {} }));
jest.mock('./delivery/delivery.module', () => ({ DeliveryModule: class DeliveryModule {} }));
jest.mock('./inventory/inventory.module', () => ({ InventoryModule: class InventoryModule {} }));
jest.mock('./gateway/integration.gateway.module', () => ({
  IntegrationGatewayModule: class IntegrationGatewayModule {},
}));
jest.mock('./sync-log/sync-log.module', () => ({ SyncLogModule: class SyncLogModule {} }));
jest.mock('./drawing-revisions/drawing-revisions.module', () => ({
  IntegrationDrawingRevisionsModule: class IntegrationDrawingRevisionsModule {},
}));
jest.mock('./dxf-match/dxf-match.module', () => ({ DxfMatchModule: class DxfMatchModule {} }));
jest.mock('./laser-completions/laser-completions.module', () => ({
  LaserCompletionsModule: class LaserCompletionsModule {},
}));
jest.mock('./nesting-tasks/nesting-tasks.module', () => ({
  NestingTasksModule: class NestingTasksModule {},
}));
jest.mock('./files/files.module', () => ({
  IntegrationFilesModule: class IntegrationFilesModule {},
}));
jest.mock('./operations/operations.module', () => ({
  OperationsModule: class OperationsModule {},
}));
jest.mock('./auth/api-key.module', () => ({ ApiKeyModule: class ApiKeyModule {} }));
jest.mock('./auth/api-key.controller', () => ({ ApiKeyController: class ApiKeyController {} }));
jest.mock('./file-transfer/file-transfer.controller', () => ({
  FileTransferController: class FileTransferController {},
}));
jest.mock('./log-events/log-events.module', () => ({ LogEventsModule: class LogEventsModule {} }));
jest.mock('./contacts/contacts.module', () => ({
  IntegrationContactsModule: class IntegrationContactsModule {},
}));
jest.mock('./bank-notifications/bank-notifications.module', () => ({
  BankNotificationsModule: class BankNotificationsModule {},
}));
jest.mock('./device-auth/device-auth.module', () => ({
  DeviceAuthModule: class DeviceAuthModule {},
}));
