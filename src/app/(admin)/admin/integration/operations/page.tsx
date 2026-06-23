import { IntegrationNav } from '@/app/(admin)/admin/integration/_components';
import { OperationsDashboard } from './_components/OperationsDashboard';
import { TEXT_COLOR } from '@/lib/styles';

export default function OperationsPage() {
  return (
    <div className="space-y-6">
      <IntegrationNav />

      <header className="space-y-1">
        <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>운영현황</h1>
      </header>

      <OperationsDashboard />
    </div>
  );
}
