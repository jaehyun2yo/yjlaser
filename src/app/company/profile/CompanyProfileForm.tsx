'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  BUTTON_STYLES,
  INPUT_STYLES,
  TEXT_COLOR,
  BG_COLOR,
  BORDER_COLOR,
  LAYOUT,
  ALERT,
} from '@/lib/styles';
import { FaSave, FaPaperclip, FaPlus, FaEdit, FaTrash } from 'react-icons/fa';
import { DownloadButton } from '@/components/DownloadButton';
import { FileUpload } from '@/components/FileUpload';
import { RadioButton } from '@/components/RadioButton';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('CompanyProfileForm');

const FORM_INPUT = `${INPUT_STYLES.base} ${INPUT_STYLES.full}`;

interface Company {
  id: number;
  username: string;
  company_name: string;
  business_registration_number: string;
  representative_name: string;
  business_type: string | null;
  business_category: string | null;
  business_address: string;
  business_registration_file_url: string | null;
  business_registration_file_name: string | null;
  manager_name: string;
  manager_position: string;
  manager_phone: string;
  manager_email: string;
  accountant_name: string | null;
  accountant_phone: string | null;
  accountant_email: string | null;
  accountant_fax: string | null;
  quote_method_email: boolean;
  quote_method_fax: boolean;
  quote_method_sms: boolean;
}

interface DeliveryCompany {
  id: number;
  name: string;
  phone: string;
  address: string;
  created_at: string;
  updated_at: string;
}

interface CompanyProfileFormProps {
  company: Company;
}

