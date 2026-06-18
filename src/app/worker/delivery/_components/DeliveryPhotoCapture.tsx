'use client';

import { useState, useRef } from 'react';
import { Camera, X, Upload } from 'lucide-react';
import { batchStartDeliveryWithProofFile } from '@/app/actions/contacts';
import { useBatchStartDelivery } from '@/app/worker/delivery/_lib/hooks';
import { optimizeImage } from '@/lib/utils/imageOptimizer';
import { logger } from '@/lib/utils/logger';
import { toast } from 'sonner';
import type { DeliveryProofFileMetadata } from '@/lib/api/nestjs-server-client';

const log = logger.createLogger('DeliveryPhotoCapture');

interface DeliveryPhotoCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  selectedContactIds: string[];
  onComplete: () => void;
}

export default function DeliveryPhotoCapture({
  isOpen,
  onClose,
  selectedContactIds,
  onComplete,
}: DeliveryPhotoCaptureProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startMutation = useBatchStartDelivery();

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setIsOptimizing(true);
    try {
      const optimized = await optimizeImage(file);
      setSelectedFile(optimized);
      const url = URL.createObjectURL(optimized);
      setPreview(url);
    } catch {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreview(url);
    } finally {
      setIsOptimizing(false);
    }
  };

  const executeMutation = async (imageUrl?: string, file?: DeliveryProofFileMetadata) => {
    await startMutation.mutateAsync({
      contactIds: selectedContactIds,
      deliveryProofImage: imageUrl,
      deliveryProofFile: file,
    });
  };

  const handleConfirm = async () => {
    if (!selectedFile || selectedContactIds.length === 0) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('contactIds', JSON.stringify(selectedContactIds));

      const result = await batchStartDeliveryWithProofFile(formData);
      if (!result.success) {
        toast.error(result.error || '납품 완료에 실패했습니다.');
        return;
      }

      const resultItems = result.results ?? [];
      const successCount =
        resultItems.length > 0
          ? resultItems.filter((item) => item.success).length
          : selectedContactIds.length;
      const failedCount = resultItems.filter((item) => !item.success).length;
      if (successCount === 0) {
        toast.error(resultItems[0]?.error || '납품 완료에 실패했습니다.');
        return;
      }
      if (failedCount > 0) {
        toast.warning(`${failedCount}건은 납품 완료 처리에 실패했습니다.`);
      }

      toast.success(`${successCount}건 납품이 완료되었습니다.`);
      handleCleanup();
      onComplete();
    } catch (error) {
      log.error('납품 완료 처리 실패:', error);
      toast.error(error instanceof Error ? error.message : '납품 완료에 실패했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSkipPhoto = async () => {
    if (selectedContactIds.length === 0) return;

    setIsUploading(true);
    try {
      await executeMutation();

      toast.success(`${selectedContactIds.length}건 납품이 완료되었습니다.`);
      handleCleanup();
      onComplete();
    } catch (error) {
      log.error('납품 완료 처리 실패:', error);
      toast.error(error instanceof Error ? error.message : '납품 완료에 실패했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCleanup = () => {
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setPreview(null);
    setSelectedFile(null);
  };

  const handleClose = () => {
    handleCleanup();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">납품 증빙 사진</h3>
          <button
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-sm text-gray-600 mb-4">
            {selectedContactIds.length}건의 납품 증빙 사진을 촬영하세요.
          </p>

          {preview ? (
            <div className="relative rounded-xl overflow-hidden border border-gray-200 mb-4">
              {isOptimizing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
                    <span className="text-xs text-white font-medium">사진 최적화 중...</span>
                  </div>
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="납품 증빙 사진 미리보기"
                className="w-full max-h-60 object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  handleCleanup();
                  fileInputRef.current?.click();
                }}
                disabled={isUploading}
                className="absolute bottom-2 right-2 px-3 py-1.5 bg-black/60 text-white text-xs font-medium rounded-lg hover:bg-black/80 transition-colors"
              >
                다시 촬영
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full aspect-video flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors mb-4"
            >
              <Camera className="w-10 h-10 text-gray-400" />
              <span className="text-sm text-gray-500 font-medium">사진 촬영 / 선택</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-gray-200 space-y-2">
          {selectedFile ? (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isUploading || isOptimizing}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors"
            >
              {isUploading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              사진과 함께 납품 완료
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleSkipPhoto}
            disabled={isUploading}
            className="w-full py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed rounded-xl transition-colors"
          >
            {isUploading && !selectedFile ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
                처리 중...
              </span>
            ) : (
              '사진 없이 납품 완료'
            )}
          </button>

          <button
            type="button"
            onClick={handleClose}
            disabled={isUploading}
            className="w-full py-3 text-sm font-medium text-gray-400 hover:text-gray-600 rounded-xl transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
