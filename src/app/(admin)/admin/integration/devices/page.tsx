import { IntegrationNav } from '@/app/(admin)/admin/integration/_components';
import { DeviceEnrollmentPanel } from '@/app/(admin)/admin/integration/devices/_components/DeviceEnrollmentPanel';
import { DeviceManagementPanel } from '@/app/(admin)/admin/integration/devices/_components/DeviceManagementPanel';

export default function DevicesPage() {
  return (
    <div className="space-y-6">
      <IntegrationNav />

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">장치 인증</h1>
        <p className="text-sm text-muted-foreground">
          승인된 연동 프로그램용 일회성 등록 코드를 발급하고 등록 장치를 관리합니다.
        </p>
      </header>

      <DeviceEnrollmentPanel />
      <DeviceManagementPanel />
    </div>
  );
}
