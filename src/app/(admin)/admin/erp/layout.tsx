import { TEXT_COLOR } from '@/lib/styles';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ERP 시스템 | YJLaser 관리자',
  description: '목형 제조 작업 관리 시스템',
};

export default function ErpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl sm:text-2xl lg:text-3xl font-bold ${TEXT_COLOR.primary}`}>
          ERP 작업관리
        </h1>
        <p className={`text-sm sm:text-base ${TEXT_COLOR.secondary} mt-1 sm:mt-2`}>
          도면 확정된 문의를 확인하고 작업 현황을 관리하세요
        </p>
      </div>
      {children}
    </div>
  );
}
