'use client';

import { useState, useEffect, useCallback } from 'react';
import { BG_COLOR, TEXT_COLOR, BORDER_COLOR } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { X, Plus, Loader2, Link2 } from 'lucide-react';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('LaserOnlyCompanySettings');

interface LaserOnlyMapping {
  id: number;
  folder_name: string;
  company_id: number | null;
  company_name: string | null;
  is_active: boolean;
  created_at: string;
}

interface CompanyOption {
  id: number;
  company_name: string;
}

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
const API_PREFIX = '/api/v1';

function getCsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function nestjsClientFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${NESTJS_API_URL}${API_PREFIX}${endpoint}`;
  const csrfToken = getCsrfToken();
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && { 'x-csrf-token': csrfToken }),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `API 오류: ${res.status}`);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export default function LaserOnlyCompanySettings() {
  const [mappings, setMappings] = useState<LaserOnlyMapping[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [manualFolderName, setManualFolderName] = useState('');

  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [linkCompanyId, setLinkCompanyId] = useState<string>('');

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 2000);
  };

  const fetchMappings = useCallback(async () => {
    try {
      const data = await nestjsClientFetch<LaserOnlyMapping[]>('/companies/laser-only-mappings');
      setMappings(data);
    } catch (err) {
      log.error('매핑 목록 조회 실패', err);
      showMessage('error', '매핑 목록을 불러오지 못했습니다.');
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      const data = await nestjsClientFetch<CompanyOption[]>('/companies/names');
      setCompanies(data);
    } catch (err) {
      log.error('업체 목록 조회 실패', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchMappings(), fetchCompanies()]).finally(() => setLoading(false));
  }, [fetchMappings, fetchCompanies]);

  const handleAddFromCompany = async () => {
    if (!selectedCompanyId) return;
    const company = companies.find((c) => c.id === Number(selectedCompanyId));
    if (!company) return;

    setSaving(true);
    try {
      await nestjsClientFetch<LaserOnlyMapping>('/companies/laser-only-mappings', {
        method: 'POST',
        body: JSON.stringify({
          folderName: company.company_name,
          companyId: company.id,
        }),
      });
      setSelectedCompanyId('');
      showMessage('success', '추가됨');
      await fetchMappings();
    } catch (err) {
      log.error('매핑 추가 실패', err);
      showMessage('error', err instanceof Error ? err.message : '추가 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleAddManual = async () => {
    const trimmed = manualFolderName.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      await nestjsClientFetch<LaserOnlyMapping>('/companies/laser-only-mappings', {
        method: 'POST',
        body: JSON.stringify({ folderName: trimmed }),
      });
      setManualFolderName('');
      showMessage('success', '추가됨');
      await fetchMappings();
    } catch (err) {
      log.error('매핑 추가 실패', err);
      showMessage('error', err instanceof Error ? err.message : '추가 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: number) => {
    setSaving(true);
    try {
      await nestjsClientFetch<void>(`/companies/laser-only-mappings/${id}`, {
        method: 'DELETE',
      });
      showMessage('success', '삭제됨');
      await fetchMappings();
    } catch (err) {
      log.error('매핑 삭제 실패', err);
      showMessage('error', err instanceof Error ? err.message : '삭제 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleLink = async (mappingId: number) => {
    if (!linkCompanyId) return;

    setSaving(true);
    try {
      await nestjsClientFetch<LaserOnlyMapping>(
        `/companies/laser-only-mappings/${mappingId}/link`,
        {
          method: 'PATCH',
          body: JSON.stringify({ companyId: Number(linkCompanyId) }),
        }
      );
      setLinkingId(null);
      setLinkCompanyId('');
      showMessage('success', '업체 연결됨');
      await fetchMappings();
    } catch (err) {
      log.error('업체 연결 실패', err);
      showMessage('error', err instanceof Error ? err.message : '연결 실패');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
        <p className={TEXT_COLOR.secondary}>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>레이저가공 업체 관리</h2>
          <p className={`text-sm ${TEXT_COLOR.secondary} mt-1`}>
            레이저가공만 필요한 업체를 등록하면, 해당 업체의 웹하드 폴더에서 접수되는 파일이
            자동으로 레이저가공 문의로 생성됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          {message && (
            <span
              className={`text-xs ${message.type === 'success' ? TEXT_COLOR.success : TEXT_COLOR.error}`}
            >
              {message.text}
            </span>
          )}
        </div>
      </div>

      {/* 추가 폼 */}
      <div className={`border rounded-lg p-4 ${BORDER_COLOR.default} ${BG_COLOR.gray} mb-4`}>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedCompanyId}
            onChange={(e) => {
              setSelectedCompanyId(e.target.value);
              if (e.target.value) setManualFolderName('');
            }}
            disabled={saving}
            className={`flex-1 min-w-[180px] px-3 py-1.5 text-sm border rounded ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50`}
          >
            <option value="">등록업체에서 선택</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>

          <span className={`text-sm ${TEXT_COLOR.secondary}`}>또는</span>

          <input
            type="text"
            value={manualFolderName}
            onChange={(e) => {
              setManualFolderName(e.target.value);
              if (e.target.value) setSelectedCompanyId('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddManual();
              }
            }}
            placeholder="폴더명 직접입력"
            disabled={saving}
            className={`flex-1 min-w-[150px] px-3 py-1.5 text-sm border rounded ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50`}
          />

          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={selectedCompanyId ? handleAddFromCompany : handleAddManual}
            disabled={(!selectedCompanyId && !manualFolderName.trim()) || saving}
            className="flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            추가
          </Button>
        </div>
      </div>

      {/* 등록 목록 */}
      <div className={`border rounded-lg p-4 ${BORDER_COLOR.default} ${BG_COLOR.gray}`}>
        {mappings.length === 0 ? (
          <p className={`text-sm ${TEXT_COLOR.secondary} italic`}>
            등록된 매핑이 없습니다. 위에서 추가하세요.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {mappings.map((mapping) => (
              <div
                key={mapping.id}
                data-folder-name={mapping.folder_name}
                data-testid="laser-only-mapping-row"
                className={`flex flex-col gap-2 px-4 py-2 rounded-lg ${BG_COLOR.card} border ${BORDER_COLOR.default} group sm:flex-row sm:items-center`}
              >
                <span className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>
                  {mapping.folder_name}
                </span>

                {mapping.company_id ? (
                  <span className={`text-sm ${TEXT_COLOR.secondary}`}>
                    연결: {mapping.company_name}
                  </span>
                ) : (
                  <>
                    <span className={`text-sm ${TEXT_COLOR.orangeDark}`}>미연결</span>
                    {linkingId === mapping.id ? (
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-1">
                        <select
                          value={linkCompanyId}
                          onChange={(e) => setLinkCompanyId(e.target.value)}
                          className={`w-full px-2 py-1 text-sm border rounded ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-auto`}
                        >
                          <option value="">업체 선택</option>
                          {companies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.company_name}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="secondary"
                          size="sm"
                          type="button"
                          onClick={() => handleLink(mapping.id)}
                          disabled={!linkCompanyId || saving}
                          className="w-full text-xs px-2 py-1 sm:w-auto"
                        >
                          연결
                        </Button>
                        <button
                          type="button"
                          onClick={() => {
                            setLinkingId(null);
                            setLinkCompanyId('');
                          }}
                          className={`p-1 rounded text-gray-400 hover:text-red-500 ${BG_COLOR.hoverErrorDark} transition-colors`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => setLinkingId(mapping.id)}
                        disabled={saving}
                        className="w-full text-xs px-2 py-1 flex items-center gap-1 sm:w-auto"
                      >
                        <Link2 className="w-3 h-3" />
                        업체연결
                      </Button>
                    )}
                  </>
                )}

                <div className="self-end sm:ml-auto sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleRemove(mapping.id)}
                    disabled={saving}
                    className={`p-1 rounded text-gray-400 hover:text-red-500 ${BG_COLOR.hoverErrorDark} transition-colors disabled:opacity-50`}
                    title="삭제"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
