'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { BaseModal } from '@/components/modals/BaseModal';
import { DailyContactsChart } from './DailyContactsChart';

interface ContactsChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: { date: string; count: number; fullDate: string }[];
  yesterdayChange: number;
}

export function ContactsChartModal({
  isOpen,
  onClose,
  data,
  yesterdayChange,
}: ContactsChartModalProps) {
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="문의건수 상세" maxWidth="4xl">
      <div className="space-y-4">
        {/* 어제 대비 변화 */}
        <div className={`p-4 ${BG_COLOR.muted} rounded-lg`}>
          <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>어제 대비</p>
          <p
            className={`text-2xl font-bold ${yesterdayChange > 0 ? TEXT_COLOR.error : yesterdayChange < 0 ? TEXT_COLOR.info : TEXT_COLOR.secondary}`}
          >
            {yesterdayChange > 0
              ? `+${yesterdayChange}`
              : yesterdayChange < 0
                ? `${yesterdayChange}`
                : '0'}
          </p>
        </div>

        {/* 그래프 */}
        <div className={`${BG_COLOR.card} p-6 rounded-xl border ${BORDER_COLOR.default}`}>
          <DailyContactsChart data={data} />
        </div>
      </div>
    </BaseModal>
  );
}
