'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';

interface DailyContactsChartProps {
  data: { date: string; count: number; fullDate: string }[];
}

type PeriodType = 'daily' | 'weekly' | 'monthly';

export function DailyContactsChart({ data }: DailyContactsChartProps) {
  const [isDark, setIsDark] = useState(false);
  const [period, setPeriod] = useState<PeriodType>('daily');

  useEffect(() => {
    // 다크모드 감지
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();

    // 다크모드 변경 감지
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // 주차 계산 함수
  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  };

  // 기간별 데이터 그룹화
  const groupedData = useMemo(() => {
    if (period === 'daily') {
      return data.map((item) => ({
        date: item.date,
        count: item.count,
      }));
    }

    if (period === 'weekly') {
      const weekMap = new Map<string, number>();
      data.forEach((item) => {
        const date = new Date(item.fullDate);
        const year = date.getFullYear();
        const weekNumber = getWeekNumber(date);
        const _weekKey = `${year}-${getWeekNumber(date)}`;
        const weekLabel = `${year}년 ${weekNumber}주차`;
        weekMap.set(weekLabel, (weekMap.get(weekLabel) || 0) + item.count);
      });

      return Array.from(weekMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => {
          const aMatch = a.date.match(/(\d+)년 (\d+)주차/);
          const bMatch = b.date.match(/(\d+)년 (\d+)주차/);
          if (!aMatch || !bMatch) return 0;
          if (aMatch[1] !== bMatch[1]) return parseInt(aMatch[1]) - parseInt(bMatch[1]);
          return parseInt(aMatch[2]) - parseInt(bMatch[2]);
        });
    }

    if (period === 'monthly') {
      const monthMap = new Map<string, number>();
      data.forEach((item) => {
        const date = new Date(item.fullDate);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const _monthKey = `${year}-${month}`;
        const monthLabel = `${year}년 ${month}월`;
        monthMap.set(monthLabel, (monthMap.get(monthLabel) || 0) + item.count);
      });

      return Array.from(monthMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => {
          const aMatch = a.date.match(/(\d+)년 (\d+)월/);
          const bMatch = b.date.match(/(\d+)년 (\d+)월/);
          if (!aMatch || !bMatch) return 0;
          if (aMatch[1] !== bMatch[1]) return parseInt(aMatch[1]) - parseInt(bMatch[1]);
          return parseInt(aMatch[2]) - parseInt(bMatch[2]);
        });
    }

    return [];
  }, [data, period]);

  const textColor = isDark ? '#e5e7eb' : '#374151';
  const gridColor = isDark ? '#374151' : '#d1d5db';
  const tooltipBg = isDark ? '#1f2937' : '#ffffff';
  const tooltipBorder = isDark ? '#374151' : '#e5e7eb';
  const tooltipText = isDark ? '#e5e7eb' : '#374151';

  return (
    <div className="space-y-4">
      {/* 기간 선택 버튼 */}
      <div className="flex items-center gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => setPeriod('daily')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === 'daily'
                ? 'bg-[#ED6C00] text-white'
                : `${BG_COLOR.muted} ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
            }`}
          >
            일별
          </button>
          <button
            onClick={() => setPeriod('weekly')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === 'weekly'
                ? 'bg-[#ED6C00] text-white'
                : `${BG_COLOR.muted} ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
            }`}
          >
            주별
          </button>
          <button
            onClick={() => setPeriod('monthly')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === 'monthly'
                ? 'bg-[#ED6C00] text-white'
                : `${BG_COLOR.muted} ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
            }`}
          >
            월별
          </button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={250}>
        <LineChart
          data={groupedData}
          margin={{
            top: 5,
            right: 10,
            left: 10,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="date" tick={{ fill: textColor, fontSize: 12 }} stroke={gridColor} />
          <YAxis tick={{ fill: textColor, fontSize: 12 }} stroke={gridColor} />
          <Tooltip
            contentStyle={{
              backgroundColor: tooltipBg,
              border: `1px solid ${tooltipBorder}`,
              borderRadius: '8px',
              color: tooltipText,
            }}
            labelStyle={{ color: tooltipText, fontWeight: 'bold' }}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#ED6C00"
            strokeWidth={2}
            name="문의건수"
            dot={{ fill: '#ED6C00', r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
