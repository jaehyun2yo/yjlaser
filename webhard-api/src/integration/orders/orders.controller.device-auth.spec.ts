import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { DeviceEndpointPolicyGuard } from '../auth/device-endpoint-policy.guard';
import { IntegrationPrincipalSourceGuard } from '../auth/integration-principal-source.guard';
import { DeviceBearerGuard } from '../device-auth/device-bearer.guard';
import { DeviceBearerRequestSourceGuard } from '../device-auth/device-bearer-request-source.guard';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

const ORDER_ID = 'order-1';

describe('OrdersController device endpoint policy', () => {
  let app: INestApplication;
  const service = Object.fromEntries(
    [
      'getOrderStats',
      'getWorkshopOrders',
      'getOrders',
      'getNextNumbers',
      'searchCompanyByName',
      'getOrder',
      'createOrder',
      'updateOrder',
      'updateOrderStatus',
      'getOrderEvents',
      'getOrderTimeline',
      'getProcessStage',
      'updateProcessStage',
    ].map((name) => [name, jest.fn()])
  ) as Record<string, jest.Mock>;
  const canActivateStrict = jest.fn((context: ExecutionContext): boolean => {
    const req = context.switchToHttp().getRequest();
    if (req.headers['x-api-key']) {
      req.user = { userType: 'integration', userId: 'legacy', companyId: null };
      req.apiKeyInfo = { id: 'legacy' };
      return true;
    }
    if (String(req.headers.cookie ?? '').includes('admin-session=')) {
      req.user = { userType: 'admin', userId: 'admin', companyId: 0 };
      return true;
    }
    return false;
  });
  const apiKeyGuard = {
    canActivate: jest.fn((context: ExecutionContext) => canActivateStrict(context)),
    canActivateStrict,
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        Reflector,
        IntegrationPrincipalSourceGuard,
        DeviceEndpointPolicyGuard,
        { provide: ApiKeyGuard, useValue: apiKeyGuard },
        {
          provide: DeviceBearerRequestSourceGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
        {
          provide: DeviceBearerGuard,
          useValue: {
            canActivate: jest.fn((context: ExecutionContext) => {
              const req = context.switchToHttp().getRequest();
              const state = req.headers['x-test-device-state'];
              if (['revoked', 'stale', 'wrong_environment'].includes(state)) {
                throw new UnauthorizedException(`synthetic ${state}`);
              }
              req.deviceAuthInfo = {
                deviceId: 'device-1',
                environment: 'prd',
                programType: req.headers['x-test-program'] ?? 'management_program',
                capabilityProfile: req.headers['x-test-capability'] ?? 'standard',
                permissions: String(req.headers['x-test-permissions'] ?? '')
                  .split(',')
                  .filter(Boolean),
                credentialVersion: 4,
              };
              return true;
            }),
          },
        },
        { provide: OrdersService, useValue: service },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue(apiKeyGuard)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    service.getOrders.mockResolvedValue({ orders: [] });
  });

  it('allows exact management_program job/read only', async () => {
    await get({ 'X-Test-Permissions': 'job/read' }).expect(200);
    expect(service.getOrders).toHaveBeenCalledTimes(1);
    const denied: Array<Record<string, string>> = [
      { 'X-Test-Program': 'external_webhard_sync', 'X-Test-Permissions': 'job/read' },
      { 'X-Test-Program': 'nesting_program', 'X-Test-Permissions': 'job/read' },
      { 'X-Test-Permissions': '' },
      { 'X-Test-Capability': 'safe_canary', 'X-Test-Permissions': 'job/read' },
      { 'X-Test-Device-State': 'revoked', 'X-Test-Permissions': 'job/read' },
      { 'X-Test-Device-State': 'stale', 'X-Test-Permissions': 'job/read' },
      { 'X-Test-Device-State': 'wrong_environment', 'X-Test-Permissions': 'job/read' },
      { 'X-API-Key': 'legacy', 'X-Test-Permissions': 'job/read' },
    ];
    for (const headers of denied) {
      jest.clearAllMocks();
      await get(headers).expect((res) => {
        if (![401, 403].includes(res.status)) throw new Error(`expected deny, got ${res.status}`);
      });
      expect(service.getOrders).not.toHaveBeenCalled();
    }
  });

  it('preserves legacy API-key and admin session reads', async () => {
    await request(app.getHttpServer())
      .get('/integration/orders')
      .set('X-API-Key', 'legacy')
      .expect(200);
    await request(app.getHttpServer())
      .get('/integration/orders')
      .set('Cookie', 'admin-session=synthetic')
      .expect(200);
    expect(service.getOrders).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['get', '/integration/orders/stats'],
    ['get', '/integration/orders/workshop'],
    ['get', '/integration/orders/numbers/next'],
    ['get', '/integration/orders/companies/search?name=x'],
    ['get', `/integration/orders/${ORDER_ID}`],
    ['post', '/integration/orders'],
    ['patch', `/integration/orders/${ORDER_ID}`],
    ['patch', `/integration/orders/${ORDER_ID}/status`],
    ['get', `/integration/orders/${ORDER_ID}/events`],
    ['get', `/integration/orders/${ORDER_ID}/timeline`],
    ['get', `/integration/orders/${ORDER_ID}/process-stage`],
    ['patch', `/integration/orders/${ORDER_ID}/process-stage`],
  ] as const)('%s %s is held before every service call', async (method, path) => {
    const agent = request(app.getHttpServer());
    const call =
      method === 'get' ? agent.get(path) : method === 'post' ? agent.post(path) : agent.patch(path);
    await call
      .set('Authorization', 'Bearer synthetic.jwt.token')
      .set('X-Test-Permissions', 'job/read')
      .send({})
      .expect(403);
    expect(Object.values(service).every((mock) => mock.mock.calls.length === 0)).toBe(true);
  });

  function get(headers: Record<string, string>) {
    const call = request(app.getHttpServer())
      .get('/integration/orders')
      .set('Authorization', 'Bearer synthetic.jwt.token');
    for (const [name, value] of Object.entries(headers)) call.set(name, value);
    return call;
  }
});
