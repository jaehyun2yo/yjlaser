'use client';

import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { X, Download, FileText, ImageIcon, File } from 'lucide-react';
import { logger } from '@/lib/utils/logger';
import { prefixFilename } from '../_lib/downloadFiles';
import { ConfirmModal } from './ConfirmModal';

const filePanelLogger = logger.createLogger('WorkerFilePanel');

interface WebhardFile {
  id: string;
  name: string;
  size: number;
  mime_type: string | null;
  created_at: string;
}

interface WorkerFilePanelProps {
  folderId: string;
  companyName: string;
  onClose: () => void;
  inquiryNumber?: string | null;
  workNumber?: string | null;
  processStage?: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string | null, name: string) {
  if (mimeType?.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-green-500" />;
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'dxf' || ext === 'dwg' || ext === 'pdf')
    return <FileText className="w-4 h-4 text-blue-500" />;
  return <File className="w-4 h-4 text-gray-400" />;
}

export const WorkerFilePanel: FC<WorkerFilePanelProps> = ({
  folderId,
  companyName,
  onClose,
  inquiryNumber,
  workNumber,
  processStage,
}) => {
  const [files, setFiles] = useState<WebhardFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/worker/files?folderId=${encodeURIComponent(folderId)}`);
        const data = await response.json();

        if (!data.success) {
          setError(data.error || '파일 목록 조회 실패');
          return;
        }

        setFiles(data.files || []);
      } catch (err) {
        filePanelLogger.error('Failed to fetch files', err);
        setError('파일 목록을 불러올 수 없습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchFiles();
  }, [folderId]);

  const handleDownload = async (fileId: string, fileName: string) => {
    setDownloadingId(fileId);
    try {
      const response = await fetch(`/api/worker/files/${fileId}/download`);
      const data = await response.json();

      if (!data.success || !data.url) {
        setErrorModal(data.error || '다운로드 URL을 가져올 수 없습니다.');
        return;
      }

      const rawName = data.filename || fileName;
      const downloadName = prefixFilename(rawName, { inquiryNumber, workNumber, processStage });

      // blob 다운로드 (cross-origin에서도 파일명 제어 가능)
      const fileRes = await fetch(data.url);
      if (!fileRes.ok) {
        setErrorModal('파일을 가져올 수 없습니다.');
        return;
      }

      const blob = await fileRes.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      filePanelLogger.error('Download failed', err);
      setErrorModal('다운로드에 실패했습니다.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          <div>
            <h3 className="text-base font-bold text-gray-900">작업 파일</h3>
            <p className="text-xs text-gray-500">{companyName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 파일 목록 */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ED6C00]" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-500 text-sm">{error}</div>
          ) : files.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">폴더에 파일이 없습니다</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {files.map((file) => (
                <div key={file.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  {/* 파일 아이콘 */}
                  <div className="shrink-0">{getFileIcon(file.mime_type, file.name)}</div>

                  {/* 파일 정보 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                  </div>

                  {/* 다운로드 버튼 */}
                  <button
                    onClick={() => handleDownload(file.id, file.name)}
                    disabled={downloadingId === file.id}
                    className="shrink-0 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition disabled:opacity-50"
                    title="다운로드"
                  >
                    {downloadingId === file.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 하단 정보 */}
        {files.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-200 bg-gray-50 shrink-0">
            <p className="text-xs text-gray-500">총 {files.length}개 파일</p>
          </div>
        )}
      </div>
      <ConfirmModal
        isOpen={!!errorModal}
        title="오류"
        message={errorModal || ''}
        type="error"
        confirmText="확인"
        onConfirm={() => setErrorModal(null)}
        onCancel={() => setErrorModal(null)}
      />
    </div>
  );
};
