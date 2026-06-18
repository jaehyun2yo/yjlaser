'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { FaTimes, FaCut, FaCube, FaBolt, FaEllipsisH } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
}

type InquiryType = 'cutting_request' | 'mold_request' | 'laser_cutting' | 'other';

interface InquiryOption {
  type: InquiryType;
  label: string;
  description: string;
  icon: React.ReactNode;
  folderName: string | null;
  laserOnly?: boolean;
}

const INQUIRY_OPTIONS: InquiryOption[] = [
  {
    type: 'cutting_request',
    label: '칼선 의뢰',
    description: '칼선 도면 의뢰 (도면작업 필요)',
    icon: <FaCut className="w-6 h-6" />,
    folderName: '칼선의뢰',
  },
  {
    type: 'mold_request',
    label: '목형 의뢰',
    description: '목형 도면 의뢰 (바로 제작 가능)',
    icon: <FaCube className="w-6 h-6" />,
    folderName: '목형의뢰',
  },
  {
    type: 'laser_cutting',
    label: '레이저가공 의뢰',
    description: '레이저 전용 가공 의뢰',
    icon: <FaBolt className="w-6 h-6" />,
    folderName: '레이저가공',
    laserOnly: true,
  },
  {
    type: 'other',
    label: '기타',
    description: '직접 폴더를 선택하여 업로드',
    icon: <FaEllipsisH className="w-6 h-6" />,
    folderName: null,
  },
];

interface InquiryTypeSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (folderId: string) => void;
  onOtherSelect: () => void;
  isLaserOnly: boolean;
}

export function InquiryTypeSelectModal({
  isOpen,
  onClose,
  onSelect,
  onOtherSelect,
  isLaserOnly,
}: InquiryTypeSelectModalProps) {
  const [error, setError] = useState<string | null>(null);

  const { data: folders = [] } = useQuery<Folder[]>({
    queryKey: queryKeys.webhard.folders.all(),
    queryFn: async () => {
      const response = await fetch('/api/webhard/folders');
      if (!response.ok) throw new Error('Failed to fetch folders');
      const data = await response.json();
      return data.folders || data || [];
    },
    enabled: isOpen,
    staleTime: 30_000,
  });

  const handleSelect = (option: InquiryOption) => {
    setError(null);

    if (option.type === 'other') {
      onClose();
      onOtherSelect();
      return;
    }

    if (!option.folderName) return;

    const targetFolder = folders.find((f) => f.name === option.folderName);

    if (!targetFolder) {
      setError(`'${option.folderName}' 폴더를 찾을 수 없습니다. 관리자에게 문의하세요.`);
      return;
    }

    onSelect(targetFolder.id);
    onClose();
  };

  const visibleOptions = INQUIRY_OPTIONS.filter((opt) => !opt.laserOnly || isLaserOnly);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className={`relative w-full max-w-md ${BG_COLOR.card} rounded-xl shadow-2xl`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b ${BORDER_COLOR.light}`}>
              <h2 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>의뢰 유형 선택</h2>
              <button
                onClick={onClose}
                className={`p-1 rounded-lg ${BG_COLOR.hoverMuted} ${TEXT_COLOR.secondary}`}
              >
                <FaTimes className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4">
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-4`}>
                업로드할 파일의 의뢰 유형을 선택해주세요.
              </p>

              <div className="space-y-2">
                {visibleOptions.map((option) => (
                  <button
                    key={option.type}
                    onClick={() => handleSelect(option)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border ${BORDER_COLOR.light} ${BG_COLOR.hoverMuted} transition-all hover:border-orange-300 hover:shadow-sm text-left`}
                  >
                    <div
                      className={`flex-shrink-0 w-12 h-12 rounded-lg ${BG_COLOR.brandLight} flex items-center justify-center ${TEXT_COLOR.brand}`}
                    >
                      {option.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium ${TEXT_COLOR.primary}`}>{option.label}</div>
                      <div className={`text-sm ${TEXT_COLOR.secondary}`}>{option.description}</div>
                    </div>
                  </button>
                ))}
              </div>

              {error && (
                <div
                  className={`mt-3 p-3 rounded-lg ${BG_COLOR.error} ${TEXT_COLOR.error} text-sm`}
                >
                  {error}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