export function CompanyProfileForm({ company }: CompanyProfileFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [quoteMethod, setQuoteMethod] = useState<string>(
    company.quote_method_email
      ? 'email'
      : company.quote_method_fax
        ? 'fax'
        : company.quote_method_sms
          ? 'sms'
          : 'email'
  );

  // 납품업체 관리 상태
  const [deliveryCompanies, setDeliveryCompanies] = useState<DeliveryCompany[]>([]);
  const [isLoadingDeliveryCompanies, setIsLoadingDeliveryCompanies] = useState(true);
  const [showAddDeliveryCompany, setShowAddDeliveryCompany] = useState(false);
  const [editingDeliveryCompany, setEditingDeliveryCompany] = useState<DeliveryCompany | null>(
    null
  );
  const [newDeliveryCompany, setNewDeliveryCompany] = useState({
    name: '',
    phone: '',
    address: '',
  });
  const [isSavingDeliveryCompany, setIsSavingDeliveryCompany] = useState(false);

  // 납품업체 목록 불러오기
  useEffect(() => {
    const fetchDeliveryCompanies = async () => {
      try {
        const response = await fetch('/api/company/delivery-companies');
        if (response.ok) {
          const data = await response.json();
          setDeliveryCompanies(data.deliveryCompanies || []);
        }
      } catch (error) {
        log.error('Error fetching delivery companies', error);
      } finally {
        setIsLoadingDeliveryCompanies(false);
      }
    };

    fetchDeliveryCompanies();
  }, []);

  // 납품업체 추가
  const handleAddDeliveryCompany = async () => {
    if (
      !newDeliveryCompany.name.trim() ||
      !newDeliveryCompany.phone.trim() ||
      !newDeliveryCompany.address.trim()
    ) {
      setError('납품업체명, 연락처, 주소를 모두 입력해주세요.');
      return;
    }

    setIsSavingDeliveryCompany(true);
    try {
      const response = await fetch('/api/company/delivery-companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newDeliveryCompany),
      });

      const result = await response.json();

      if (result.success) {
        setDeliveryCompanies((prev) => [result.deliveryCompany, ...prev]);
        // 폼 데이터 유지 (초기화하지 않음)
        setShowAddDeliveryCompany(false);
        setError(null);
      } else {
        setError(result.error || '납품업체 추가에 실패했습니다.');
      }
    } catch (error) {
      log.error('Error adding delivery company', error);
      setError('납품업체 추가 중 오류가 발생했습니다.');
    } finally {
      setIsSavingDeliveryCompany(false);
    }
  };

  // 납품업체 수정
  const handleUpdateDeliveryCompany = async () => {
    if (!editingDeliveryCompany) return;

    if (
      !editingDeliveryCompany.name.trim() ||
      !editingDeliveryCompany.phone.trim() ||
      !editingDeliveryCompany.address.trim()
    ) {
      setError('납품업체명, 연락처, 주소를 모두 입력해주세요.');
      return;
    }

    setIsSavingDeliveryCompany(true);
    try {
      const response = await fetch(`/api/company/delivery-companies/${editingDeliveryCompany.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editingDeliveryCompany.name,
          phone: editingDeliveryCompany.phone,
          address: editingDeliveryCompany.address,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setDeliveryCompanies((prev) =>
          prev.map((dc) => (dc.id === editingDeliveryCompany.id ? result.deliveryCompany : dc))
        );
        setEditingDeliveryCompany(null);
        setError(null);
      } else {
        setError(result.error || '납품업체 수정에 실패했습니다.');
      }
    } catch (error) {
      log.error('Error updating delivery company', error);
      setError('납품업체 수정 중 오류가 발생했습니다.');
    } finally {
      setIsSavingDeliveryCompany(false);
    }
  };

  // 납품업체 삭제
  const handleDeleteDeliveryCompany = async (id: number) => {
    if (!confirm('정말로 이 납품업체를 삭제하시겠습니까?')) {
      return;
    }

    try {
      const response = await fetch(`/api/company/delivery-companies/${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        setDeliveryCompanies((prev) => prev.filter((dc) => dc.id !== id));
        if (editingDeliveryCompany?.id === id) {
          setEditingDeliveryCompany(null);
        }
        setError(null);
      } else {
        setError(result.error || '납품업체 삭제에 실패했습니다.');
      }
    } catch (error) {
      log.error('Error deleting delivery company', error);
      setError('납품업체 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData(e.currentTarget);

      const response = await fetch('/api/company/profile', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          router.refresh();
        }, 1000);
      } else {
        setError(result.error || '정보 수정에 실패했습니다.');
      }
    } catch (err) {
      setError('정보 수정 중 오류가 발생했습니다.');
      log.error('Error updating company profile', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 성공 메시지 */}
      {success && (
        <div className={ALERT.success}>
          <p className={`text-sm ${TEXT_COLOR.success}`}>정보가 성공적으로 수정되었습니다.</p>
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className={ALERT.error}>
          <p className={`text-sm ${TEXT_COLOR.error}`}>{error}</p>
        </div>
      )}

      {/* 업체 정보 */}
      <div className={`${LAYOUT.card} ${LAYOUT.section}`}>
        <h2
          className={`text-lg font-semibold ${TEXT_COLOR.strong} mb-4 border-b ${BORDER_COLOR.default} pb-2`}
        >
          업체 정보
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
              업체명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="company_name"
              defaultValue={company.company_name}
              required
              className={FORM_INPUT}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
              사업자등록번호 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="business_registration_number"
              defaultValue={company.business_registration_number}
              required
              className={FORM_INPUT}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
              대표자명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="representative_name"
              defaultValue={company.representative_name}
              required
              className={FORM_INPUT}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>업태</label>
            <input
              type="text"
              name="business_type"
              defaultValue={company.business_type || ''}
              className={FORM_INPUT}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>업종</label>
            <input
              type="text"
              name="business_category"
              defaultValue={company.business_category || ''}
              className={FORM_INPUT}
            />
          </div>
          <div className="md:col-span-2">
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
              사업장 주소 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="business_address"
              defaultValue={company.business_address}
              required
              className={FORM_INPUT}
            />
          </div>
          <div className="md:col-span-2">
            <div className="space-y-3">
              {company.business_registration_file_url && selectedFiles.length === 0 ? (
                <div
                  className={`flex items-center justify-between p-4 ${BG_COLOR.light} rounded-lg border ${BORDER_COLOR.default}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FaPaperclip className={`${TEXT_COLOR.tertiary} flex-shrink-0 text-base`} />
                    <span className={`text-sm ${TEXT_COLOR.primary} truncate font-medium`}>
                      {company.business_registration_file_name || '파일명 없음'}
                    </span>
                  </div>
                  <DownloadButton
                    url={company.business_registration_file_url}
                    fileName={company.business_registration_file_name}
                  />
                </div>
              ) : null}
              <FileUpload
                name="business_registration_file"
                accept=".pdf,.jpg,.jpeg,.png"
                maxSize={10 * 1024 * 1024}
                disabled={isSubmitting}
                files={selectedFiles}
                onChange={setSelectedFiles}
                onError={setError}
                label="사업자등록증"
                helpText="새 파일을 업로드하면 기존 파일이 교체됩니다. PDF, JPG, PNG 파일만 업로드 가능합니다."
              />
            </div>
          </div>
        </div>
      </div>

      {/* 실무담당자 정보 */}
      <div className={`${LAYOUT.card} ${LAYOUT.section}`}>
        <h2
          className={`text-lg font-semibold ${TEXT_COLOR.strong} mb-4 border-b ${BORDER_COLOR.default} pb-2`}
        >
          실무담당자 정보
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
              담당자명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="manager_name"
              defaultValue={company.manager_name}
              required
              className={FORM_INPUT}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
              직책 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="manager_position"
              defaultValue={company.manager_position}
              required
              className={FORM_INPUT}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
              연락처 <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              name="manager_phone"
              defaultValue={company.manager_phone}
              required
              className={FORM_INPUT}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
              이메일 <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              name="manager_email"
              defaultValue={company.manager_email}
              required
              className={FORM_INPUT}
            />
          </div>
        </div>
      </div>

      {/* 회계담당자 정보 */}
      <div className={`${LAYOUT.card} ${LAYOUT.section}`}>
        <h2
          className={`text-lg font-semibold ${TEXT_COLOR.strong} mb-4 border-b ${BORDER_COLOR.default} pb-2`}
        >
          회계담당자 정보
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
              담당자명
            </label>
            <input
              type="text"
              name="accountant_name"
              defaultValue={company.accountant_name || ''}
              className={FORM_INPUT}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
              연락처
            </label>
            <input
              type="tel"
              name="accountant_phone"
              defaultValue={company.accountant_phone || ''}
              className={FORM_INPUT}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
              이메일 (세금계산서 발행용)
            </label>
            <input
              type="email"
              name="accountant_email"
              defaultValue={company.accountant_email || ''}
              className={FORM_INPUT}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
              팩스번호
            </label>
            <input
              type="tel"
              name="accountant_fax"
              defaultValue={company.accountant_fax || ''}
              className={FORM_INPUT}
            />
          </div>
        </div>
      </div>

      {/* 견적서 제공 방법 */}
      <div className={`${LAYOUT.card} ${LAYOUT.section}`}>
        <h2
          className={`text-lg font-semibold ${TEXT_COLOR.strong} mb-4 border-b ${BORDER_COLOR.default} pb-2`}
        >
          견적서 제공 방법
        </h2>
        <div className="space-y-2">
          <RadioButton
            name="quote_method"
            value="email"
            checked={quoteMethod === 'email'}
            onChange={(e) => setQuoteMethod(e.target.value)}
            label="이메일"
            showUnderline={false}
          />
          <RadioButton
            name="quote_method"
            value="fax"
            checked={quoteMethod === 'fax'}
            onChange={(e) => setQuoteMethod(e.target.value)}
            label="팩스"
            showUnderline={false}
          />
          <RadioButton
            name="quote_method"
            value="sms"
            checked={quoteMethod === 'sms'}
            onChange={(e) => setQuoteMethod(e.target.value)}
            label="SMS"
            showUnderline={false}
          />
        </div>
      </div>

      {/* 납품업체 관리 */}
      <div className={`${LAYOUT.card} ${LAYOUT.section}`}>
        <div
          className={`flex items-center justify-between mb-4 border-b ${BORDER_COLOR.default} pb-2`}
        >
          <h2 className={`text-lg font-semibold ${TEXT_COLOR.strong}`}>납품업체 관리</h2>
          {!showAddDeliveryCompany && !editingDeliveryCompany && (
            <button
              type="button"
              onClick={() => setShowAddDeliveryCompany(true)}
              className={`${BUTTON_STYLES.secondary} flex items-center gap-2`}
            >
              <FaPlus className="text-sm" />
              납품업체 추가
            </button>
          )}
        </div>

        {/* 납품업체 추가 폼 */}
        {showAddDeliveryCompany && (
          <div className={`mb-6 p-4 ${BG_COLOR.light} rounded-lg border ${BORDER_COLOR.default}`}>
            <h3 className={`text-sm font-semibold ${TEXT_COLOR.strong} mb-4`}>납품업체 추가</h3>
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
                  납품업체명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newDeliveryCompany.name}
                  onChange={(e) =>
                    setNewDeliveryCompany((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className={FORM_INPUT}
                  placeholder="납품업체명을 입력해주세요"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
                  연락처 <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={newDeliveryCompany.phone}
                  onChange={(e) =>
                    setNewDeliveryCompany((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className={FORM_INPUT}
                  placeholder="010-1234-5678"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
                  주소 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newDeliveryCompany.address}
                  onChange={(e) =>
                    setNewDeliveryCompany((prev) => ({ ...prev, address: e.target.value }))
                  }
                  className={FORM_INPUT}
                  placeholder="주소를 입력해주세요"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddDeliveryCompany}
                  disabled={isSavingDeliveryCompany}
                  className={`${BUTTON_STYLES.primary} flex items-center gap-2`}
                >
                  <FaSave className="text-sm" />
                  {isSavingDeliveryCompany ? '저장 중...' : '저장'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddDeliveryCompany(false);
                    setNewDeliveryCompany({ name: '', phone: '', address: '' });
                    setError(null);
                  }}
                  className={BUTTON_STYLES.secondary}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 납품업체 목록 */}
        {isLoadingDeliveryCompanies ? (
          <p className={`text-sm ${TEXT_COLOR.tertiary}`}>로딩 중...</p>
        ) : deliveryCompanies.length === 0 ? (
          <p className={`text-sm ${TEXT_COLOR.tertiary}`}>등록된 납품업체가 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {deliveryCompanies.map((dc) => (
              <div
                key={dc.id}
                className={`p-4 ${BG_COLOR.light} rounded-lg border ${BORDER_COLOR.default}`}
              >
                {editingDeliveryCompany?.id === dc.id ? (
                  <div className="space-y-4">
                    <h3 className={`text-sm font-semibold ${TEXT_COLOR.strong}`}>납품업체 수정</h3>
                    <div>
                      <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
                        납품업체명 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editingDeliveryCompany.name}
                        onChange={(e) =>
                          setEditingDeliveryCompany((prev) =>
                            prev ? { ...prev, name: e.target.value } : null
                          )
                        }
                        className={FORM_INPUT}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
                        연락처 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={editingDeliveryCompany.phone}
                        onChange={(e) =>
                          setEditingDeliveryCompany((prev) =>
                            prev ? { ...prev, phone: e.target.value } : null
                          )
                        }
                        className={FORM_INPUT}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
                        주소 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editingDeliveryCompany.address}
                        onChange={(e) =>
                          setEditingDeliveryCompany((prev) =>
                            prev ? { ...prev, address: e.target.value } : null
                          )
                        }
                        className={FORM_INPUT}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleUpdateDeliveryCompany}
                        disabled={isSavingDeliveryCompany}
                        className={`${BUTTON_STYLES.primary} flex items-center gap-2`}
                      >
                        <FaSave className="text-sm" />
                        {isSavingDeliveryCompany ? '저장 중...' : '저장'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDeliveryCompany(null);
                          setError(null);
                        }}
                        className={BUTTON_STYLES.secondary}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className={`text-xs ${TEXT_COLOR.tertiary}`}>납품업체명</label>
                          <p className={`text-sm font-medium ${TEXT_COLOR.strong} mt-1`}>
                            {dc.name}
                          </p>
                        </div>
                        <div>
                          <label className={`text-xs ${TEXT_COLOR.tertiary}`}>연락처</label>
                          <p className={`text-sm font-medium ${TEXT_COLOR.strong} mt-1`}>
                            <a href={`tel:${dc.phone}`} className="text-orange-500 hover:underline">
                              {dc.phone}
                            </a>
                          </p>
                        </div>
                        <div>
                          <label className={`text-xs ${TEXT_COLOR.tertiary}`}>주소</label>
                          <p className={`text-sm font-medium ${TEXT_COLOR.strong} mt-1`}>
                            {dc.address}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        type="button"
                        onClick={() => setEditingDeliveryCompany(dc)}
                        className={`p-2 text-orange-500 ${BG_COLOR.hoverOrange} rounded-lg transition-colors`}
                        title="수정"
                      >
                        <FaEdit className="text-sm" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDeliveryCompany(dc.id)}
                        className={`p-2 text-red-500 ${BG_COLOR.hoverError} rounded-lg transition-colors`}
                        title="삭제"
                      >
                        <FaTrash className="text-sm" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 비밀번호 변경 */}
      <div className={`${LAYOUT.card} ${LAYOUT.section}`}>
        <h2
          className={`text-lg font-semibold ${TEXT_COLOR.strong} mb-4 border-b ${BORDER_COLOR.default} pb-2`}
        >
          비밀번호 변경 (선택사항)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
              새 비밀번호
            </label>
            <input
              type="password"
              name="new_password"
              className={FORM_INPUT}
              placeholder="변경하지 않으려면 비워두세요"
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-2`}>
              새 비밀번호 확인
            </label>
            <input
              type="password"
              name="new_password_confirm"
              className={FORM_INPUT}
              placeholder="변경하지 않으려면 비워두세요"
            />
          </div>
        </div>
      </div>

      {/* 제출 버튼 */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className={`${BUTTON_STYLES.primary} flex items-center gap-2`}
        >
          <FaSave className="text-sm" />
          {isSubmitting ? '저장 중...' : '저장'}
        </button>
      </div>
    </form>
  );
}
