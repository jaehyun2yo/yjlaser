'use client';

import { TEXT_COLOR } from '@/lib/styles';
import { IntegrationNav } from '@/app/(admin)/admin/integration/_components';
import {
  FolderStatusMappingSettings,
  AutoContactExcludedFoldersSettings,
  ExcludedFoldersSettings,
  BackupSettings,
  LaserOnlyCompanySettings,
} from './_components';
import FolderTemplateSettings from '@/app/(admin)/admin/companies/_components/FolderTemplateSettings';

export default function WebhardManagementPage() {
  return (
    <div className="space-y-6">
      <IntegrationNav />

      <div>
        <h1 className={`text-2xl font-bold mb-2 ${TEXT_COLOR.primary}`}>웹하드 관리</h1>
        <p className={`${TEXT_COLOR.secondary}`}>
          웹하드 폴더 구조, 자동 문의 생성 매핑, 제외폴더를 설정합니다.
        </p>
      </div>

      <FolderStatusMappingSettings />
      <LaserOnlyCompanySettings />
      <AutoContactExcludedFoldersSettings />
      <ExcludedFoldersSettings />
      <FolderTemplateSettings />
      <BackupSettings />
    </div>
  );
}
