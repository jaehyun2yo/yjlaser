import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('ImageOptimizer');

interface OptimizeOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  outputType: 'image/webp' | 'image/jpeg';
}

const DEFAULT_OPTIONS: OptimizeOptions = {
  maxWidth: 1280,
  maxHeight: 1280,
  quality: 0.5,
  outputType: 'image/webp',
};

/**
 * Canvas API를 사용하여 이미지를 리사이즈하고 압축합니다.
 * WebP 1280px 품질 0.5 기본값 — 모바일 카메라 12MB → ~150-200KB
 */
export async function optimizeImage(file: File, options?: Partial<OptimizeOptions>): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;

    // Calculate new dimensions maintaining aspect ratio
    let newWidth = width;
    let newHeight = height;

    if (width > opts.maxWidth || height > opts.maxHeight) {
      const ratio = Math.min(opts.maxWidth / width, opts.maxHeight / height);
      newWidth = Math.round(width * ratio);
      newHeight = Math.round(height * ratio);
    }

    // Use OffscreenCanvas if available, fallback to regular canvas
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(newWidth, newHeight)
        : document.createElement('canvas');

    if (!(canvas instanceof OffscreenCanvas)) {
      canvas.width = newWidth;
      canvas.height = newHeight;
    }

    const ctx = canvas.getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D;
    if (!ctx) {
      log.warn('Canvas context 생성 실패, 원본 반환');
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
    bitmap.close();

    // Convert to blob
    const blob = await canvasToBlob(canvas, opts.outputType, opts.quality);

    const ext = opts.outputType === 'image/webp' ? '.webp' : '.jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const optimizedFile = new File([blob], `${baseName}${ext}`, {
      type: opts.outputType,
    });

    log.info(
      `이미지 최적화 완료: ${formatSize(file.size)} → ${formatSize(optimizedFile.size)} (${Math.round((1 - optimizedFile.size / file.size) * 100)}% 절감, ${width}x${height} → ${newWidth}x${newHeight})`
    );

    return optimizedFile;
  } catch (error) {
    log.error('이미지 최적화 실패, 원본 반환:', error);
    return file;
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality: number
): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type, quality });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob 실패'));
      },
      type,
      quality
    );
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
