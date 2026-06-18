'use client';

import { useCallback } from 'react';
import type { FC } from 'react';
import type { AboutTab } from '@/app/about/_lib/types';
import { BG_COLOR } from '@/lib/styles';

interface TabItem {
  id: AboutTab;
  label: string;
}

const TABS: TabItem[] = [
  { id: 'intro', label: '소개' },
  { id: 'history', label: '회사연혁' },
  { id: 'process', label: '제작과정' },
];

interface AboutTabsProps {
  activeTab: AboutTab;
  onTabChange: (tab: AboutTab) => void;
}

const AboutTabs: FC<AboutTabsProps> = ({ activeTab, onTabChange }) => {
  const handleTabClick = useCallback(
    (tab: AboutTab) => {
      onTabChange(tab);
    },
    [onTabChange]
  );

  return (
    <nav className="relative mb-12 md:mb-16">
      {/* 배경 라인 */}
      <div className={`absolute bottom-0 left-0 right-0 h-px ${BG_COLOR.medium}`} />

      <div className="flex justify-center gap-2 md:gap-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`
              relative px-6 md:px-10 py-4 md:py-5
              text-sm md:text-base font-medium
              transition-all duration-300 ease-out
              ${activeTab === tab.id ? 'text-[#ED6C00]' : '${TEXT_COLOR.dim} ${TEXT_COLOR.hoverTertiary}'}
            `}
          >
            {tab.label}
            {/* 활성 인디케이터 */}
            <span
              className={`
                absolute bottom-0 left-1/2 -translate-x-1/2
                h-0.5 bg-[#ED6C00]
                transition-all duration-300 ease-out
                ${activeTab === tab.id ? 'w-full' : 'w-0'}
              `}
            />
          </button>
        ))}
      </div>
    </nav>
  );
};

export default AboutTabs;
