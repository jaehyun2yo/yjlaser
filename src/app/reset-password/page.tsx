import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/app/reset-password/ResetPasswordForm';
import { BG_COLOR } from '@/lib/styles';

export const metadata: Metadata = {
  referrer: 'no-referrer',
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }>;
}) {
  const params = (await searchParams) || {};

  return (
    <main className={`min-h-screen ${BG_COLOR.page} flex items-center justify-center px-6 py-12`}>
      <ResetPasswordForm token={params.token || ''} />
    </main>
  );
}
