'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';
import { NESTJS_CLIENT_API_BASE } from '@/lib/api/api-base';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { folderAliasApi } from '../_lib/folder-alias-api';

const log = logger.createLogger('ManualMappingForm');

interface CompanyRow {
  id: number;
  companyName: string;
}

async function fetchCompanies(): Promise<CompanyRow[]> {
  const res = await fetch(
    `${NESTJS_CLIENT_API_BASE}/companies?limit=10000&sortBy=company_name&sortOrder=asc`,
    {
      credentials: 'include',
    }
  );
  if (!res.ok) {
    throw new Error(`업체 목록 조회 실패: ${res.status}`);
  }
  const data = (await res.json()) as { companies?: Array<{ id: number; company_name: string }> };
  return (data.companies ?? []).map((c) => ({ id: c.id, companyName: c.company_name }));
}

interface Props {
  /** 외부 (UnmatchedFoldersPanel) 에서 선택된 폴더명을 채워넣기 위한 controlled input. */
  folderName: string;
  onFolderNameChange: (value: string) => void;
}

/**
 * task 26: 운영자가 직접 (folderName, companyId) 매핑을 등록하는 폼.
 *
 * cascadeBackfill 은 default true — 등록과 동시에 외부 누적분 통합 + 폴더 트리 이전 실행.
 * 응답의 migration 카운트를 toast 메시지로 노출.
 */
export function ManualMappingForm({ folderName, onFolderNameChange }: Props) {
  const queryClient = useQueryClient();
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companySearch, setCompanySearch] = useState('');
  const [cascadeBackfill, setCascadeBackfill] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMessage = (type: 'success' | 'error', text: string, ms = 6000) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), ms);
  };

  const { data: companies, isLoading: companiesLoading } = useQuery({
    queryKey: queryKeys.companies.all,
    queryFn: fetchCompanies,
  });

  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return companies ?? [];
    return (companies ?? []).filter((c) => c.companyName.toLowerCase().includes(q));
  }, [companies, companySearch]);

  const selectedCompany = useMemo(
    () => (companies ?? []).find((c) => c.id === companyId) ?? null,
    [companies, companyId]
  );

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!folderName.trim() || companyId === null) {
        throw new Error('폴더명과 업체를 모두 선택해주세요.');
      }
      return folderAliasApi.createApproved({
        folderName: folderName.trim(),
        companyId,
        cascadeBackfill,
      });
    },
    onSuccess: (resp) => {
      const b = resp.backfill;
      if (b) {
        const conflicts = b.conflicts.length > 0 ? ` 충돌 rename ${b.conflicts.length}건.` : '';
        if (!b.externalRootFound) {
          // 외부 root 미존재 — 이름 불일치 또는 이미 정리됨. Contact 통합만 적용된 상태.
          showMessage(
            'error',
            `${resp.alias.folderName} → ${selectedCompany?.companyName ?? '업체'} 매핑은 등록되었으나, 외부 폴더 트리를 찾지 못했습니다 — DB 폴더명과 정확히 일치하는지 확인 필요. Contact ${b.relocated}건만 통합.`,
            10000
          );
        } else {
          showMessage(
            'success',
            `${resp.alias.folderName} → ${selectedCompany?.companyName ?? '업체'} 매핑 완료 — Contact ${b.relocated}건, 폴더 ${b.movedFolders}개, 파일 ${b.movedFiles}개 이동.${conflicts} 외부 husk 는 유지됩니다 — 정리는 husk 패널에서.`,
            10000
          );
        }
      } else {
        showMessage('success', `${resp.alias.folderName} 매핑 완료.`);
      }
      // 폼 reset
      onFolderNameChange('');
      setCompanyId(null);
      setCompanySearch('');
      // invalidate 두 namespace
      queryClient.invalidateQueries({ queryKey: queryKeys.folderAliases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.externalUnmatchedFolders.all });
    },
    onError: (e: Error) => {
      log.error('매뉴얼 매핑 실패', e);
      showMessage('error', e.message || '매핑 실패');
    },
  });

  const submitDisabled = !folderName.trim() || companyId === null || submitMutation.isPending;

  return (
    <section className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>매뉴얼 매핑 등록</h2>
          <p className={`text-sm mt-1 ${TEXT_COLOR.secondary}`}>
            외부 폴더명 ↔ 업체를 직접 등록합니다. cascadeBackfill 체크 시 외부 누적분 (Contact +
            폴더 트리) 도 즉시 통합됩니다.
          </p>
        </div>
        {message && (
          <span
            className={`text-xs ${message.type === 'success' ? TEXT_COLOR.success : TEXT_COLOR.error} max-w-md text-right`}
          >
            {message.text}
          </span>
        )}
      </div>

      <form
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submitMutation.mutate();
        }}
      >
        <div className="md:col-span-1">
          <label className={`block text-xs font-semibold mb-1 ${TEXT_COLOR.primary}`}>
            외부 폴더명
          </label>
          <Input
            value={folderName}
            onChange={(e) => onFolderNameChange(e.target.value)}
            placeholder="예: 대성목형(2265-1295)"
          />
        </div>

        <div className="md:col-span-1">
          <label className={`block text-xs font-semibold mb-1 ${TEXT_COLOR.primary}`}>업체</label>
          <Input
            value={selectedCompany ? selectedCompany.companyName : companySearch}
            onChange={(e) => {
              setCompanySearch(e.target.value);
              setCompanyId(null);
            }}
            placeholder={companiesLoading ? '업체 로딩 중...' : '업체명 검색'}
          />
          {companySearch && !selectedCompany && filteredCompanies.length > 0 && (
            <ul
              className={`mt-1 max-h-48 overflow-y-auto border rounded-lg ${BORDER_COLOR.default} ${BG_COLOR.card} text-sm shadow-sm`}
            >
              {filteredCompanies.slice(0, 20).map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`w-full text-left px-3 py-1.5 hover:${BG_COLOR.muted} ${TEXT_COLOR.primary}`}
                    onClick={() => {
                      setCompanyId(c.id);
                      setCompanySearch('');
                    }}
                  >
                    {c.companyName}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="md:col-span-1 flex items-end justify-between gap-3">
          <label className={`flex items-center gap-2 text-sm ${TEXT_COLOR.primary} cursor-pointer`}>
            <input
              type="checkbox"
              checked={cascadeBackfill}
              onChange={(e) => setCascadeBackfill(e.target.checked)}
            />
            기존 누적분 일괄 이동
          </label>
          <Button type="submit" variant="primary" size="md" disabled={submitDisabled}>
            {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            매핑 등록
          </Button>
        </div>
      </form>
    </section>
  );
}
