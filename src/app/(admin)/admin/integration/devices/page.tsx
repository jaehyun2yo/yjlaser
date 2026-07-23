import { IntegrationNav } from '@/app/(admin)/admin/integration/_components';
import { DeviceEnvironmentBoundary } from '@/app/(admin)/admin/integration/devices/_components/DeviceEnvironmentBoundary';
import { parseExpectedDeviceAuthEnvironment } from '@/app/(admin)/admin/integration/devices/_lib/device-auth-environment';

export default function DevicesPage() {
  const expectedEnvironment = parseExpectedDeviceAuthEnvironment(
    process.env.NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT
  );

  return (
    <div className="space-y-6">
      <IntegrationNav />

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">장치 인증</h1>
        <p className="text-sm text-muted-foreground">
          승인된 연동 프로그램용 일회성 등록 코드를 발급하고 등록 장치를 관리합니다.
        </p>
      </header>

      <DeviceEnvironmentBoundary expectedEnvironment={expectedEnvironment} />
    </div>
  );
}
