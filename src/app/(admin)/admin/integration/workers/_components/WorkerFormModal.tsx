'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FC } from 'react';
import type { Worker } from '@/app/(admin)/admin/erp/_lib/types';
import {
  useCreateWorkerMutation,
  useUpdateWorkerMutation,
} from '@/app/(admin)/admin/erp/_lib/hooks';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { X, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { logger } from '@/lib/utils/logger';

const workerFormLogger = logger.createLogger('WorkerFormModal');

interface WorkerFormModalProps {
  worker: Worker | null; // null = 추가 모드
  onClose: () => void;
}

const ROLE_OPTIONS = [
  { value: 'field_worker', label: '현장작업자' },
  { value: 'office_worker', label: '사무실작업자' },
  { value: 'supervisor', label: '관리자' },
  { value: 'manager', label: '매니저' },
];

const WORKER_TYPE_OPTIONS = [
  { value: '', label: '미지정' },
  { value: 'field', label: '현장 (일반)' },
  { value: 'office', label: '사무실' },
  { value: 'laser', label: '레이저' },
  { value: 'cutting', label: '칼' },
  { value: 'creasing', label: '오시' },
];

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

export const WorkerFormModal: FC<WorkerFormModalProps> = ({ worker, onClose }) => {
  const isEdit = !!worker;
  const createMutation = useCreateWorkerMutation();
  const updateMutation = useUpdateWorkerMutation();

  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState('field_worker');
  const [workerType, setWorkerType] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [allowedIps, setAllowedIps] = useState<string[]>([]);
  const [newIp, setNewIp] = useState('');
  const [ipError, setIpError] = useState('');
  const [errors, setErrors] = useState<{ name?: string; pin?: string }>({});

  useEffect(() => {
    if (worker) {
      setName(worker.name);
      setRole(worker.role);
      setWorkerType(worker.worker_type || '');
      setAllowedIps(worker.allowed_ips || []);
      setPin('');
    }
  }, [worker]);

  const validate = useCallback(() => {
    const newErrors: { name?: string; pin?: string } = {};

    if (!name.trim()) {
      newErrors.name = '이름을 입력해주세요.';
    } else if (name.trim().length < 2) {
      newErrors.name = '이름은 2자 이상 입력해주세요.';
    } else if (name.trim().length > 100) {
      newErrors.name = '이름은 100자 이하로 입력해주세요.';
    }

    if (!isEdit && !pin) {
      newErrors.pin = 'PIN을 입력해주세요.';
    }
    if (pin && !/^\d{4}$/.test(pin)) {
      newErrors.pin = '4자리 숫자를 입력해주세요.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, pin, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      if (isEdit) {
        const updateData: {
          id: string;
          name?: string;
          role?: string;
          workerType?: string;
          pin?: string;
          allowedIps?: string[];
        } = {
          id: worker.id,
          name: name.trim(),
          role,
          workerType: workerType || undefined,
          allowedIps,
        };
        if (pin) {
          updateData.pin = pin;
        }
        await updateMutation.mutateAsync(updateData);
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          pin,
          role,
          workerType: workerType || undefined,
          allowedIps,
        });
      }
      onClose();
    } catch (err) {
      workerFormLogger.error(`Failed to ${isEdit ? 'update' : 'create'} worker`, err);
    }
  };

  const handlePinChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 4);
    setPin(cleaned);
    if (errors.pin) {
      setErrors((prev) => ({ ...prev, pin: undefined }));
    }
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (errors.name) {
      setErrors((prev) => ({ ...prev, name: undefined }));
    }
  };

  const handleAddIp = () => {
    const trimmedIp = newIp.trim();
    if (!trimmedIp) return;

    if (!IP_REGEX.test(trimmedIp)) {
      setIpError('올바른 IP 주소 형식이 아닙니다. (예: 192.168.0.1)');
      return;
    }

    if (allowedIps.includes(trimmedIp)) {
      setIpError('이미 등록된 IP 주소입니다.');
      return;
    }

    setAllowedIps((prev) => [...prev, trimmedIp]);
    setNewIp('');
    setIpError('');
  };

  const handleRemoveIp = (ip: string) => {
    setAllowedIps((prev) => prev.filter((i) => i !== ip));
  };

  const handleIpKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddIp();
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const mutationError = createMutation.error || updateMutation.error;

  const inputClass = `w-full px-3 py-2 border rounded-lg ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:ring-2 focus:ring-[#ED6C00] focus:border-transparent`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className={`${BG_COLOR.card} rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${BORDER_COLOR.default}`}>
          <h2 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>
            {isEdit ? '작업자 수정' : '새 작업자 등록'}
          </h2>
          <button
            onClick={onClose}
            className={`p-1 ${TEXT_COLOR.muted} ${TEXT_COLOR.hoverTertiary} rounded`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* 이름 */}
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
              이름 *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={`${inputClass} ${errors.name ? 'border-red-500 focus:ring-red-500' : ''}`}
              placeholder="작업자 이름"
              autoFocus
              maxLength={100}
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* PIN */}
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
              PIN {isEdit ? '(변경 시에만 입력)' : '*'}
            </label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => handlePinChange(e.target.value)}
                className={`${inputClass} pr-10 font-mono text-lg tracking-widest ${errors.pin ? 'border-red-500 focus:ring-red-500' : ''}`}
                placeholder="4자리 숫자"
                inputMode="numeric"
                maxLength={4}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 ${TEXT_COLOR.muted} ${TEXT_COLOR.hoverTertiary}`}
              >
                {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {errors.pin && <p className="mt-1 text-xs text-red-500">{errors.pin}</p>}
            <p className={`mt-1 text-xs ${TEXT_COLOR.muted}`}>
              ERP 로그인에 사용되는 4자리 숫자 비밀번호
            </p>
          </div>

          {/* 역할 */}
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>역할</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* 작업자 유형 */}
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
              작업자 유형
            </label>
            <select
              value={workerType}
              onChange={(e) => setWorkerType(e.target.value)}
              className={inputClass}
            >
              {WORKER_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className={`mt-1 text-xs ${TEXT_COLOR.muted}`}>
              로그인 시 기본 탭 선택에 사용됩니다
            </p>
          </div>

          {/* 허용 IP 관리 */}
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
              허용 IP 주소
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newIp}
                onChange={(e) => {
                  setNewIp(e.target.value);
                  setIpError('');
                }}
                onKeyDown={handleIpKeyDown}
                className={`${inputClass} flex-1 ${ipError ? 'border-red-500 focus:ring-red-500' : ''}`}
                placeholder="192.168.0.1"
              />
              <button
                type="button"
                onClick={handleAddIp}
                className="px-3 py-2 bg-[#ED6C00] text-white rounded-lg hover:bg-[#d15f00] transition flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {ipError && <p className="mt-1 text-xs text-red-500">{ipError}</p>}
            <p className={`mt-1 text-xs ${TEXT_COLOR.muted}`}>
              비워두면 모든 IP에서 접근 가능합니다. IP를 등록하면 해당 IP에서만 로그인할 수
              있습니다.
            </p>

            {/* IP 목록 */}
            {allowedIps.length > 0 && (
              <div className="mt-2 space-y-1">
                {allowedIps.map((ip) => (
                  <div
                    key={ip}
                    className={`flex items-center justify-between px-3 py-1.5 rounded-lg ${BG_COLOR.grayHalf} border ${BORDER_COLOR.default}`}
                  >
                    <span className={`text-sm font-mono ${TEXT_COLOR.primary}`}>{ip}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveIp(ip)}
                      className={`p-1 text-red-500 ${BG_COLOR.hoverError} rounded transition`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 에러 메시지 */}
          {mutationError && (
            <div className={`p-3 ${BG_COLOR.error} border ${BORDER_COLOR.error} rounded-lg`}>
              <p className={`text-sm ${TEXT_COLOR.error}`}>{mutationError.message}</p>
            </div>
          )}

          {/* Actions */}
          <div
            className={`flex items-center justify-end gap-2 pt-4 border-t ${BORDER_COLOR.default}`}
          >
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-sm ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted} rounded-lg transition`}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm bg-[#ED6C00] text-white hover:bg-[#d15f00] rounded-lg transition disabled:opacity-50"
            >
              {isPending ? (isEdit ? '수정중...' : '등록중...') : isEdit ? '수정' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
