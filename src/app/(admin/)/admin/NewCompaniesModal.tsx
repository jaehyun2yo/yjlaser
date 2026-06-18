'use client';

import { BaseModal } from '@/components/modals/BaseModal';
import { useEffect, useState } from 'react';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

interface Company {
  id: number;
  company_name: string;
  created_at: string;
}

interface NewCompaniesModalProps {
  isOpen: boolean;
  onClose: () => void;
  companies: Company[];
  yesterdayChange: number;
}

export function NewCompaniesModal({
  isOpen,
  onClose,
  companies,
  yesterdayChange: _yesterdayChange,
}: NewCompaniesModalProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();

    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="신규 업체 등록 상세" maxWidth="4xl">
      <div className="space-y-6">
        {/* 기간 정보 */}
        <div className={`p-4 ${BG_COLOR.grayHalf} rounded-lg`}>
          <p className={`text-sm ${TEXT_COLOR.tertiary} mb-1`}>최근 30일간</p>
          <p className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>
            {companies.length}개 업체 등록
          </p>
        </div>

        {/* 신규 업체 목록 */}
        <div className={`${BG_COLOR.white} p-6 rounded-xl border ${BORDER_COLOR.default}`}>
          <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>
            신규 등록 업체 목록 ({companies.length}개)
          </h3>
          {companies.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {companies.map((company) => (
                <div
                  key={company.id}
                  className={`flex items-center justify-between p-3 ${BG_COLOR.grayHalf} rounded-lg border ${BORDER_COLOR.medium}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium ${TEXT_COLOR.primary} truncate`}>
                      {company.company_name}
                    </p>
                    <p className={`text-xs ${TEXT_COLOR.subtle} mt-1`}>
                      {new Date(company.created_at).toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={`text-center py-8 ${TEXT_COLOR.subtle}`}>등록된 업체가 없습니다</p>
          )}
        </div>
      </div>
    </BaseModal>
  );
}
