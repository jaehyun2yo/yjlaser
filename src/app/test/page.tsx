import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: '홈 화면 테스트 | 유진레이저목형',
  description: '현재 공개 홈 화면으로 이동합니다.',
};

export default function TestPage() {
  redirect('/');
}
