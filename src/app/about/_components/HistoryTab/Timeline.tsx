'use client';

import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import { HISTORY_DATA } from '@/app/about/_lib/data';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';

const Timeline: FC = () => {
  const pathRef = useRef<SVGPathElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeDots, setActiveDots] = useState<boolean[]>(
    new Array(HISTORY_DATA.length).fill(false)
  );
  const [isDesktop, setIsDesktop] = useState(false);

  // 아이템 수에 따른 SVG 높이 계산
  const itemCount = HISTORY_DATA.length;
  const itemHeight = 180; // 간격
  const svgHeight = itemCount * itemHeight;
  const svgStartX = 20; // SVG 내부 X 좌표

  useEffect(() => {
    setIsDesktop(window.innerWidth >= 768);
  }, []);

  useEffect(() => {
    const path = pathRef.current;
    const container = containerRef.current;
    if (!path || !container) return;

    const pathLength = path.getTotalLength();
    path.style.strokeDasharray = `${pathLength}`;
    path.style.strokeDashoffset = `${pathLength}`;

    const handleScroll = () => {
      const rect = container.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const containerTop = rect.top;
      const containerHeight = rect.height;

      // 화면 하단 1/3 지점에서 시작 (triggerPoint = 화면 높이의 2/3 지점)
      const triggerPoint = windowHeight * (2 / 3);

      // 컨테이너가 트리거 지점을 지났을 때부터 진행도 계산
      const scrollProgress = Math.max(
        0,
        Math.min(1, (triggerPoint - containerTop) / containerHeight)
      );

      const drawLength = pathLength * scrollProgress;
      path.style.strokeDashoffset = `${pathLength - drawLength}`;

      // 각 도트가 활성화되어야 하는지 계산
      const newActiveDots = HISTORY_DATA.map((_, index) => {
        const dotProgress = index / (itemCount - 1 || 1);
        return scrollProgress >= dotProgress;
      });
      setActiveDots(newActiveDots);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // 초기 실행

    return () => window.removeEventListener('scroll', handleScroll);
  }, [itemCount]);

  // 구불구불한 path 생성
  const generatePath = () => {
    const points: string[] = [];
    const amplitude = 15;

    for (let i = 0; i < itemCount; i++) {
      const y = i * itemHeight + 16;
      const nextY = (i + 1) * itemHeight + 16;

      if (i === 0) {
        points.push(`M ${svgStartX} ${y}`);
      }

      if (i < itemCount - 1) {
        const midY = (y + nextY) / 2;
        const direction = i % 2 === 0 ? 1 : -1;
        points.push(`Q ${svgStartX + amplitude * direction} ${midY}, ${svgStartX} ${nextY}`);
      }
    }

    return points.join(' ');
  };

  // 도트 Y 위치 계산
  const getDotY = (index: number) => index * itemHeight + 16;

  return (
    <section>
      {/* 섹션 타이틀 */}
      <div className="text-center mb-16 md:mb-24">
        <h2 className={`text-3xl md:text-4xl font-bold ${TEXT_COLOR.strong}`}>회사 연혁</h2>
      </div>

      {/* 타임라인 */}
      <div ref={containerRef} className="relative max-w-3xl mx-auto px-4">
        {/* 구불구불한 SVG 라인 + 도트 */}
        <svg
          className="absolute top-0 pointer-events-none hidden md:block"
          style={{ height: svgHeight, left: '140px' }}
          viewBox={`0 0 100 ${svgHeight}`}
          preserveAspectRatio="xMinYMin meet"
        >
          {/* 배경 라인 (연한 색) */}
          <path
            d={generatePath()}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={TEXT_COLOR.dimInvertSoft}
          />
          {/* 애니메이션 라인 */}
          <path
            ref={pathRef}
            d={generatePath()}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-[#ED6C00]"
            style={{ transition: 'stroke-dashoffset 0.15s ease-out' }}
          />

          {/* SVG 도트들 */}
          {HISTORY_DATA.map((_, index) => (
            <g key={index}>
              {/* 외부 글로우 링 */}
              <circle
                cx={svgStartX}
                cy={getDotY(index)}
                r={activeDots[index] ? 14 : 10}
                fill={activeDots[index] ? 'rgba(237, 108, 0, 0.12)' : 'transparent'}
                style={{ transition: 'all 0.4s ease-out' }}
              />
              {/* 중간 링 */}
              <circle
                cx={svgStartX}
                cy={getDotY(index)}
                r={activeDots[index] ? 9 : 7}
                fill={activeDots[index] ? 'rgba(237, 108, 0, 0.25)' : 'rgba(156, 163, 175, 0.15)'}
                style={{ transition: 'all 0.3s ease-out' }}
              />
              {/* 메인 도트 */}
              <circle
                cx={svgStartX}
                cy={getDotY(index)}
                r={activeDots[index] ? 5 : 4}
                fill={activeDots[index] ? '#ED6C00' : '#9CA3AF'}
                style={{ transition: 'all 0.3s ease-out' }}
              />
            </g>
          ))}
        </svg>

        {/* 모바일 세로 라인 */}
        <div className={`absolute left-4 top-0 bottom-0 w-px ${BG_COLOR.medium} md:hidden`} />

        {/* 연혁 아이템들 */}
        <div className="md:space-y-0">
          {HISTORY_DATA.map((item, index) => (
            <div
              key={item.year}
              className="relative flex items-start py-6 md:py-0"
              style={{
                minHeight: isDesktop ? itemHeight : 'auto',
              }}
            >
              {/* 연도 - 왼쪽 고정 */}
              <div
                className="hidden md:flex w-32 flex-shrink-0 justify-end pr-12 items-center"
                style={{ height: '32px' }}
              >
                <span
                  className="text-2xl font-bold transition-all duration-300 tabular-nums"
                  style={{
                    color: activeDots[index] ? '#ED6C00' : '#6B7280',
                    opacity: activeDots[index] ? 1 : 0.7,
                  }}
                >
                  {item.year}
                </span>
              </div>

              {/* 모바일 도트 */}
              <div className="absolute left-4 -translate-x-1/2 top-8 z-10 md:hidden">
                <div className="w-3 h-3 rounded-full bg-[#ED6C00] ring-4 ring-[#ED6C00]/20" />
              </div>

              {/* 이벤트 내용 */}
              <div className="flex-1 pl-10 md:pl-14">
                {/* 모바일 연도 */}
                <span className="md:hidden text-xl font-bold text-[#ED6C00] block mb-2">
                  {item.year}
                </span>

                {/* 이벤트 목록 */}
                <div
                  className="space-y-2 transition-opacity duration-300"
                  style={{ opacity: activeDots[index] ? 1 : 0.6 }}
                >
                  {item.events.map((event, eventIndex) => (
                    <p
                      key={eventIndex}
                      className={`text-base md:text-lg ${TEXT_COLOR.secondary} leading-relaxed`}
                    >
                      {event}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Timeline;
