'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { submitFeedback } from '@/app/actions/feedback';
import { useToast } from '@/hooks/useToast';
import { useContactFormStyles } from '@/lib/styles/contactFormStyles';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR, INPUT_STYLES, BUTTON_STYLES } from '@/lib/styles';

type FeedbackCategory = 'notice' | 'portfolio' | 'contact' | 'process' | 'other' | '';

export function FeedbackForm() {
  const [category, setCategory] = useState<FeedbackCategory>('');
  const [categoryOther, setCategoryOther] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const { getStyle, isMobile, isTablet } = useContactFormStyles();

  const categoryOptions = [
    { value: 'notice', label: '공지사항' },
    { value: 'portfolio', label: '포트폴리오' },
    { value: 'contact', label: '문의하기' },
    { value: 'process', label: '공정관리페이지' },
    { value: 'other', label: '기타' },
  ];

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    // 유효성 검사
    if (!category) {
      setError('불편한 카테고리를 선택해주세요.');
      return;
    }

    if (category === 'other' && !categoryOther.trim()) {
      setError('기타 카테고리를 입력해주세요.');
      return;
    }

    if (!content.trim()) {
      setError('불편사항 내용을 입력해주세요.');
      return;
    }

    if (content.trim().length < 10) {
      setError('불편사항 내용은 최소 10자 이상 입력해주세요.');
      return;
    }

    if (content.length > 5000) {
      setError('불편사항 내용은 5000자 이하로 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('category', category);
      if (category === 'other') {
        formData.append('category_other', categoryOther.trim());
      }
      formData.append('content', content.trim());

      const result = await submitFeedback(formData);

      if (result.success) {
        success('접수 완료', '불편사항이 성공적으로 접수되었습니다.');
        setCategory('');
        setCategoryOther('');
        setContent('');
        // 1초 후 대시보드로 이동
        setTimeout(() => {
          router.push('/company/dashboard');
        }, 1000);
      } else {
        setError(result.error || '불편사항 접수에 실패했습니다.');
        errorToast('접수 실패', result.error || '불편사항 접수에 실패했습니다.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
      setError(errorMessage);
      errorToast('오류', errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const characterCount = content.length;
  const remainingCharacters = 5000 - characterCount;

  return (
    <form onSubmit={handleSubmit} className={isMobile ? 'space-y-4' : 'space-y-6'}>
      <div>
        {/* 안내사항 - 카테고리 위에 배치 */}
        <div
          className={`${BG_COLOR.light} border ${BORDER_COLOR.default} rounded-lg ${isMobile ? 'p-3 mb-4' : isTablet ? 'p-4 mb-5' : 'p-4 mb-6'}`}
        >
          <p
            className={`${isMobile ? 'text-xs' : 'text-sm'} ${TEXT_COLOR.secondary} leading-relaxed ${isMobile ? 'space-y-1' : 'space-y-1.5'}`}
          >
            <strong
              className={`font-semibold block ${isMobile ? 'mb-1.5' : 'mb-2'} ${TEXT_COLOR.strong}`}
            >
              안내사항
            </strong>
            <span className="block">• 접수된 불편사항은 검토 후 답변드리겠습니다.</span>
            <span className="block">• 긴급한 사항은 전화로 문의해주시기 바랍니다.</span>
            <span className="block">• 접수 내용은 관리자에게 이메일로 전송됩니다.</span>
          </p>
        </div>

        {/* 불편한 카테고리 */}
        <div className={isMobile ? 'mb-4' : 'mb-5'}>
          <label
            htmlFor="category"
            className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}
          >
            불편한 카테고리 <span className="text-red-500">*</span>
          </label>
          <select
            id="category"
            name="category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as FeedbackCategory);
              if (e.target.value !== 'other') {
                setCategoryOther('');
              }
              setError(null);
            }}
            required
            disabled={isSubmitting}
            className={`${getStyle('inputSelect')} w-full ${
              error && !category ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
            } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <option value="">카테고리를 선택하세요</option>
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* 기타 카테고리 입력 필드 */}
        {category === 'other' && (
          <div className={isMobile ? 'mb-4' : 'mb-5'}>
            <label
              htmlFor="category_other"
              className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}
            >
              기타 카테고리 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="category_other"
              name="category_other"
              value={categoryOther}
              onChange={(e) => {
                setCategoryOther(e.target.value);
                setError(null);
              }}
              required={category === 'other'}
              disabled={isSubmitting}
              maxLength={50}
              className={`${INPUT_STYLES.base} ${INPUT_STYLES.full} ${
                error && category === 'other' && !categoryOther.trim()
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                  : ''
              } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              placeholder="기타 카테고리를 입력해주세요"
            />
          </div>
        )}

        {/* 불편사항 내용 */}
        <div className={isMobile ? 'mb-4' : 'mb-5'}>
          <label
            htmlFor="content"
            className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}
          >
            불편사항 내용 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="content"
            name="content"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setError(null);
            }}
            rows={isMobile ? 10 : 12}
            maxLength={5000}
            required
            disabled={isSubmitting}
            className={`${INPUT_STYLES.textarea} ${INPUT_STYLES.full} ${
              error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''
            } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
            placeholder="불편사항을 적어주세요"
          />
          <div
            className={`mt-2 flex items-center justify-between ${isMobile ? 'flex-col items-start gap-1' : ''}`}
          >
            <div>{error && <p className={`text-sm ${TEXT_COLOR.error}`}>{error}</p>}</div>
            <p
              className={`${isMobile ? 'text-[11px]' : 'text-xs'} ${
                remainingCharacters < 100 ? TEXT_COLOR.error : TEXT_COLOR.tertiary
              }`}
            >
              {characterCount} / 5,000자
            </p>
          </div>
        </div>
      </div>

      {/* 버튼 - 좌우 수평 배치 */}
      <div className={`flex flex-row gap-3 ${isMobile ? 'justify-stretch' : 'justify-end'}`}>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isSubmitting}
          className={`flex-1 ${isMobile ? '' : 'flex-none'} ${getStyle('buttonSecondary')} ${
            isSubmitting ? 'cursor-not-allowed opacity-50' : ''
          }`}
        >
          취소
        </button>
        <button
          type="submit"
          disabled={
            isSubmitting ||
            !category ||
            (category === 'other' && !categoryOther.trim()) ||
            !content.trim() ||
            content.trim().length < 10
          }
          className={`flex-1 ${isMobile ? '' : 'flex-none'} ${
            isSubmitting ||
            !category ||
            (category === 'other' && !categoryOther.trim()) ||
            !content.trim() ||
            content.trim().length < 10
              ? `${BUTTON_STYLES.primaryDisabled}`
              : `${getStyle('button')}`
          }`}
        >
          {isSubmitting ? '접수 중...' : '접수하기'}
        </button>
      </div>
    </form>
  );
}
