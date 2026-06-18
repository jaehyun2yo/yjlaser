/**
 * 소개 페이지 타입 정의
 */

// 탭 타입
export type AboutTab = 'intro' | 'history' | 'process';

// 제작과정 단계 타입
export interface ProcessStep {
  id: string;
  step: number;
  title: string;
  description: string;
  details: string[];
  image?: string;
}

// 연혁 아이템 타입
export interface HistoryItem {
  year: number;
  events: string[];
}

// 시설 아이템 타입
export interface FacilityItem {
  id: string;
  title: string;
  description: string;
  icon?: string;
}

// 핵심 가치 타입
export interface CoreValue {
  id: string;
  title: string;
  titleEn: string;
  description: string;
}

// 핵심 요약 블록 타입
export interface SummaryBlock {
  id: string;
  title: string;
  content: string;
}

// 메인 스토리 섹션 타입
export interface MainStorySection {
  id: string;
  title?: string;
  titleSub?: string;
  content: string;
}

// 메인 스토리 클로징 타입
export interface MainStoryClosing {
  quote: string;
  description: string;
}

// 메인 스토리 타입
export interface MainStoryData {
  title: string;
  subtitle?: string;
  sections: MainStorySection[];
  closing?: MainStoryClosing;
}
