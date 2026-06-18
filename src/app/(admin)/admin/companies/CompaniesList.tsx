'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  FaBuilding,
  FaCheckCircle,
  FaTimesCircle,
  FaEye,
  FaLock,
  FaBolt,
  FaTrash,
} from 'react-icons/fa';
import { QuickApproveButton } from './quick-approve-button';
import { SearchInput } from '@/components/SearchInput';
import { BG_COLOR, TEXT_COLOR, BORDER_COLOR } from '@/lib/styles';
import { Badge } from '@/components/ui/badge';

interface Company {
  id: number;
  company_name: string;
  business_registration_number: string;
  representative_name: string;
  username: string;
  status: 'active' | 'inactive' | 'pending' | 'deleted';
  webhard_access: boolean;
  laser_only: boolean;
  created_at: string;
}

interface CompaniesListProps {
  companies: Company[];
  stats: {
    total: number;
    active: number;
    inactive: number;
    pending: number;
    deleted: number;
  };
}

export function CompaniesList({
  companies: initialCompanies,
  stats: initialStats,
}: CompaniesListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <Badge variant="success">
            <FaCheckCircle className="text-xs" />
            활성
          </Badge>
        );
      case 'inactive':
        return (
          <Badge variant="error">
            <FaTimesCircle className="text-xs" />
            비활성
          </Badge>
        );
      case 'pending':
        return <Badge variant="warning">대기중</Badge>;
      case 'deleted':
        return (
          <Badge variant="error">
            <FaTrash className="text-xs" />
            삭제대기
          </Badge>
        );
      default:
        return <Badge variant="gray">{status}</Badge>;
    }
  };

  // 검색 필터링
  const filteredCompanies = useMemo(() => {
    if (!searchQuery.trim()) {
      return initialCompanies;
    }

    const query = searchQuery.toLowerCase().trim();
    return initialCompanies.filter((company) => {
      return (
        company.company_name.toLowerCase().includes(query) ||
        company.business_registration_number.toLowerCase().includes(query) ||
        company.representative_name.toLowerCase().includes(query) ||
        company.username.toLowerCase().includes(query) ||
        String(company.id).includes(query)
      );
    });
  }, [initialCompanies, searchQuery]);

  // 필터링된 통계 계산
  const filteredStats = useMemo(() => {
    return {
      total: filteredCompanies.length,
      active: filteredCompanies.filter((c) => c.status === 'active').length,
      inactive: filteredCompanies.filter((c) => c.status === 'inactive').length,
      pending: filteredCompanies.filter((c) => c.status === 'pending').length,
      deleted: filteredCompanies.filter((c) => c.status === 'deleted').length,
    };
  }, [filteredCompanies]);

  return (
    <div className="space-y-8">
      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        <div
          className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border-l-4 border-blue-500 border ${BORDER_COLOR.default}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className={`${TEXT_COLOR.secondary} text-sm mb-1`}>전체 업체</p>
              <p className={`text-3xl font-bold ${TEXT_COLOR.primary}`}>
                {searchQuery ? filteredStats.total : initialStats.total}
              </p>
            </div>
            <div className="bg-blue-500 p-4 rounded-full">
              <FaBuilding className="text-white text-2xl" />
            </div>
          </div>
        </div>
        <div
          className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border-l-4 border-green-500 border ${BORDER_COLOR.default}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className={`${TEXT_COLOR.secondary} text-sm mb-1`}>활성 업체</p>
              <p className={`text-3xl font-bold ${TEXT_COLOR.primary}`}>
                {searchQuery ? filteredStats.active : initialStats.active}
              </p>
            </div>
            <div className="bg-green-500 p-4 rounded-full">
              <FaCheckCircle className="text-white text-2xl" />
            </div>
          </div>
        </div>
        <div
          className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border-l-4 border-red-500 border ${BORDER_COLOR.default}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className={`${TEXT_COLOR.secondary} text-sm mb-1`}>비활성 업체</p>
              <p className={`text-3xl font-bold ${TEXT_COLOR.primary}`}>
                {searchQuery ? filteredStats.inactive : initialStats.inactive}
              </p>
            </div>
            <div className="bg-red-500 p-4 rounded-full">
              <FaTimesCircle className="text-white text-2xl" />
            </div>
          </div>
        </div>
        <div
          className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border-l-4 border-yellow-500 border ${BORDER_COLOR.default}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className={`${TEXT_COLOR.secondary} text-sm mb-1`}>대기중</p>
              <p className={`text-3xl font-bold ${TEXT_COLOR.primary}`}>
                {searchQuery ? filteredStats.pending : initialStats.pending}
              </p>
            </div>
            <div className="bg-yellow-500 p-4 rounded-full">
              <FaBuilding className="text-white text-2xl" />
            </div>
          </div>
        </div>
        <div
          className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border-l-4 border-red-700 border ${BORDER_COLOR.default}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className={`${TEXT_COLOR.secondary} text-sm mb-1`}>삭제대기</p>
              <p className={`text-3xl font-bold ${TEXT_COLOR.primary}`}>
                {searchQuery ? filteredStats.deleted : initialStats.deleted}
              </p>
            </div>
            <div className="bg-red-700 p-4 rounded-full">
              <FaTrash className="text-white text-2xl" />
            </div>
          </div>
        </div>
      </div>

      {/* 업체 목록 */}
      <div className={`${BG_COLOR.card} p-6 rounded-xl shadow-md border ${BORDER_COLOR.default}`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>업체 목록</h2>
          <div className="w-full max-w-md">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="검색어를 입력해주세요."
              icon={true}
              size="default"
            />
            {false && (
              <button
                onClick={() => setSearchQuery('')}
                className={`absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 ${TEXT_COLOR.hoverPrimary}`}
              >
                <span className="text-sm">✕</span>
              </button>
            )}
          </div>
        </div>

        {searchQuery && (
          <div className={`mb-4 text-sm ${TEXT_COLOR.secondary}`}>
            검색 결과: <span className="font-semibold">{filteredCompanies.length}</span>개
          </div>
        )}

        {filteredCompanies.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={`border-b ${BORDER_COLOR.default}`}>
                  <th className={`text-left py-3 px-4 text-sm font-semibold ${TEXT_COLOR.primary}`}>
                    ID
                  </th>
                  <th className={`text-left py-3 px-4 text-sm font-semibold ${TEXT_COLOR.primary}`}>
                    업체명
                  </th>
                  <th className={`text-left py-3 px-4 text-sm font-semibold ${TEXT_COLOR.primary}`}>
                    사업자등록번호
                  </th>
                  <th className={`text-left py-3 px-4 text-sm font-semibold ${TEXT_COLOR.primary}`}>
                    대표자명
                  </th>
                  <th className={`text-left py-3 px-4 text-sm font-semibold ${TEXT_COLOR.primary}`}>
                    아이디
                  </th>
                  <th className={`text-left py-3 px-4 text-sm font-semibold ${TEXT_COLOR.primary}`}>
                    상태
                  </th>
                  <th className={`text-left py-3 px-4 text-sm font-semibold ${TEXT_COLOR.primary}`}>
                    등록일
                  </th>
                  <th className={`text-left py-3 px-4 text-sm font-semibold ${TEXT_COLOR.primary}`}>
                    관리
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((company) => (
                  <tr
                    key={company.id}
                    className={`border-b ${BORDER_COLOR.default} ${BG_COLOR.hoverMuted} transition-colors`}
                  >
                    <td className={`py-3 px-4 text-sm ${TEXT_COLOR.primary}`}>{company.id}</td>
                    <td className={`py-3 px-4 text-sm ${TEXT_COLOR.primary} font-medium`}>
                      {company.company_name}
                    </td>
                    <td className={`py-3 px-4 text-sm ${TEXT_COLOR.secondary}`}>
                      {company.business_registration_number}
                    </td>
                    <td className={`py-3 px-4 text-sm ${TEXT_COLOR.secondary}`}>
                      {company.representative_name}
                    </td>
                    <td className={`py-3 px-4 text-sm ${TEXT_COLOR.secondary}`}>
                      {' '}
                      {company.username}{' '}
                    </td>{' '}
                    <td className="py-3 px-4 text-sm">
                      {' '}
                      <div className="flex items-center gap-2">
                        {' '}
                        {getStatusBadge(company.status)}{' '}
                        {company.webhard_access === false && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${BG_COLOR.orangeLight} ${TEXT_COLOR.orangeDark}`}
                            title="웹하드 접근 차단됨"
                          >
                            {' '}
                            <FaLock className="text-xs" />{' '}
                          </span>
                        )}{' '}
                        {company.laser_only && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${BG_COLOR.orangeLight} ${TEXT_COLOR.orangeDark}`}
                            title="레이저가공 전용"
                          >
                            <FaBolt className="text-xs" />
                          </span>
                        )}{' '}
                        {company.status !== 'deleted' && (
                          <QuickApproveButton
                            companyId={company.id}
                            currentStatus={company.status}
                          />
                        )}{' '}
                      </div>{' '}
                    </td>{' '}
                    <td className={`py-3 px-4 text-sm ${TEXT_COLOR.secondary}`}>
                      {new Date(company.created_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <Link
                        href={`/admin/companies/${company.id}`}
                        className={`inline-flex items-center gap-1 ${TEXT_COLOR.brand} ${TEXT_COLOR.brandHover} font-medium transition-colors`}
                      >
                        <FaEye className="text-xs" />
                        상세보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <FaBuilding className={`mx-auto text-4xl ${TEXT_COLOR.muted} mb-3`} />
            <p className={TEXT_COLOR.muted}>
              {searchQuery ? '검색 결과가 없습니다' : '등록된 업체가 없습니다'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className={`mt-2 text-sm ${TEXT_COLOR.brand} ${TEXT_COLOR.brandHover}`}
              >
                검색어 지우기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
