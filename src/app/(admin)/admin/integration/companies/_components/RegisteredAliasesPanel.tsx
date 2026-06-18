'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';
import { folderAliasApi, type FolderAlias } from '../_lib/folder-alias-api';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

const log = logger.createLogger('RegisteredAliasesPanel');

const PAGE_SIZE = 25;

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function RegisteredAliasesPanel() {
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.folderAliases.list('approved', page, PAGE_SIZE),
    queryFn: () => folderAliasApi.list('approved', page, PAGE_SIZE),
  });

  const showMessage = (type: 'success' | 'error', text: string, ms = 4000) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), ms);
  };

  const deleteMutation = useMutation({
    mutationFn: (id: number) => folderAliasApi.remove(id),
    onSuccess: () => {
      showMessage('success', '삭제 완료. 동일 폴더명 재동기화 시 다시 pending 으로 등록됩니다.');
      queryClient.invalidateQueries({ queryKey: queryKeys.folderAliases.all });
    },
    onError: (e: Error) => {
      log.error('alias 삭제 실패', e);
      showMessage('error', e.message || '삭제 실패');
    },
  });

  /**
   * 이미 approved 인 alias 에 대해 cascade migrate 를 다시 실행.
   * `createApprovedAlias` 가 idempotent (upsert + 무조건 cascade) 이므로 동일 (folderName, companyId)
   * 재호출만으로 폴더 트리 이전을 재시도할 수 있다.
   *
   * 사용 케이스:
   * - task 25 시점 (`migrateExternalFolderTreeToCompany` 추가 전) 에 등록된 stuck alias 회복
   * - 운영자가 외부웹하드 폴더를 누락 후 재동기화 → alias 는 그대로지만 트리 이전이 안 된 케이스
   */
  const remigrateMutation = useMutation({
    mutationFn: (alias: FolderAlias) =>
      folderAliasApi.createApproved({
        folderName: alias.folderName,
        companyId: alias.companyId,
        cascadeBackfill: true,
      }),
    onSuccess: (resp) => {
      const b = resp.backfill;
      if (!b) {
        showMessage('success', '재마이그레이션 호출 완료 (backfill 응답 없음).');
      } else if (!b.externalRootFound) {
        showMessage(
          'error',
          `외부 폴더 트리를 찾지 못했습니다 — DB 의 폴더명과 alias.folderName ("${resp.alias.folderName}") 가 정확히 일치해야 매칭됩니다 (공백·괄호 포함). Contact ${b.relocated}건만 통합.`,
          10000
        );
      } else {
        const conflicts = b.conflicts.length > 0 ? ` 충돌 rename ${b.conflicts.length}건.` : '';
        showMessage(
          'success',
          `재마이그레이션 완료 — Contact ${b.relocated}건, 폴더 ${b.movedFolders}개, 파일 ${b.movedFiles}개 이동.${conflicts} 외부 husk 는 유지됩니다.`,
          10000
        );
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.folderAliases.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.externalUnmatchedFolders.all });
    },
    onError: (e: Error) => {
      log.error('alias 재마이그레이션 실패', e);
      showMessage('error', e.message || '재마이그레이션 실패');
    },
  });

  const handleDelete = (alias: FolderAlias) => {
    const ok = window.confirm(
      `"${alias.folderName}" ↔ "${alias.company.companyName}" 매핑을 삭제하시겠습니까?\n\n삭제 후 동일 폴더명이 다시 동기화되면 pending 으로 재등록됩니다.`
    );
    if (!ok) return;
    deleteMutation.mutate(alias.id);
  };

  const handleRemigrate = (alias: FolderAlias) => {
    const ok = window.confirm(
      `"${alias.folderName}" ↔ "${alias.company.companyName}" 폴더 트리를 다시 이전 시도합니다.\n\n외부웹하드 트리가 남아있으면 업체 폴더로 통째 이동되고, 빈 외부 폴더는 정리됩니다.\n계속하시겠습니까?`
    );
    if (!ok) return;
    remigrateMutation.mutate(alias);
  };

  const isRowDeletePending = (aliasId: number) =>
    deleteMutation.isPending && deleteMutation.variables === aliasId;
  const isRowRemigratePending = (alias: FolderAlias) =>
    remigrateMutation.isPending && remigrateMutation.variables?.id === alias.id;
  const isRowPending = (alias: FolderAlias) =>
    isRowDeletePending(alias.id) || isRowRemigratePending(alias);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <section className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>등록된 매핑</h2>
          <p className={`text-sm mt-1 ${TEXT_COLOR.secondary}`}>
            승인 완료된 폴더 ↔ 업체 매핑입니다. 외부 동기화 시 자동으로 매칭된 업체 폴더로
            통합됩니다.
          </p>
        </div>
        {message && (
          <span
            className={`text-xs ${
              message.type === 'success' ? TEXT_COLOR.success : TEXT_COLOR.error
            }`}
          >
            {message.text}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className={`text-sm ${TEXT_COLOR.secondary}`}>로딩 중...</p>
      ) : isError ? (
        <p className={`text-sm ${TEXT_COLOR.error}`}>목록 조회 실패</p>
      ) : !data || data.items.length === 0 ? (
        <p className={`text-sm ${TEXT_COLOR.secondary} italic`}>등록된 매핑이 없습니다.</p>
      ) : (
        <>
          <div className={`overflow-x-auto border rounded-lg ${BORDER_COLOR.default}`}>
            <table className="w-full text-sm">
              <thead className={BG_COLOR.muted}>
                <tr className={`border-b ${BORDER_COLOR.default}`}>
                  <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                    외부 폴더명
                  </th>
                  <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                    연결 업체
                  </th>
                  <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                    승인자
                  </th>
                  <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                    승인일
                  </th>
                  <th className={`text-right px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                    작업
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((alias: FolderAlias) => {
                  const rowPending = isRowPending(alias);
                  const remigratePending = isRowRemigratePending(alias);
                  const deletePending = isRowDeletePending(alias.id);
                  return (
                    <tr
                      key={alias.id}
                      className={`border-b last:border-b-0 ${BORDER_COLOR.default}`}
                    >
                      <td className={`px-4 py-2 font-mono ${TEXT_COLOR.primary}`}>
                        {alias.folderName}
                      </td>
                      <td className={`px-4 py-2 ${TEXT_COLOR.primary}`}>
                        {alias.company.companyName}
                      </td>
                      <td className={`px-4 py-2 ${TEXT_COLOR.secondary}`}>
                        {alias.approvedBy ?? '—'}
                      </td>
                      <td className={`px-4 py-2 ${TEXT_COLOR.secondary}`}>
                        {formatDate(alias.approvedAt)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            type="button"
                            disabled={rowPending}
                            onClick={() => handleRemigrate(alias)}
                            title="외부 폴더 트리를 업체 폴더로 다시 이전 시도"
                          >
                            {remigratePending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                            재마이그레이션
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            type="button"
                            disabled={rowPending}
                            onClick={() => handleDelete(alias)}
                          >
                            {deletePending ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-4">
              <Button
                size="sm"
                variant="ghost"
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                이전
              </Button>
              <span className={`text-xs ${TEXT_COLOR.secondary}`}>
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                다음
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
