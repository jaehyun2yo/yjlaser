import { redirect } from 'next/navigation';

export default function IntegrationDefaultPage() {
  redirect('/admin/integration/companies');
}
