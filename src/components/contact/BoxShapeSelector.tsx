'use client';

import { useContactFormStyles } from '@/lib/styles/contactFormStyles';

// 박스 형태 옵션 배열
const boxShapeOptions = [
  { value: 'B-BOX', label: 'B-BOX (맞뚜껑)' },
  { value: 'TUCK', label: 'TUCK (턱박스)' },
  { value: 'Y-BOX', label: 'Y-BOX (상하조립)' },
  { value: 'A-BOX', label: 'A-BOX (택배박스)' },
  { value: 'C1-BOX', label: 'C1-BOX (트레이)' },
  { value: 'C2-BOX', label: 'C2-BOX (G형)' },
  { value: 'PJ&PG', label: 'PJ&PG (육각형)' },
  { value: 'PVC', label: 'PVC (투명케이스)' },
  { value: 'SB&VB', label: 'SB&VB (싸바리)' },
  { value: 'PAD', label: 'PAD (완충재)' },
  { value: 'FOLDER', label: 'FOLDER (레터케이스)' },
  { value: 'SHOPPING', label: 'SHOPPING (쇼핑백)' },
  { value: '기타', label: '기타' },
];

interface BoxShapeSelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function BoxShapeSelector({ value, onChange, className = '' }: BoxShapeSelectorProps) {
  const { getStyle } = useContactFormStyles();

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${getStyle('inputSelect')} ${className}`}
    >
      <option value="">박스 형태를 선택하세요</option>
      {boxShapeOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

// 박스 형태 타입 export (하위 호환성)
export type BoxShapeType =
  | 'b_box'
  | 'tuck'
  | 'y_box'
  | 'a_box'
  | 'c1_box'
  | 'c2_box'
  | 'pj_pg'
  | 'pvc'
  | 'sb_vb'
  | 'pad'
  | 'folder'
  | 'shopping_bag';
