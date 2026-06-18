'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { BaseModal } from '@/components/modals/BaseModal';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { useEffect, useState } from 'react';

interface ContactReferral {
  referral_source: string | null;
  count: number;
}

interface ReferralSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  referralSources: ContactReferral[];
}

export function ReferralSourceModal({
  isOpen,
  onClose,
  referralSources,
}: ReferralSourceModalProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();

    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const totalCount = referralSources.reduce((sum, item) => sum + item.count, 0);

  const chartData = referralSources.map((item) => ({
    name: item.referral_source || '기타',
    value: item.count,
    percentage: totalCount > 0 ? ((item.count / totalCount) * 100).toFixed(1) : '0',
  }));

  const COLORS = [
    '#ED6C00',
    '#2563eb',
    '#10b981',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#f97316',
  ];

  const textColor = isDark ? '#e5e7eb' : '#374151';
  const tooltipBg = isDark ? '#1f2937' : '#ffffff';
  const tooltipBorder = isDark ? '#374151' : '#e5e7eb';
  const tooltipText = isDark ? '#e5e7eb' : '#374151';
  const gridColor = isDark ? '#374151' : '#e5e7eb';

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="트래픽 유입경로 상세" maxWidth="4xl">
      <div className="space-y-6">
        {/* 총 문의 건수 */}
        <div className={`p-4 ${BG_COLOR.muted} rounded-lg`}>
          <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>최근 30일간 총 문의</p>
          <p className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>{totalCount}건</p>
          <p className={`text-xs ${TEXT_COLOR.secondary} mt-2`}>
            사이트 방문 시 경유한 경로별 통계
          </p>
        </div>

        {/* 유입경로 파이 차트 */}
        {chartData.length > 0 ? (
          <div className={`${BG_COLOR.card} p-6 rounded-xl border ${BORDER_COLOR.default}`}>
            <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-2`}>
              사이트 방문 경로 분포
            </h3>
            <p className={`text-sm ${TEXT_COLOR.secondary} mb-4`}>
              사용자가 어떤 경로를 통해 사이트에 접속했는지 표시합니다
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ''} (${(Number(percent ?? 0) * 100).toFixed(0)}%)`
                  }
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    borderRadius: '8px',
                    color: tooltipText,
                  }}
                />
                <Legend wrapperStyle={{ color: textColor }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        {/* 유입경로 막대 그래프 */}
        {chartData.length > 0 ? (
          <div className={`${BG_COLOR.card} p-6 rounded-xl border ${BORDER_COLOR.default}`}>
            <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-2`}>
              방문 경로별 문의 건수
            </h3>
            <p className={`text-sm ${TEXT_COLOR.secondary} mb-4`}>
              경로별로 얼마나 많은 문의가 발생했는지 비교합니다
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="name" tick={{ fill: textColor, fontSize: 12 }} stroke={gridColor} />
                <YAxis tick={{ fill: textColor, fontSize: 12 }} stroke={gridColor} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    borderRadius: '8px',
                    color: tooltipText,
                  }}
                />
                <Bar dataKey="value" fill="#ED6C00" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        {/* 유입경로 상세 목록 */}
        <div className={`${BG_COLOR.card} p-6 rounded-xl border ${BORDER_COLOR.default}`}>
          <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-2`}>
            방문 경로별 상세 ({referralSources.length}개)
          </h3>
          <p className={`text-sm ${TEXT_COLOR.secondary} mb-4`}>
            각 경로별 문의 건수와 비율을 확인할 수 있습니다
          </p>
          {referralSources.length > 0 ? (
            <div className="space-y-2">
              {referralSources.map((item, index) => {
                const percentage =
                  totalCount > 0 ? ((item.count / totalCount) * 100).toFixed(1) : '0';
                return (
                  <div
                    key={item.referral_source || '기타'}
                    className={`flex items-center justify-between p-3 ${BG_COLOR.muted} rounded-lg border ${BORDER_COLOR.default}`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className={`font-medium ${TEXT_COLOR.primary}`}>
                        {item.referral_source || '기타'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-sm ${TEXT_COLOR.secondary}`}>{percentage}%</span>
                      <span
                        className={`text-sm font-bold ${TEXT_COLOR.primary} min-w-[3rem] text-right`}
                      >
                        {item.count}건
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={`text-center py-8 ${TEXT_COLOR.secondary}`}>유입경로 데이터가 없습니다</p>
          )}
        </div>
      </div>
    </BaseModal>
  );
}
