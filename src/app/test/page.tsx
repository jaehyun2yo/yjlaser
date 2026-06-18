import type { Metadata } from 'next';
import { HeroSection } from '@/components/home/HeroSection';

export const metadata: Metadata = {
  title: '3D 히어로 테스트 | 유진레이저목형',
  description: 'React Three Fiber 기반 패키지 3D 히어로 섹션 테스트 페이지',
};

export default function TestPage() {
  return <HeroSection />;
}
