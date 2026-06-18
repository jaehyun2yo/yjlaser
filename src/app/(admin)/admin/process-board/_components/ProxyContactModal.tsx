'use client';

import { useState } from 'react';
import { useCreateProxyContact } from '@/app/(admin)/admin/process-board/_lib/hooks';
import { MODAL, TEXT_COLOR, BG_COLOR } from '@/lib/styles';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { logger } from '@/lib/utils/logger';
import type { ProxyContactInput } from '@/app/(admin)/admin/process-board/_lib/types';

interface ProxyContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProxyContactModal({ isOpen, onClose }: ProxyContactModalProps) {
  const { mutate: createProxy, isPending } = useCreateProxyContact();

  const [formData, setFormData] = useState<ProxyContactInput>({
    company_name: '',
    name: '',
    phone: '',
    inquiry_title: '',
    email: '',
    length: '',
    width: '',
    height: '',
    material: '',
    drawing_notes: '',
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 필수 필드 검증
    if (!formData.company_name || !formData.name || !formData.phone || !formData.inquiry_title) {
      alert('필수 항목을 모두 입력해주세요.');
      return;
    }

    createProxy(formData, {
      onSuccess: () => {
        // 폼 리셋
        setFormData({
          company_name: '',
          name: '',
          phone: '',
          inquiry_title: '',
          email: '',
          length: '',
          width: '',
          height: '',
          material: '',
          drawing_notes: '',
        });
        onClose();
      },
      onError: (error) => {
        logger.error('대리 문의 등록 실패:', error);
        alert('대리 문의 등록에 실패했습니다.');
      },
    });
  };

  const handleChange = (field: keyof ProxyContactInput, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className={MODAL.overlay} onClick={onClose}>
      <div className={`${MODAL.container} max-w-lg`} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className={MODAL.header}>
          <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>문의 대리 등록</h2>
          <button
            onClick={onClose}
            className={`p-1 ${BG_COLOR.hoverMuted} rounded transition-colors`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* 본문 */}
        <form onSubmit={handleSubmit}>
          <div className={MODAL.body}>
            {/* 필수 필드 */}
            <div className="space-y-4 mb-4">
              <div>
                <label className={`block text-sm font-medium ${TEXT_COLOR.primary} mb-1`}>
                  업체명 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                  className="w-full"
                  placeholder="업체명을 입력하세요"
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${TEXT_COLOR.primary} mb-1`}>
                  담당자명 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full"
                  placeholder="담당자명을 입력하세요"
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${TEXT_COLOR.primary} mb-1`}>
                  연락처 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className="w-full"
                  placeholder="010-0000-0000"
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${TEXT_COLOR.primary} mb-1`}>
                  패키지명 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={formData.inquiry_title}
                  onChange={(e) => handleChange('inquiry_title', e.target.value)}
                  className="w-full"
                  placeholder="패키지명을 입력하세요"
                  required
                />
              </div>
            </div>

            {/* 선택 필드 */}
            <div className={`pt-4 border-t ${BG_COLOR.muted}`}>
              <h3 className={`text-sm font-medium ${TEXT_COLOR.primary} mb-3`}>추가 정보 (선택)</h3>
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
                    이메일
                  </label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="w-full"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
                    크기 (가로 × 세로 × 높이)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="text"
                      value={formData.length}
                      onChange={(e) => handleChange('length', e.target.value)}
                      placeholder="가로"
                    />
                    <Input
                      type="text"
                      value={formData.width}
                      onChange={(e) => handleChange('width', e.target.value)}
                      placeholder="세로"
                    />
                    <Input
                      type="text"
                      value={formData.height}
                      onChange={(e) => handleChange('height', e.target.value)}
                      placeholder="높이"
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
                    재질
                  </label>
                  <Input
                    type="text"
                    value={formData.material}
                    onChange={(e) => handleChange('material', e.target.value)}
                    className="w-full"
                    placeholder="재질을 입력하세요"
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
                    메모
                  </label>
                  <Textarea
                    value={formData.drawing_notes}
                    onChange={(e) => handleChange('drawing_notes', e.target.value)}
                    className="w-full"
                    rows={3}
                    placeholder="추가 메모를 입력하세요"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 푸터 */}
          <div className={MODAL.footer}>
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 bg-gray-200 ${BG_COLOR.hoverDark} ${TEXT_COLOR.primary} rounded-lg text-sm font-medium transition-colors`}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-[#ED6C00] hover:bg-[#d15f00] disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isPending ? '등록 중...' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
