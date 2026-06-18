'use client';

/**
 * FilePreviewTooltip
 * File hover preview tooltip component
 * - Image preview
 * - PDF preview (iframe)
 * - File info display
 */

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import type { FileDTO } from '@/lib/webhard-ui/types';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

// ============ Types ============

export interface FilePreviewTooltipProps {
  /** File to preview */
  file: FileDTO;
  /** Is tooltip visible */
  isVisible: boolean;
  /** Position */
  position: { x: number; y: number };
  /** Close handler */
  onClose: () => void;
  /** Preview URL fetcher (return null if not previewable) */
  getPreviewUrl?: (file: FileDTO) => Promise<string | null>;
  /** Check if file is previewable */
  canPreview?: (file: FileDTO) => boolean;
  /** Custom preview renderer */
  renderPreview?: (file: FileDTO, previewUrl: string | null) => React.ReactNode;
  /** Additional class name */
  className?: string;
  /** Labels */
  labels?: {
    loading?: string;
    noPreview?: string;
  };
}

// ============ Helpers ============

/**
 * Get file type from extension
 */
function getFileTypeByExtension(filename: string): 'image' | 'pdf' | 'other' {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return 'other';

  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
  const pdfExtensions = ['pdf'];

  if (imageExtensions.includes(ext)) return 'image';
  if (pdfExtensions.includes(ext)) return 'pdf';
  return 'other';
}

/**
 * Default preview check
 */
function defaultCanPreview(file: FileDTO): boolean {
  const fileType = getFileTypeByExtension(file.original_name);
  return fileType === 'image' || fileType === 'pdf';
}

/**
 * Format file size
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ============ Sub-components ============

/**
 * Image preview
 */
