import type { Metadata } from 'next';
import SpringSummerHome from '@/components/home/SpringSummerHome';

// Build-time SSG 시 NestJS API 호출 회피 (Vercel preview 환경에 NestJS 서버 없음)
// `dynamic` import alias 와 `dynamic` route segment config 충돌 회피 위해 const 이름 동일 X — Next.js 가 export 자체로 인식
export const revalidate = 0;

export const metadata: Metadata = {
  title: '유진레이저목형 | YJ Laser | 박스 지기구조 전문업체',
  description:
    '2004년 설립, 20년 전통의 레이저 목형 전문업체. 박스 지기구조, 칼선, 박스 설계 등 패키징 토탈 솔루션을 제공합니다. 빠른 납기, 정밀한 품질.',
  keywords: ['레이저목형', '박스목형', '지기구조', '패키징', '칼선', '포장박스', '유진레이저'],
};

export default function Home() {
  return <SpringSummerHome />;
}
