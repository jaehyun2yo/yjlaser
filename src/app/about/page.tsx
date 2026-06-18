'use client';

import { useState, useCallback } from 'react';
import type { AboutTab } from './_lib/types';
import { AboutTabs, MainStory, Timeline, ProcessSteps } from './_components';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';

export default function AboutPage() {
  const [activeTab, setActiveTab] = useState<AboutTab>('intro');

  const handleTabChange = useCallback((tab: AboutTab) => {
    setActiveTab(tab);
  }, []);

  return (
    <div
      className={`min-h-screen ${BG_COLOR.darker} transition-colors duration-200`}
      data-header-theme="light"
    >
      {/* 히어로 섹션 */}
      <section className="relative pt-32 pb-16 md:pt-40 md:pb-24 overflow-hidden">
        {/* 배경 그라데이션 */}
        <div className="absolute inset-0 bg-gradient-to-b from-muted via-background to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#ED6C00]/5 via-transparent to-transparent" />

        <div className="relative max-w-5xl mx-auto px-4 md:px-8 text-center">
          <p className="text-[#ED6C00] text-sm md:text-base font-medium tracking-widest uppercase mb-4">
            About YJ Laser
          </p>
          <h1
            className={`text-4xl md:text-5xl lg:text-6xl font-bold ${TEXT_COLOR.strong} mb-6 leading-tight`}
          >
            보이지 않는 곳에서
            <br />
            <span className="text-[#ED6C00]">완성</span>을 만듭니다
          </h1>
          <p
            className={`${TEXT_COLOR.subtle} text-lg md:text-xl max-w-2xl mx-auto leading-relaxed`}
          >
            2004년 설립 이래, 20년간 축적된 기술력으로
            <br className="hidden md:block" />
            패키징 산업의 든든한 기반이 되어왔습니다
          </p>
        </div>
      </section>

      {/* 메인 컨텐츠 */}
      <div className={`relative ${BG_COLOR.darker}`}>
        <div className="w-full max-w-5xl mx-auto px-4 md:px-8 pb-20">
          {/* 탭 네비게이션 */}
          <AboutTabs activeTab={activeTab} onTabChange={handleTabChange} />

          {/* 탭 컨텐츠 */}
          <div className="mt-8 md:mt-12">
            {activeTab === 'intro' && (
              <div>
                <MainStory />
              </div>
            )}
            {activeTab === 'history' && <Timeline />}
            {activeTab === 'process' && <ProcessSteps />}
          </div>
        </div>
      </div>
    </div>
  );
}
