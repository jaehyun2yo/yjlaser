'use client';

/**
 * BoxShapeSelectorGrid - 이미지 그리드 기반 박스 형태 선택기
 * 나중에 디벨롭할 예정 (이미지 배경 제거 등)
 * 현재는 BoxShapeSelector (드롭다운)으로 대체
 */

import { BG_COLOR, BORDER_COLOR } from '@/lib/styles';

// 박스 형태 타입 정의 (이미지 기준 12가지)
export type BoxShapeType =
  | 'b_box' // B-BOX (맞뚜껑 단상자)
  | 'tuck' // TUCK (턱박스/삼면접착)
  | 'y_box' // Y-BOX (상하조립형)
  | 'a_box' // A-BOX (택배박스/골판지)
  | 'c1_box' // C1-BOX (트레이형)
  | 'c2_box' // C2-BOX (G형/피자박스형)
  | 'pj_pg' // PJ&PG (육각형/특수형)
  | 'pvc' // PVC (투명케이스)
  | 'sb_vb' // SB&VB (싸바리박스)
  | 'pad' // PAD (패드/완충재)
  | 'folder' // FOLDER & LETTER CASE
  | 'shopping_bag'; // SHOPPING BAG (쇼핑백)

interface BoxShapeOption {
  id: BoxShapeType;
  label: string;
  subLabel?: string;
  imagePath: string;
}

// 박스 형태 옵션 배열 - PNG 이미지 사용
const boxShapeOptions: BoxShapeOption[] = [
  { id: 'b_box', label: 'B-BOX', subLabel: '맞뚜껑', imagePath: '/images/box-shapes/b-box.png' },
  { id: 'tuck', label: 'TUCK', subLabel: '턱박스', imagePath: '/images/box-shapes/tuck.png' },
  { id: 'y_box', label: 'Y-BOX', subLabel: '상하조립', imagePath: '/images/box-shapes/y-box.png' },
  { id: 'a_box', label: 'A-BOX', subLabel: '택배박스', imagePath: '/images/box-shapes/a-box.png' },
  { id: 'c1_box', label: 'C1-BOX', subLabel: '트레이', imagePath: '/images/box-shapes/c1-box.png' },
  { id: 'c2_box', label: 'C2-BOX', subLabel: 'G형', imagePath: '/images/box-shapes/c2-box.png' },
  { id: 'pj_pg', label: 'PJ&PG', subLabel: '육각형', imagePath: '/images/box-shapes/pj-pg.png' },
  { id: 'pvc', label: 'PVC', subLabel: '투명케이스', imagePath: '/images/box-shapes/pvc.png' },
  { id: 'sb_vb', label: 'SB&VB', subLabel: '싸바리', imagePath: '/images/box-shapes/sb-vb.png' },
  { id: 'pad', label: 'PAD', subLabel: '완충재', imagePath: '/images/box-shapes/pad.png' },
  {
    id: 'folder',
    label: 'FOLDER',
    subLabel: '레터케이스',
    imagePath: '/images/box-shapes/folder.png',
  },
  {
    id: 'shopping_bag',
    label: 'SHOPPING',
    subLabel: '쇼핑백',
    imagePath: '/images/box-shapes/shopping.png',
  },
];

interface BoxShapeSelectorGridProps {
  value: string;
  onChange: (value: string) => void;
  isMobile?: boolean;
}

export function BoxShapeSelectorGrid({
  value,
  onChange,
  isMobile = false,
}: BoxShapeSelectorGridProps) {
  return (
    <div
      className={`grid gap-2 sm:gap-3 ${isMobile ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6'}`}
    >
      {boxShapeOptions.map((option) => {
        const isSelected = value === option.label;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.label)}
            className={`
              relative overflow-hidden rounded-lg border-2 transition-all duration-200
              h-[100px] sm:h-[120px] focus:outline-none ${BG_COLOR.lightDark}
              hover:scale-[1.02] active:scale-[0.98]
              ${
                isSelected
                  ? 'border-[#ED6C00] ring-2 ring-[#ED6C00]/30'
                  : `${BORDER_COLOR.default} hover:border-[#ED6C00]/50`
              }
            `}
          >
            {/* 배경 이미지 (꽉 채움) */}
            <img
              src={option.imagePath}
              alt={option.label}
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* 선택 표시 */}
            {isSelected && (
              <div className="absolute top-1 right-1 w-5 h-5 bg-[#ED6C00] rounded-full flex items-center justify-center z-20 animate-scaleIn">
                <svg
                  className="w-3 h-3 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            )}

            {/* 하단 그라데이션 오버레이 + 텍스트 */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-2 z-10">
              <span className="block text-[10px] sm:text-xs font-semibold text-white text-center leading-tight">
                {option.label}
              </span>
              {option.subLabel && (
                <span className="block text-[9px] sm:text-[10px] text-white/80 text-center">
                  {option.subLabel}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
