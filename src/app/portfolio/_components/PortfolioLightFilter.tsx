'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

interface PortfolioItem {
  id: string; // UUID
  title: string;
  field: string;
  purpose: string;
  type: string;
  format: string;
  size: string;
  paper: string;
  printing: string;
  finishing: string;
  description: string;
  images: string[] | Array<{ original: string; thumbnail?: string; medium?: string }>;
  created_at: string;
}

interface PortfolioLightFilterProps {
  items: PortfolioItem[];
  onFilterChange: (filteredItems: PortfolioItem[]) => void;
}

export function PortfolioLightFilter({ items, onFilterChange }: PortfolioLightFilterProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'field' | 'format' | 'type'>('all');
  const [selectedValue, setSelectedValue] = useState<string | null>(null);

  // 고유한 카테고리 값 추출
  const categories = useMemo(() => {
    const fields = Array.from(new Set(items.map((item) => item.field))).filter(Boolean);
    const formats = Array.from(new Set(items.map((item) => item.format))).filter(Boolean);
    const types = Array.from(new Set(items.map((item) => item.type))).filter(Boolean);

    return { fields, formats, types };
  }, [items]);

  // 필터링된 아이템 계산
  const filteredItems = useMemo(() => {
    if (activeFilter === 'all' || !selectedValue) {
      return items;
    }

    return items.filter((item) => {
      switch (activeFilter) {
        case 'field':
          return item.field === selectedValue;
        case 'format':
          return item.format === selectedValue;
        case 'type':
          return item.type === selectedValue;
        default:
          return true;
      }
    });
  }, [items, activeFilter, selectedValue]);

  // 필터 변경 시 콜백 호출
  useEffect(() => {
    onFilterChange(filteredItems);
  }, [filteredItems, onFilterChange]);

  // 필터 카테고리 변경
  const handleCategoryChange = (category: 'all' | 'field' | 'format' | 'type') => {
    if (category === 'all') {
      setActiveFilter('all');
      setSelectedValue(null);
    } else if (activeFilter === category) {
      // 같은 카테고리 클릭 시 토글
      setActiveFilter('all');
      setSelectedValue(null);
    } else {
      setActiveFilter(category);
      setSelectedValue(null);
    }
  };

  // 필터 값 선택
  const handleValueSelect = (value: string) => {
    if (selectedValue === value) {
      setSelectedValue(null);
    } else {
      setSelectedValue(value);
    }
  };

  // 현재 카테고리의 옵션들
  const currentOptions = useMemo(() => {
    switch (activeFilter) {
      case 'field':
        return categories.fields;
      case 'format':
        return categories.formats;
      case 'type':
        return categories.types;
      default:
        return [];
    }
  }, [activeFilter, categories]);

  return (
    <div className="mb-8">
      {/* 필터 카테고리 버튼 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={() => handleCategoryChange('all')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
            activeFilter === 'all'
              ? 'bg-[#ED6C00] text-white'
              : '${BG_COLOR.lightDark} ${TEXT_COLOR.tertiary} ${BG_COLOR.hoverMedium}'
          }`}
        >
          전체
          <span className="ml-1.5 text-xs opacity-70">({items.length})</span>
        </button>

        {categories.fields.length > 0 && (
          <button
            onClick={() => handleCategoryChange('field')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeFilter === 'field'
                ? 'bg-[#ED6C00] text-white'
                : '${BG_COLOR.lightDark} ${TEXT_COLOR.tertiary} ${BG_COLOR.hoverMedium}'
            }`}
          >
            분야
          </button>
        )}

        {categories.formats.length > 0 && (
          <button
            onClick={() => handleCategoryChange('format')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeFilter === 'format'
                ? 'bg-[#ED6C00] text-white'
                : '${BG_COLOR.lightDark} ${TEXT_COLOR.tertiary} ${BG_COLOR.hoverMedium}'
            }`}
          >
            박스형태
          </button>
        )}

        {categories.types.length > 0 && (
          <button
            onClick={() => handleCategoryChange('type')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeFilter === 'type'
                ? 'bg-[#ED6C00] text-white'
                : '${BG_COLOR.lightDark} ${TEXT_COLOR.tertiary} ${BG_COLOR.hoverMedium}'
            }`}
          >
            박스종류
          </button>
        )}

        {/* 결과 수 표시 */}
        {selectedValue && (
          <span className={`ml-auto text-sm ${TEXT_COLOR.subtle}`}>
            {filteredItems.length}개의 결과
          </span>
        )}
      </div>

      {/* 필터 옵션 태그들 */}
      <AnimatePresence>
        {activeFilter !== 'all' && currentOptions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className={`flex flex-wrap gap-2 pb-4 border-b ${BORDER_COLOR.lightMedium}`}>
              {currentOptions.map((option, index) => (
                <motion.button
                  key={option}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => handleValueSelect(option)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                    selectedValue === option
                      ? `${BG_COLOR.invertedWhite} ${TEXT_COLOR.inverted}`
                      : `${BG_COLOR.white} border ${BORDER_COLOR.default} ${TEXT_COLOR.tertiary} hover:border-[#ED6C00] hover:text-[#ED6C00]`
                  }`}
                >
                  {option}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
