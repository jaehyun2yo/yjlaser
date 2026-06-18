import { IntegrationNav } from '@/app/(admin)/admin/integration/_components';
import { HealthDashboard } from './_components/HealthDashboard';

export default function IntegrationHealthPage() {
  return (
    <div className="space-y-6">
      <IntegrationNav />
      <HealthDashboard />
    </div>
  );
}
