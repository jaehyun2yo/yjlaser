'use client';

import { useState, FormEvent, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FileUpload } from '@/components/FileUpload';
import SuccessModal from '@/components/SuccessModal';
import { logger } from '@/lib/utils/logger';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

const log = logger.createLogger('PortfolioForm');

interface UploadedImage {
  original: string;
  thumbnail?: string;
  medium?: string;
}

interface PortfolioFormProps {
  savePortfolio: (formData: FormData) => Promise<{ success: boolean; error?: string }>;
  fieldOptions: string[];
  purposeOptions: string[];
  typeOptions: string[];
  formatOptions: string[];
}

export function PortfolioForm({
  savePortfolio,
  fieldOptions,
  purposeOptions,
  typeOptions,
  formatOptions,
}: PortfolioFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [_uploadProgress, setUploadProgress] = useState<Record<number, boolean>>({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handleFileChange = async (files: File[]) => {
    if (files.length === 0) {
      setUploadedImages([]);
      return;
    }

    setUploading(true);
    const newUploadedImages: UploadedImage[] = [];
    const progress: Record<number, boolean> = {};

    try {
      // 각 파일을 순차적으로 업로드
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        progress[i] = false;
        setUploadProgress({ ...progress });

        try {
          const formData = new FormData();
          formData.append('file', file);

          const response = await fetch('/api/portfolio/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
          }

          const result = await response.json();
          if (result.success && result.data) {
            newUploadedImages.push(result.data);
            progress[i] = true;
            setUploadProgress({ ...progress });
          }
        } catch (error) {
          log.error(`Failed to upload file ${file.name}:`, error);
          alert(`이미지 업로드 실패: ${file.name}`);
        }
      }

      setUploadedImages(newUploadedImages);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (uploading) {
      alert('이미지 업로드 중입니다. 잠시만 기다려주세요.');
      return;
    }

    // FormData를 직접 생성하여 이미지 파일을 제외하고 텍스트 필드만 포함
    const form = e.currentTarget;
    const formData = new FormData();

    // 텍스트 필드만 추가 (이미지 파일 제외)
    const textFields = [
      'title',
      'field',
      'purpose',
      'type',
      'format',
      'size',
      'paper',
      'printing',
      'finishing',
      'description',
    ];
    textFields.forEach((fieldName) => {
      const input = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        `[name="${fieldName}"]`
      );
      if (input && input.value) {
        formData.append(fieldName, input.value);
      }
    });

    // 업로드된 이미지 URL 추가
    uploadedImages.forEach((img) => {
      formData.append('uploadedImages', JSON.stringify(img));
    });

    try {
      const result = await savePortfolio(formData);
      if (result.success) {
        // 성공 시 모달 표시
        setShowSuccessModal(true);
      } else {
        // 에러 처리
        const errorMessages: Record<string, string> = {
          invalid: '필수 항목을 확인해주세요.',
          server: '저장 중 오류가 발생했습니다.',
        };
        alert(errorMessages[result.error || 'invalid'] || '저장에 실패했습니다.');
      }
    } catch (error) {
      log.error('Failed to save portfolio:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleSuccessModalClose = () => {
    setShowSuccessModal(false);
    // 폼 초기화
    if (formRef.current) {
      formRef.current.reset();
    }
    setUploadedImages([]);
    // 리다이렉션
    router.push('/admin/portfolio');
    router.refresh();
  };

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.strong}`}>제목</label>
            <input
              type="text"
              name="title"
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.dark} ${BG_COLOR.whiteDark} ${TEXT_COLOR.primary}`}
              placeholder="프로젝트 제목"
              required
            />
          </div>

          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.strong}`}>분야</label>
            <select
              name="field"
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.dark} ${BG_COLOR.whiteDark} ${TEXT_COLOR.primary}`}
              defaultValue=""
              required
            >
              <option value="" disabled>
                분야 선택
              </option>
              {fieldOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.strong}`}>목적</label>
            <select
              name="purpose"
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.dark} ${BG_COLOR.whiteDark} ${TEXT_COLOR.primary}`}
              defaultValue=""
              required
            >
              <option value="" disabled>
                목적 선택
              </option>
              {purposeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.strong}`}>종류</label>
            <select
              name="type"
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.dark} ${BG_COLOR.whiteDark} ${TEXT_COLOR.primary}`}
              defaultValue=""
              required
            >
              <option value="" disabled>
                종류 선택
              </option>
              {typeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.strong}`}>형태</label>
            <select
              name="format"
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.dark} ${BG_COLOR.whiteDark} ${TEXT_COLOR.primary}`}
              defaultValue=""
              required
            >
              <option value="" disabled>
                형태 선택
              </option>
              {formatOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.strong}`}>
              장폭고 (규격/사이즈)
            </label>
            <input
              type="text"
              name="size"
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.dark} ${BG_COLOR.whiteDark} ${TEXT_COLOR.primary}`}
              placeholder="예: 210x297mm (A4)"
              required
            />
          </div>

          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.strong}`}>지류 (종이)</label>
            <input
              type="text"
              name="paper"
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.dark} ${BG_COLOR.whiteDark} ${TEXT_COLOR.primary}`}
              placeholder="예: 스노우지 200g, 랑데뷰 240g"
              required
            />
          </div>

          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.strong}`}>인쇄</label>
            <input
              type="text"
              name="printing"
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.dark} ${BG_COLOR.whiteDark} ${TEXT_COLOR.primary}`}
              placeholder="예: 컬러 4도 / 별색 / 양면"
              required
            />
          </div>

          <div className="space-y-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.strong}`}>후가공</label>
            <input
              type="text"
              name="finishing"
              className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.dark} ${BG_COLOR.whiteDark} ${TEXT_COLOR.primary}`}
              placeholder="예: 코팅, 박, 형압, 오시, 접지"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <FileUpload
            name="images"
            accept="image/*"
            multiple
            maxSize={10 * 1024 * 1024}
            label="이미지 (여러 장)"
            helpText={
              uploading
                ? '이미지 업로드 중...'
                : '여러 이미지를 선택할 수 있습니다. 선택 시 자동으로 업로드됩니다.'
            }
            onChange={handleFileChange}
          />
          {uploadedImages.length > 0 && (
            <div className={`mt-2 text-sm ${TEXT_COLOR.success}`}>
              {uploadedImages.length}개의 이미지가 업로드되었습니다.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className={`block text-sm font-medium ${TEXT_COLOR.strong}`}>설명</label>
          <textarea
            name="description"
            rows={6}
            className={`w-full px-3 py-2 rounded-lg border ${BORDER_COLOR.dark} ${BG_COLOR.whiteDark} ${TEXT_COLOR.primary}`}
            placeholder="프로젝트에 대한 상세 설명"
            required
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={uploading}
            className="px-4 py-2 rounded-lg bg-[#ED6C00] text-white hover:bg-[#d15f00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? '업로드 중...' : '저장'}
          </button>
        </div>
      </form>

      <SuccessModal
        isOpen={showSuccessModal}
        onClose={handleSuccessModalClose}
        title="포트폴리오가 저장되었습니다"
        message="포트폴리오 항목이 성공적으로 저장되었습니다."
      />
    </>
  );
}
