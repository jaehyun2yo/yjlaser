'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import { useDeliveredCompanyNames } from '@/app/(admin)/admin/work-management/delivered/_lib/hooks';

interface CompanyMultiSelectProps {
  selected: string[];
  onChange: (companies: string[]) => void;
}

export function CompanyMultiSelect({ selected, onChange }: CompanyMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: companies = [], isLoading } = useDeliveredCompanyNames();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const filteredCompanies = companies.filter((name) =>
    name.toLowerCase().includes(searchInput.toLowerCase().trim())
  );

  const handleToggle = useCallback(
    (company: string) => {
      if (selected.includes(company)) {
        onChange(selected.filter((c) => c !== company));
      } else {
        onChange([...selected, company]);
      }
    },
    [selected, onChange]
  );

  const handleSelectAll = useCallback(() => {
    onChange([...companies]);
  }, [companies, onChange]);

  const handleClearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const buttonLabel =
    selected.length === 0
      ? '전체 업체'
      : selected.length === 1
        ? selected[0]
        : `업체 ${selected.length}개 선택`;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
          selected.length > 0
            ? `border-[#ED6C00] ${BG_COLOR.brandLight} text-[#ED6C00] ${BORDER_COLOR.orangeMedium}`
            : `${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.secondary}`
        }`}
      >
        <span className="max-w-[120px] truncate">{buttonLabel}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className={`absolute top-full left-0 mt-1 w-64 ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg shadow-lg z-50`}
        >
          {/* Search */}
          <div className={`p-2 border-b ${BORDER_COLOR.light}`}>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="업체명 검색..."
                className={`w-full pl-7 pr-7 py-1.5 text-xs border ${BORDER_COLOR.default} rounded ${BG_COLOR.page} ${TEXT_COLOR.primary} placeholder-gray-400`}
                autoFocus
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className={`flex items-center gap-2 px-2 py-1.5 border-b ${BORDER_COLOR.light}`}>
            <button
              onClick={handleSelectAll}
              className={`text-[10px] ${TEXT_COLOR.info} hover:underline`}
            >
              전체선택
            </button>
            <span className={TEXT_COLOR.dimInvert}>|</span>
            <button
              onClick={handleClearAll}
              className={`text-[10px] ${TEXT_COLOR.info} hover:underline`}
            >
              선택해제
            </button>
            {selected.length > 0 && (
              <span className="ml-auto text-[10px] text-gray-400">{selected.length}개 선택</span>
            )}
          </div>

          {/* Company list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {isLoading ? (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">불러오는 중...</div>
            ) : filteredCompanies.length === 0 ? (
              <div className="px-3 py-4 text-xs text-gray-400 text-center">
                {searchInput ? '검색 결과가 없습니다' : '업체가 없습니다'}
              </div>
            ) : (
              filteredCompanies.map((company) => {
                const isSelected = selected.includes(company);
                return (
                  <button
                    key={company}
                    onClick={() => handleToggle(company)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                      isSelected
                        ? `${BG_COLOR.brandLight} text-[#ED6C00]`
                        : `${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-[#ED6C00] border-[#ED6C00]' : `${BORDER_COLOR.default}`
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="truncate">{company}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Selected tags */}
      {selected.length > 0 && selected.length <= 5 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((company) => (
            <span
              key={company}
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] ${BG_COLOR.brandLight} text-[#ED6C00] rounded-full`}
            >
              {company}
              <button onClick={() => handleToggle(company)} className={TEXT_COLOR.hoverOrangeDeep}>
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
