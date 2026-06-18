import { FaFileAlt, FaCheckCircle, FaSpinner, FaEye } from 'react-icons/fa';
import type { Stats } from '@/app/company/dashboard/types';
import { BG_COLOR, TEXT_COLOR, BORDER_COLOR } from '@/lib/styles';

interface StatsCardsProps {
  stats: Stats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div
        className={`${BG_COLOR.card} p-4 rounded-lg shadow-md border-l-4 border-blue-500 border ${BORDER_COLOR.default}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className={`${TEXT_COLOR.secondary} text-xs mb-1`}>전체 문의</p>
            <p className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>{stats.total}</p>
          </div>
          <div className="bg-blue-500 p-2.5 rounded-full">
            <FaFileAlt className="text-white text-lg" />
          </div>
        </div>
      </div>
      <div
        className={`${BG_COLOR.card} p-4 rounded-lg shadow-md border-l-4 border-yellow-500 border ${BORDER_COLOR.default}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className={`${TEXT_COLOR.secondary} text-xs mb-1`}>신규 문의</p>
            <p className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>{stats.new}</p>
          </div>
          <div className="bg-yellow-500 p-2.5 rounded-full">
            <FaSpinner className="text-white text-lg" />
          </div>
        </div>
      </div>
      <div
        className={`${BG_COLOR.card} p-4 rounded-lg shadow-md border-l-4 border-orange-500 border ${BORDER_COLOR.default}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className={`${TEXT_COLOR.secondary} text-xs mb-1`}>작업중</p>
            <p className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>{stats.inProgress}</p>
          </div>
          <div className="bg-orange-500 p-2.5 rounded-full">
            <FaEye className="text-white text-lg" />
          </div>
        </div>
      </div>
      <div
        className={`${BG_COLOR.card} p-4 rounded-lg shadow-md border-l-4 border-green-500 border ${BORDER_COLOR.default}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className={`${TEXT_COLOR.secondary} text-xs mb-1`}>완료</p>
            <p className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>{stats.completed}</p>
          </div>
          <div className="bg-green-500 p-2.5 rounded-full">
            <FaCheckCircle className="text-white text-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
