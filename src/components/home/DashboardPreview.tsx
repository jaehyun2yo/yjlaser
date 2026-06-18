'use client';

import { motion, useInView, type Variants } from 'framer-motion';
import { useRef, useMemo } from 'react';
import { DashboardCard } from '@/components/ui/DashboardCard';
import { FaChartLine, FaCheck } from 'react-icons/fa';

interface DashboardPreviewProps {
  className?: string;
  isStatic?: boolean;
}

const steps = [
  { name: '구조 설계', done: true },
  { name: '샘플 제작', done: true },
  { name: '목형 제작', done: true },
  { name: '납품', done: true },
];

// 애니메이션 variants를 컴포넌트 외부로 분리 (재생성 방지)
const containerVariants: Variants = {
  hidden: { opacity: 0, y: 30, scale: 0.9 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: 'easeOut',
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

const progressBarVariants: Variants = {
  hidden: { scaleX: 0 },
  visible: {
    scaleX: 1,
    transition: { duration: 1, ease: 'easeOut', delay: 0.6 },
  },
};

const stepVariants: Variants = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
};

/**
 * 모바일 대시보드 미니 카드 (핸드폰 프레임 없이 카드만)
 * CSS 기반 애니메이션으로 성능 최적화
 */
function MobileDashboardCard() {
  const cardRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(cardRef, { once: true, margin: '-10%' });

  // 애니메이션 상태 문자열 메모이제이션
  const animateState = useMemo(() => (isInView ? 'visible' : 'hidden'), [isInView]);

  return (
    <motion.div
      ref={cardRef}
      variants={containerVariants}
      initial="hidden"
      animate={animateState}
      className="w-[140px] bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-2.5 shadow-2xl border border-gray-600/50 will-change-transform"
    >
      {/* 헤더 */}
      <motion.div variants={itemVariants} className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 bg-[#ED6C00] rounded-md flex items-center justify-center">
            <FaChartLine className="text-white text-[8px]" />
          </div>
          <div>
            <p className="text-white font-semibold text-[8px]">고객사 대시보드</p>
            <p className="text-gray-500 text-[6px]">실시간 공정 현황</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
          <span className="text-green-400 text-[6px]">Live</span>
        </div>
      </motion.div>

      {/* 상태 카드 */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-1.5 mb-2">
        <div className="bg-gray-800/80 rounded-md p-1.5 border border-gray-700/50">
          <p className="text-gray-400 text-[5px] mb-0.5">현재 단계</p>
          <p className="text-[#ED6C00] font-bold text-[7px]">납품 완료</p>
        </div>
        <div className="bg-gray-800/80 rounded-md p-1.5 border border-gray-700/50">
          <p className="text-gray-400 text-[5px] mb-0.5">예상 완료일</p>
          <p className="text-white font-bold text-[7px]">12/12 (화)</p>
        </div>
      </motion.div>

      {/* 진행률 바 */}
      <motion.div variants={itemVariants} className="mb-2">
        <div className="flex justify-between items-center mb-0.5">
          <span className="text-gray-400 text-[5px]">전체 진행률</span>
          <span className="text-[#ED6C00] font-bold text-[7px]">100%</span>
        </div>
        <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            variants={progressBarVariants}
            className="h-full bg-gradient-to-r from-[#ED6C00] to-orange-400 rounded-full origin-left"
          />
        </div>
      </motion.div>

      {/* 단계별 목록 */}
      <div className="space-y-1">
        {steps.map((step, idx) => (
          <motion.div
            key={idx}
            variants={stepVariants}
            className="flex items-center justify-between bg-gray-800/50 rounded px-1.5 py-1"
          >
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500/20 rounded-full flex items-center justify-center">
                <FaCheck className="text-green-400 text-[5px]" />
              </div>
              <span className="text-gray-400 text-[6px]">{step.name}</span>
            </div>
            <span className="text-green-400 text-[6px]">완료</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

/**
 * 홈페이지 ProcessSection용 대시보드 미리보기
 * DashboardCard 공통 컴포넌트를 사용 + 모바일 버전 오버레이
 */
export default function DashboardPreview({
  className = '',
  isStatic = false,
}: DashboardPreviewProps) {
  return (
    <div className={`relative ${className}`}>
      {/* 데스크탑 대시보드 카드 */}
      <DashboardCard
        title="고객사 대시보드"
        subtitle="실시간 공정 현황"
        isStatic={isStatic}
        showLiveIndicator={true}
        showIconBadge={false}
        showScanEffect={true}
        aspectRatio={true}
      />

      {/* 모바일 카드 (오른쪽 하단에 겹쳐서 배치) */}
      <div className="absolute -bottom-8 -right-4 sm:-right-8 z-10">
        <MobileDashboardCard />
      </div>
    </div>
  );
}
