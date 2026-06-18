'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

interface PortfolioTagFilterProps {
  items: PortfolioItem[];
  onFilterChange: (filteredItems: PortfolioItem[]) => void;
}

export function PortfolioTagFilter({ items, onFilterChange }: PortfolioTagFilterProps) {
  const [openCategory, setOpenCategory] = useState<'field' | 'format' | 'type' | null>(null);
  const [selectedTags, setSelectedTags] = useState<{
    field?: string;
    format?: string;
    type?: string;
  }>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // 고유한 카테고리 값 추출
  const categories = useMemo(() => {
    const fields = Array.from(new Set(items.map((item) => item.field))).filter(Boolean);
    const formats = Array.from(new Set(items.map((item) => item.format))).filter(Boolean);
    const types = Array.from(new Set(items.map((item) => item.type))).filter(Boolean);

    return { fields, formats, types };
  }, [items]);

  // 필터링된 아이템 계산
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedTags.field && item.field !== selectedTags.field) return false;
      if (selectedTags.format && item.format !== selectedTags.format) return false;
      if (selectedTags.type && item.type !== selectedTags.type) return false;
      return true;
    });
  }, [items, selectedTags]);

  // 필터 변경 시 콜백 호출
  useEffect(() => {
    onFilterChange(filteredItems);
  }, [filteredItems, onFilterChange]);

  // 태그 선택 핸들러
  const handleTagClick = (category: 'field' | 'format' | 'type', value: string) => {
    setSelectedTags((prev) => {
      const newTags = { ...prev };
      // 같은 태그를 다시 클릭하면 선택 해제
      if (newTags[category] === value) {
        delete newTags[category];
      } else {
        newTags[category] = value;
      }
      return newTags;
    });
  };

  // 외부 클릭 감지하여 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenCategory(null);
      }
    };

    if (openCategory !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openCategory]);

  return (
    <div className="fixed top-24 md:top-28 lg:top-32 left-1/2 transform -translate-x-1/2 z-[90] max-w-5xl w-full px-4">
      <div ref={containerRef} className="flex items-start justify-center gap-2">
        {/* 분야 토글 버튼 */}
        {categories.fields.length > 0 && (
          <div className="relative flex flex-col items-center">
            <motion.button
              onClick={() => setOpenCategory(openCategory === 'field' ? null : 'field')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-all shadow-2xl border ${
                openCategory === 'field'
                  ? 'bg-white text-black border-white'
                  : 'text-white/70 hover:text-white border-white/20'
              }`}
              style={{
                background:
                  openCategory === 'field' ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              }}
            >
              분야
            </motion.button>
            <AnimatePresence>
              {openCategory === 'field' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="absolute top-full left-1/2 transform -translate-x-1/2 mt-3 flex flex-wrap gap-1 justify-center z-50"
                  style={{
                    width: '90vw',
                    maxWidth: '1200px',
                    maxHeight: 'calc(2 * (1.5rem + 0.5rem + 0.5rem + 0.5rem))',
                    overflow: 'hidden',
                  }}
                >
                  {categories.fields.map((field, index) => (
                    <motion.button
                      key={field}
                      initial={{ opacity: 0, scale: 0.8, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.8, y: -5 }}
                      transition={{
                        duration: 0.2,
                        delay: index * 0.03,
                        ease: 'easeOut',
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleTagClick('field', field)}
                      className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                        selectedTags.field === field
                          ? 'bg-white text-black border-white'
                          : 'text-white/70 hover:text-white border-white/20'
                      }`}
                      style={{
                        background:
                          selectedTags.field === field
                            ? 'rgba(255, 255, 255, 1)'
                            : 'rgba(255, 255, 255, 0.1)',
                        backdropFilter: 'blur(20px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                      }}
                    >
                      {field}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* 박스형태 토글 버튼 */}
        {categories.formats.length > 0 && (
          <div className="relative flex flex-col items-center">
            <motion.button
              onClick={() => setOpenCategory(openCategory === 'format' ? null : 'format')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-all shadow-2xl border ${
                openCategory === 'format'
                  ? 'bg-white text-black border-white'
                  : 'text-white/70 hover:text-white border-white/20'
              }`}
              style={{
                background:
                  openCategory === 'format' ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              }}
            >
              박스형태
            </motion.button>
            <AnimatePresence>
              {openCategory === 'format' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="absolute top-full left-1/2 transform -translate-x-1/2 mt-3 flex flex-wrap gap-1 justify-center z-50"
                  style={{
                    width: '90vw',
                    maxWidth: '1200px',
                    maxHeight: 'calc(2 * (1.5rem + 0.5rem + 0.5rem + 0.5rem))',
                    overflow: 'hidden',
                  }}
                >
                  {categories.formats.map((format, index) => (
                    <motion.button
                      key={format}
                      initial={{ opacity: 0, scale: 0.8, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.8, y: -5 }}
                      transition={{
                        duration: 0.2,
                        delay: index * 0.03,
                        ease: 'easeOut',
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleTagClick('format', format)}
                      className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                        selectedTags.format === format
                          ? 'bg-white text-black border-white'
                          : 'text-white/70 hover:text-white border-white/20'
                      }`}
                      style={{
                        background:
                          selectedTags.format === format
                            ? 'rgba(255, 255, 255, 1)'
                            : 'rgba(255, 255, 255, 0.1)',
                        backdropFilter: 'blur(20px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                      }}
                    >
                      {format}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* 박스 종류 토글 버튼 */}
        {categories.types.length > 0 && (
          <div className="relative flex flex-col items-center">
            <motion.button
              onClick={() => setOpenCategory(openCategory === 'type' ? null : 'type')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-all shadow-2xl border ${
                openCategory === 'type'
                  ? 'bg-white text-black border-white'
                  : 'text-white/70 hover:text-white border-white/20'
              }`}
              style={{
                background:
                  openCategory === 'type' ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              }}
            >
              박스 종류
            </motion.button>
            <AnimatePresence>
              {openCategory === 'type' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="absolute top-full left-1/2 transform -translate-x-1/2 mt-3 flex flex-wrap gap-1 justify-center z-50"
                  style={{
                    width: '90vw',
                    maxWidth: '1200px',
                    maxHeight: 'calc(2 * (1.5rem + 0.5rem + 0.5rem + 0.5rem))',
                    overflow: 'hidden',
                  }}
                >
                  {categories.types.map((type, index) => (
                    <motion.button
                      key={type}
                      initial={{ opacity: 0, scale: 0.8, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.8, y: -5 }}
                      transition={{
                        duration: 0.2,
                        delay: index * 0.03,
                        ease: 'easeOut',
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleTagClick('type', type)}
                      className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                        selectedTags.type === type
                          ? 'bg-white text-black border-white'
                          : 'text-white/70 hover:text-white border-white/20'
                      }`}
                      style={{
                        background:
                          selectedTags.type === type
                            ? 'rgba(255, 255, 255, 1)'
                            : 'rgba(255, 255, 255, 0.1)',
                        backdropFilter: 'blur(20px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                      }}
                    >
                      {type}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
