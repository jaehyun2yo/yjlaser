'use client';

import { AlertTriangle, Building2, ExternalLink, Folder, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui/modal';

export const COMPANY_ROOT_FOLDER_DELETE_BLOCKED_CODE = 'COMPANY_ROOT_FOLDER_DELETE_BLOCKED';
export const COMPANY_ROOT_FOLDER_DELETE_BLOCKED_MESSAGE =
  '업체와 매칭된 폴더입니다. 삭제하려면 업체삭제를 진행해주세요.';

export interface CompanyRootFolderDeleteBlockedPayload {
  code?: string;
  message?: string;
  error?: string;
  companyId?: number;
  companyName?: string;
  folderId?: string;
  folderName?: string;
  redirectTo?: string;
  hasSubfolders?: boolean;
  hasFiles?: boolean;
}

export interface CompanyRootFolderDeleteBlockedMatch {
  folderId?: string;
  folderName: string;
  companyId?: number;
  companyName?: string;
  redirectTo?: string;
  message?: string;
}

interface CompanyRootFolderDeleteBlockedModalProps {
  isOpen: boolean;
  matches: CompanyRootFolderDeleteBlockedMatch[];
  canDeleteExcludingMatched?: boolean;
  isDeletingExcludingMatched?: boolean;
  onClose: () => void;
  onGoToCompany: (match: CompanyRootFolderDeleteBlockedMatch) => void;
  onDeleteExcludingMatched?: () => void;
}

export function toCompanyRootFolderDeleteBlockedMatch(
  payload: CompanyRootFolderDeleteBlockedPayload,
  fallbackFolderName = '선택한 폴더'
): CompanyRootFolderDeleteBlockedMatch {
  return {
    folderId: payload.folderId,
    folderName: payload.folderName || fallbackFolderName,
    companyId: payload.companyId,
    companyName:
      payload.companyName ||
      (payload.companyId !== undefined ? `업체 ID ${payload.companyId}` : undefined),
    redirectTo:
      payload.redirectTo ||
      (payload.companyId !== undefined ? `/admin/companies/${payload.companyId}` : undefined),
    message: payload.message || payload.error,
  };
}

export function CompanyRootFolderDeleteBlockedModal({
  isOpen,
  matches,
  canDeleteExcludingMatched = false,
  isDeletingExcludingMatched = false,
  onClose,
  onGoToCompany,
  onDeleteExcludingMatched,
}: CompanyRootFolderDeleteBlockedModalProps) {
  const primaryMatch = matches[0];
  const showExcludeDelete = Boolean(onDeleteExcludingMatched);

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContent className="max-w-xl">
        <ModalHeader>
          <div className="flex items-start gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning-light text-warning">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <ModalTitle>업체 매칭 폴더는 직접 삭제할 수 없습니다</ModalTitle>
              <ModalDescription className="mt-2 leading-6">
                업체 삭제/복구 흐름과 연결된 폴더입니다. 업체 자체를 삭제하려면 업체 관리 페이지에서
                처리해주세요.
              </ModalDescription>
            </div>
          </div>
        </ModalHeader>

        <ModalBody className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="mb-3 text-sm font-medium text-foreground">매칭된 폴더</p>
            <div className="space-y-2">
              {matches.map((match) => (
                <div
                  key={`${match.folderId ?? match.folderName}-${match.companyId ?? 'company'}`}
                  className="flex min-w-0 items-start gap-3 rounded-md border border-border bg-card p-3"
                >
                  <Folder className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {match.folderName}
                    </p>
                    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{match.companyName ?? '등록 업체'}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {showExcludeDelete && (
            <div className="rounded-lg border border-info bg-info-light p-3 text-sm text-info-foreground">
              {canDeleteExcludingMatched
                ? '매칭된 업체 폴더를 삭제 대상에서 제외하고, 나머지 선택 항목만 삭제할 수 있습니다.'
                : '삭제 대상이 매칭된 업체 폴더뿐이라 제외하고 삭제할 항목이 없습니다.'}
            </div>
          )}
        </ModalBody>

        <ModalFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="ghost" size="sm" onClick={onClose}>
            닫기
          </Button>
          {showExcludeDelete && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onDeleteExcludingMatched}
              disabled={!canDeleteExcludingMatched || isDeletingExcludingMatched}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              제외하고 삭제
            </Button>
          )}
          {primaryMatch && (
            <Button variant="primary" size="sm" onClick={() => onGoToCompany(primaryMatch)}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              업체 페이지로 이동
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
