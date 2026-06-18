'use client';

/**
 * FileListSkeleton
 * 파일 목록 로딩 스켈레톤 컴포넌트
 */

import type { FC } from 'react';
import { BG_COLOR, BORDER_COLOR } from '@/lib/styles';

interface FileListSkeletonProps {
  viewMode: 'list' | 'grid';
}

export const FileListSkeleton: FC<FileListSkeletonProps> = ({ viewMode }) => {
  if (viewMode === 'list') {
    // 리스트 뷰 스켈레톤 - WEBHARD_STYLES.fileRow.base와 동일한 스타일, h-[50px] 고정
    return (
      <div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`flex items-center px-4 py-3 border ${BORDER_COLOR.default} rounded-lg shadow-sm animate-pulse mb-2 animate-stagger-item`}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            {/* 체크박스 (고정 40px) */}
            <div className="w-10 flex-shrink-0">
              <div className={`w-4 h-4 ${BG_COLOR.strong} rounded`} />
            </div>
            {/* 파일명 (calc(75% - 40px)) */}
            <div className="flex items-center gap-2 min-w-0" style={{ width: 'calc(75% - 40px)' }}>
              <div className={`w-4 h-4 ${BG_COLOR.strong} rounded flex-shrink-0`} />
              <div className={`h-4 ${BG_COLOR.strong} rounded flex-1 min-w-0`} />
            </div>
            {/* 업로드날짜 (10%) */}
            <div className="flex-shrink-0 pl-2" style={{ width: '10%' }}>
              <div className={`h-3 ${BG_COLOR.strong} rounded w-16`} />
            </div>
            {/* 업로더 (나머지 15%) */}
            <div className="flex-1 min-w-[15%] flex items-center gap-1 pl-2">
              <div className={`h-3 ${BG_COLOR.strong} rounded flex-1 min-w-0`} />
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className={`w-6 h-6 ${BG_COLOR.strong} rounded`} />
                <div className={`w-6 h-6 ${BG_COLOR.strong} rounded`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Grid view skeleton - 실제 파일 카드와 동일한 사이즈
  return (
    <div className="contents">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={`${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg p-4 hover:shadow-md transition-shadow animate-pulse animate-stagger-item`}
          style={{ animationDelay: `${i * 0.03}s` }}
        >
          <div className="flex flex-col items-center gap-2 relative">
            {/* 아이콘 영역 */}
            <div className={`w-8 h-8 ${BG_COLOR.strong} rounded mt-2`} />
            {/* 파일명 영역 */}
            <div className={`h-5 ${BG_COLOR.strong} rounded w-full max-w-[100px]`} />
            {/* 파일 크기 영역 */}
            <div className={`h-3 ${BG_COLOR.strong} rounded w-14`} />
            {/* 액션 버튼 영역 */}
            <div className="flex items-center gap-2 mt-2">
              <div className={`w-7 h-7 ${BG_COLOR.strong} rounded`} />
              <div className={`w-7 h-7 ${BG_COLOR.strong} rounded`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default FileListSkeleton;
