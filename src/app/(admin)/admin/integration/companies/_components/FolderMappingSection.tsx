'use client';

import { useState } from 'react';
import { TEXT_COLOR } from '@/lib/styles';
import { PendingAliasesPanel } from './PendingAliasesPanel';
import { UnmatchedFoldersPanel } from './UnmatchedFoldersPanel';
import { ManualMappingForm } from './ManualMappingForm';
import { RegisteredAliasesPanel } from './RegisteredAliasesPanel';
import { ExternalHusksPanel } from './ExternalHusksPanel';

/**
 * task 26 + task 27: 폴더 매핑 통합 섹션 (`/admin/integration/companies` 페이지에 삽입).
 *
 * 5 패널 순서:
 *   1. PendingAliasesPanel — 자동 등록된 후보 검수 (가장 우선)
 *   2. UnmatchedFoldersPanel — 자동 매칭 불가능한 외부 폴더
 *   3. ManualMappingForm — 직접 등록 폼 (UnmatchedFoldersPanel 행 클릭으로 폴더명 자동 채움)
 *   4. RegisteredAliasesPanel — 등록 완료 매핑 (재마이그레이션 / 삭제)
 *   5. ExternalHusksPanel (task 27 Phase C) — 마이그레이션 후 빈 husk 정리
 */
export function FolderMappingSection() {
  const [folderName, setFolderName] = useState('');

  return (
    <div className="space-y-6">
      <header>
        <h2 className={`text-xl font-bold ${TEXT_COLOR.primary}`}>외부웹하드 폴더 매핑</h2>
        <p className={`text-sm mt-1 ${TEXT_COLOR.secondary}`}>
          외부 동기화 폴더 ↔ 가입 업체 매핑 통합 관리. 매핑 등록 시 외부 누적분이 업체 폴더로
          이전됩니다. 외부 폴더 row 는 husk 로 유지되며 신규 동기화는 자동으로 회사 폴더에 redirect
          됩니다. 빈 husk 정리는 가장 아래 패널에서 수동으로.
        </p>
      </header>

      <PendingAliasesPanel />
      <UnmatchedFoldersPanel onSelect={setFolderName} />
      <ManualMappingForm folderName={folderName} onFolderNameChange={setFolderName} />
      <RegisteredAliasesPanel />
      <ExternalHusksPanel />
    </div>
  );
}
