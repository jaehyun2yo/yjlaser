'use client';

import DashboardPreview from '@/components/home/DashboardPreview';

/**
 * 대시보드 UI 이미지 추출용 페이지
 *
 * 사용 방법:
 * 1. /dashboard-preview 접속
 * 2. 브라우저 개발자 도구 > Network 탭에서 스크린샷 캡처
 * 3. 또는 브라우저 확장 프로그램으로 캡처
 *
 * 개발 완료 후 실제 대시보드 개발 시 디자인 참고용
 */
export default function DashboardPreviewPage() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        <h1 className="text-white text-2xl font-bold mb-6 text-center">대시보드 UI 미리보기</h1>
        <p className="text-gray-400 text-sm mb-8 text-center">
          이 페이지를 스크린샷으로 캡처하여 디자인 참고용으로 사용하세요
        </p>

        {/* 정적 상태 (애니메이션 없이 완료 상태) */}
        <DashboardPreview isStatic={true} />

        <div className="mt-8 p-4 bg-gray-800/50 rounded-lg">
          <h2 className="text-white text-sm font-semibold mb-2">캡처 안내</h2>
          <ul className="text-gray-400 text-xs space-y-1">
            <li>• Windows: Win + Shift + S</li>
            <li>• Mac: Cmd + Shift + 4</li>
            <li>• Chrome: 개발자도구 &gt; More Tools &gt; Screenshot</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
