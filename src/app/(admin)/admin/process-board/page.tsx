import type { Metadata } from 'next';
import ProcessBoardView from './_components/ProcessBoardView';

export const metadata: Metadata = {
  title: '작업현황 보드 | 유진레이저',
  description: '실시간 작업 공정 현황 관리',
};

export default function ProcessBoardPage() {
  return <ProcessBoardView />;
}