const ImagePreview = memo(function ImagePreview({
  url,
  filename,
  loadingLabel,
}: {
  url: string;
  filename: string;
  loadingLabel: string;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <div className={`relative w-full h-48 ${BG_COLOR.muted} rounded overflow-hidden`}>
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-orange-500 rounded-full" />
        </div>
      )}
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
          <span className="text-xs">Preview unavailable</span>
        </div>
      ) : (
        <img
          src={url}
          alt={filename}
          className={`w-full h-full object-contain transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setError(true);
          }}
        />
      )}
    </div>
  );
});

/**
 * PDF preview
 */
const PdfPreview = memo(function PdfPreview({
  url,
  loadingLabel,
}: {
  url: string;
  loadingLabel: string;
}) {
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className={`relative w-full h-48 ${BG_COLOR.muted} rounded overflow-hidden`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-orange-500 rounded-full" />
        </div>
      )}
      <iframe
        src={`${url}#toolbar=0&navpanes=0&scrollbar=0`}
        className={`w-full h-full border-0 transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        title="PDF Preview"
        onLoad={() => setIsLoading(false)}
      />
    </div>
  );
});

/**
 * File icon placeholder
 */
const FileIconPreview = memo(function FileIconPreview({
  file,
  noPreviewLabel,
}: {
  file: FileDTO;
  noPreviewLabel: string;
}) {
  const ext = file.original_name.split('.').pop()?.toUpperCase() || 'FILE';

  return (
    <div
      className={`w-full h-48 ${BG_COLOR.muted} rounded flex flex-col items-center justify-center`}
    >
      <div className="relative">
        <svg className="w-12 h-12 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
            clipRule="evenodd"
          />
        </svg>
        <span className="absolute -bottom-1 -right-1 bg-gray-500 text-white text-[8px] px-1 rounded font-bold">
          {ext}
        </span>
      </div>
      <p className={`mt-3 text-xs ${TEXT_COLOR.secondary}`}>{noPreviewLabel}</p>
    </div>
  );
});

// ============ Main Component ============

/**
 * FilePreviewTooltip component
 */
export function FilePreviewTooltip({
  file,
  isVisible,
  position,
  onClose,
  getPreviewUrl,
  canPreview = defaultCanPreview,
  renderPreview,
  className = '',
  labels = {},
}: FilePreviewTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { loading = 'Loading...', noPreview = 'No preview available' } = labels;

  const fileType = getFileTypeByExtension(file.original_name);
  const isPreviewable = canPreview(file);

  // Fetch preview URL
  useEffect(() => {
    if (!isVisible || !isPreviewable || !getPreviewUrl) {
      setPreviewUrl(null);
      return;
    }

    setIsLoading(true);
    getPreviewUrl(file)
      .then((url) => setPreviewUrl(url))
      .catch(() => setPreviewUrl(null))
      .finally(() => setIsLoading(false));
  }, [isVisible, file, isPreviewable, getPreviewUrl]);

  // Adjust tooltip position to stay within viewport
  useEffect(() => {
    if (!isVisible || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const rect = tooltip.getBoundingClientRect();
    const padding = 20;

    let newX = position.x + 20; // Display to the right of mouse
    let newY = position.y;

    // Right edge check
    if (newX + rect.width > window.innerWidth - padding) {
      newX = position.x - rect.width - 20; // Display to the left
    }

    // Bottom edge check
    if (newY + rect.height > window.innerHeight - padding) {
      newY = window.innerHeight - rect.height - padding;
    }

    // Top edge check
    if (newY < padding) {
      newY = padding;
    }

    setAdjustedPosition({ x: newX, y: newY });
  }, [isVisible, position]);

  // ESC to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isVisible) return null;

  // Render preview content
  const renderPreviewContent = () => {
    // Custom renderer
    if (renderPreview) {
      return renderPreview(file, previewUrl);
    }

    // Loading
    if (isLoading) {
      return (
        <div className={`w-full h-48 flex items-center justify-center ${BG_COLOR.muted} rounded`}>
          <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-orange-500 rounded-full" />
        </div>
      );
    }

    // No preview URL or not previewable
    if (!previewUrl || !isPreviewable) {
      return <FileIconPreview file={file} noPreviewLabel={noPreview} />;
    }

    // Image
    if (fileType === 'image') {
      return <ImagePreview url={previewUrl} filename={file.original_name} loadingLabel={loading} />;
    }

    // PDF
    if (fileType === 'pdf') {
      return <PdfPreview url={previewUrl} loadingLabel={loading} />;
    }

    // Other
    return <FileIconPreview file={file} noPreviewLabel={noPreview} />;
  };

  const content = (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 9999,
      }}
      className={`${BG_COLOR.page} rounded-lg shadow-2xl border ${BORDER_COLOR.default} overflow-hidden w-72 ${className}`}
      onMouseLeave={onClose}
    >
      {/* Preview area */}
      <div className="p-2">{renderPreviewContent()}</div>

      {/* File info */}
      <div className={`px-3 py-2 ${BG_COLOR.page} border-t ${BORDER_COLOR.default}`}>
        <p
          className={`text-sm font-medium ${TEXT_COLOR.primary} truncate`}
          title={file.original_name}
        >
          {file.original_name}
        </p>
        <div className="flex items-center justify-between mt-1">
          <span className={`text-xs ${TEXT_COLOR.secondary}`}>{formatSize(file.size)}</span>
          <span className={`text-xs ${TEXT_COLOR.muted}`}>
            {file.mime_type?.split('/').pop()?.toUpperCase() ||
              file.original_name.split('.').pop()?.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}

// ============ Hook ============

export interface UseFilePreviewReturn {
  /** Preview state */
  previewState: {
    file: FileDTO | null;
    isVisible: boolean;
    position: { x: number; y: number };
  };
  /** Mouse enter handler */
  handleMouseEnter: (file: FileDTO, e: React.MouseEvent) => void;
  /** Mouse move handler */
  handleMouseMove: (e: React.MouseEvent) => void;
  /** Mouse leave handler */
  handleMouseLeave: () => void;
  /** Close preview */
  closePreview: () => void;
}

/**
 * Hook to manage file preview tooltip
 */
export function useFilePreview(delay = 500): UseFilePreviewReturn {
  const [previewState, setPreviewState] = useState<{
    file: FileDTO | null;
    isVisible: boolean;
    position: { x: number; y: number };
  }>({
    file: null,
    isVisible: false,
    position: { x: 0, y: 0 },
  });

  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);
  const currentFileRef = useRef<FileDTO | null>(null);
  const lastPositionRef = useRef({ x: 0, y: 0 });

  const handleMouseEnter = useCallback(
    (file: FileDTO, e: React.MouseEvent) => {
      isHoveringRef.current = true;
      currentFileRef.current = file;
      lastPositionRef.current = { x: e.clientX, y: e.clientY };

      // Clear existing timer
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }

      // Show preview after delay
      hoverTimeoutRef.current = setTimeout(() => {
        if (isHoveringRef.current && currentFileRef.current) {
          setPreviewState({
            file: currentFileRef.current,
            isVisible: true,
            position: lastPositionRef.current,
          });
        }
      }, delay);
    },
    [delay]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Update position while hovering
      lastPositionRef.current = { x: e.clientX, y: e.clientY };

      // Update position if preview is visible
      if (previewState.isVisible) {
        setPreviewState((prev) => ({
          ...prev,
          position: { x: e.clientX, y: e.clientY },
        }));
      }
    },
    [previewState.isVisible]
  );

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
    currentFileRef.current = null;

    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    setPreviewState((prev) => ({
      ...prev,
      isVisible: false,
    }));
  }, []);

  const closePreview = useCallback(() => {
    setPreviewState((prev) => ({
      ...prev,
      isVisible: false,
    }));
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  return {
    previewState,
    handleMouseEnter,
    handleMouseMove,
    handleMouseLeave,
    closePreview,
  };
}

export default FilePreviewTooltip;
