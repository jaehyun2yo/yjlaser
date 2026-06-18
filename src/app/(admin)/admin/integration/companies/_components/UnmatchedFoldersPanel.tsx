'use client';

import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { externalUnmatchedApi, type ExternalUnmatchedFolder } from '../_lib/external-unmatched-api';

function formatDate(value: string): string {
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

interface Props {
  /** 행 클릭 시 호출 — `<ManualMappingForm>` 의 folderName 자동 채우기에 사용. */
  onSelect?: (folderName: string) => void;
}

/**
 * task 26: 미매칭 외부웹하드 폴더 목록 패널.
 *
 * `GET /folders/external-unmatched` 응답 (depth=2 + companyId=null + approved alias 없음).
 * 행 클릭 → `onSelect(folderName)` 으로 부모의 매뉴얼 매핑 폼 채워줌.
 */
export function UnmatchedFoldersPanel({ onSelect }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.externalUnmatchedFolders.list(),
    queryFn: () => externalUnmatchedApi.list(),
  });

  return (
    <section className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>미매칭 외부 폴더</h2>
          <p className={`text-sm mt-1 ${TEXT_COLOR.secondary}`}>
            정규화 매칭 후보 0개로 자동 등록조차 안 된 외부웹하드 폴더입니다. "이 폴더 매핑" 버튼을
            누르면 아래 매뉴얼 매핑 폼의 폴더명이 자동 채워집니다.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className={`text-sm ${TEXT_COLOR.secondary}`}>로딩 중...</p>
      ) : isError ? (
        <p className={`text-sm ${TEXT_COLOR.error}`}>목록 조회 실패</p>
      ) : !data || data.length === 0 ? (
        <p className={`text-sm ${TEXT_COLOR.secondary} italic`}>미매칭 외부 폴더가 없습니다.</p>
      ) : (
        <div className={`overflow-x-auto border rounded-lg ${BORDER_COLOR.default}`}>
          <table className="w-full text-sm">
            <thead className={BG_COLOR.muted}>
              <tr className={`border-b ${BORDER_COLOR.default}`}>
                <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                  폴더명
                </th>
                <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>경로</th>
                <th className={`text-right px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                  Contact
                </th>
                <th className={`text-right px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>파일</th>
                <th className={`text-left px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>
                  최초 동기화
                </th>
                <th className={`text-right px-4 py-2 font-semibold ${TEXT_COLOR.primary}`}>작업</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row: ExternalUnmatchedFolder) => (
                <tr key={row.id} className={`border-b last:border-b-0 ${BORDER_COLOR.default}`}>
                  <td className={`px-4 py-2 font-mono ${TEXT_COLOR.primary}`}>{row.name}</td>
                  <td className={`px-4 py-2 font-mono text-xs ${TEXT_COLOR.secondary}`}>
                    {row.path}
                  </td>
                  <td className={`px-4 py-2 text-right ${TEXT_COLOR.primary}`}>
                    {row.contactCount}
                  </td>
                  <td className={`px-4 py-2 text-right ${TEXT_COLOR.primary}`}>{row.fileCount}</td>
                  <td className={`px-4 py-2 ${TEXT_COLOR.secondary}`}>
                    {formatDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      size="sm"
                      variant="primary"
                      type="button"
                      onClick={() => onSelect?.(row.name)}
                    >
                      이 폴더 매핑
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
