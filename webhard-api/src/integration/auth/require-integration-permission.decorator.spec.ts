import {
  INTEGRATION_PERMISSION_KEY,
  RequireIntegrationPermission,
} from './require-integration-permission.decorator';

@RequireIntegrationPermission('operation/read')
class TestIntegrationController {
  @RequireIntegrationPermission('event/write')
  createEvent() {
    return undefined;
  }
}

describe('RequireIntegrationPermission', () => {
  it('class metadata에 integration permission을 기록한다', () => {
    expect(Reflect.getMetadata(INTEGRATION_PERMISSION_KEY, TestIntegrationController)).toBe(
      'operation/read'
    );
  });

  it('handler metadata에 integration permission을 기록한다', () => {
    expect(
      Reflect.getMetadata(
        INTEGRATION_PERMISSION_KEY,
        TestIntegrationController.prototype.createEvent
      )
    ).toBe('event/write');
  });
});
