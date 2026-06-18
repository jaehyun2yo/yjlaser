'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';
import { useDeliveredCompanyNames } from '@/app/(admin)/admin/work-management/delivered/_lib/hooks';

interface WorkerCompanyMultiSelectProps {
  selected: string[];
  onChange: (companies: string[]) => void;
}

export function WorkerCompanyMultiSelect({ selected, onChange }: WorkerCompanyMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { data: companies = [], isLoading } = useDeliveredCompanyNames();

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
        className={`w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-xl border transition-colors ${
          selected.length > 0
            ? 'border-[#ED6C00] bg-orange-50 text-[#ED6C00]'
            : 'border-gray-200 bg-white text-gray-700'
        }`}
      >
        <span className="truncate">{buttonLabel}</span>
        <ChevronDown
          className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="업체명 검색..."
                className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-900 placeholder-gray-400"
                autoFocus
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-100">
            <button onClick={handleSelectAll} className="text-xs text-blue-600 hover:underline">
              전체선택
            </button>
            <span className="text-gray-300">|</span>
            <button onClick={handleClearAll} className="text-xs text-blue-600 hover:underline">
              선택해제
            </button>
            {selected.length > 0 && (
              <span className="ml-auto text-xs text-gray-400">{selected.length}개 선택</span>
            )}
          </div>

          {/* Company list */}
          <div className="max-h-48 overflow-y-auto py-1">
            {isLoading ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">불러오는 중...</div>
            ) : filteredCompanies.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">
                {searchInput ? '검색 결과가 없습니다' : '업체가 없습니다'}
              </div>
            ) : (
              filteredCompanies.map((company) => {
                const isSelected = selected.includes(company);
                return (
                  <button
                    key={company}
                    onClick={() => handleToggle(company)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors ${
                      isSelected ? 'bg-orange-50 text-[#ED6C00]' : 'text-gray-700 active:bg-gray-50'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-[#ED6C00] border-[#ED6C00]' : 'border-gray-300'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
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
        <div className="flex flex-wrap gap-1 mt-2">
          {selected.map((company) => (
            <span
              key={company}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-orange-100 text-[#ED6C00] rounded-full"
            >
              {company}
              <button onClick={() => handleToggle(company)} className="hover:text-orange-800">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
