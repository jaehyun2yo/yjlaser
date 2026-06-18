import type { Metadata, Viewport } from 'next';
import { ServiceWorkerRegistration } from './_components';

export const metadata: Metadata = {
  title: '현장작업 | 유진레이저목형',
  description: '목형 제조 현장 작업 관리 시스템',
  manifest: '/worker-manifest.json',
  icons: {
    icon: '/favicon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '현장작업',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#3b82f6',
};

export default function WorkerMobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <ServiceWorkerRegistration />
      {children}
    </div>
  );
}
