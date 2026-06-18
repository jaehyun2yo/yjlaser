'use client';

import { useState } from 'react';
import { logger } from '@/lib/utils/logger';

const componentLogger = logger.createLogger('DownloadButton');

interface DownloadButtonProps {
  url?: string;
  apiUrl?: string;
  fileName?: string | null;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
  size?: 'sm' | 'md';
  className?: string;
  children?: React.ReactNode;
  ariaLabel?: string;
  title?: string;
}

export function DownloadButton({
  url,
  apiUrl,
  fileName,
  onClick,
  size = 'sm',
  className = '',
  children,
  ariaLabel,
  title,
}: DownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  };

  const baseClass = `bg-white/90 hover:bg-white border border-gray-200 text-gray-600 hover:text-gray-800 shadow-sm rounded-lg font-medium transition-colors duration-200 whitespace-nowrap ${sizeClasses[size]} ${className}`;

  if (apiUrl) {
    const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (onClick) onClick(e);
      setLoading(true);
      try {
        const res = await fetch(apiUrl);
        if (!res.ok) {
          componentLogger.error('presigned URL 요청 실패', { status: res.status, apiUrl });
          return;
        }
        const data = (await res.json()) as { url: string; fileName: string };
        const downloadName = data.fileName || fileName || 'download';

        try {
          const fileRes = await fetch(data.url);
          if (!fileRes.ok) {
            componentLogger.error('파일 다운로드 실패', { status: fileRes.status, apiUrl });
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
          return;
        } catch (err) {
          componentLogger.error('blob 다운로드 오류, 직접 링크로 전환', { error: err, apiUrl });
        }

        const link = document.createElement('a');
        link.href = data.url;
        link.download = downloadName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        componentLogger.error('다운로드 요청 오류', { error: err, apiUrl });
      } finally {
        setLoading(false);
      }
    };

    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={baseClass}
        aria-label={ariaLabel}
        title={title}
      >
        {loading ? '...' : children || '다운로드'}
      </button>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={fileName || undefined}
      onClick={onClick as React.MouseEventHandler<HTMLAnchorElement> | undefined}
      className={baseClass}
      aria-label={ariaLabel}
      title={title}
    >
      {children || '다운로드'}
    </a>
  );
}
