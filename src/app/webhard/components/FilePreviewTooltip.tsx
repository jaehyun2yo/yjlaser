'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaFilePdf,
  FaFileImage,
  FaFileCode,
  FaFile,
  FaSpinner,
  FaExclamationTriangle,
} from 'react-icons/fa';
import { WebhardFile } from '@/types/webhard';
import { logger } from '@/lib/utils/logger';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

const log = logger.createLogger('FilePreviewTooltip');

interface FilePreviewTooltipProps {
  file: WebhardFile;
  isVisible: boolean;
  position: { x: number; y: number };
  onClose: () => void;
}

// 지원하는 파일 형식 및 MIME 타입 매핑
const PREVIEW_TYPES = {
  // 이미지 파일
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'],
  // PDF 파일
  pdf: ['application/pdf'],
  // 일러스트레이터/벡터 파일 (썸네일만 가능)
  vector: ['application/illustrator', 'application/postscript', 'image/x-eps'],
  // CAD 파일 (DXF, DWG 등) - 텍스트 기반 미리보기 또는 아이콘만
  cad: ['application/dxf', 'application/acad', 'image/vnd.dxf', 'image/x-dxf'],
  // 텍스트 파일
  text: ['text/plain', 'text/csv', 'application/json'],
} as const;

// 파일 확장자로 타입 판별
function getFileTypeByExtension(filename: string): keyof typeof PREVIEW_TYPES | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;

  const extensionMap: Record<string, keyof typeof PREVIEW_TYPES> = {
    // 이미지
    jpg: 'image',
    jpeg: 'image',
    png: 'image',
    gif: 'image',
    webp: 'image',
    svg: 'image',
    bmp: 'image',
    // PDF
    pdf: 'pdf',
    // 벡터/일러스트
    ai: 'vector',
    eps: 'vector',
    // CAD
    dxf: 'cad',
    dwg: 'cad',
    // 텍스트
    txt: 'text',
    csv: 'text',
    json: 'text',
  };

  return extensionMap[ext] || null;
}

// 미리보기 가능 여부 확인
export function canPreview(file: WebhardFile): boolean {
  const mimeType = file.mime_type?.toLowerCase();
  const fileType = getFileTypeByExtension(file.original_name);

  // MIME 타입으로 확인
  if (mimeType) {
    for (const types of Object.values(PREVIEW_TYPES)) {
      if (types.includes(mimeType as never)) return true;
    }
  }

  // 확장자로 확인
  return fileType !== null;
}

// 파일 아이콘 컴포넌트
function FileTypeIcon({ file }: { file: WebhardFile }) {
  const fileType = getFileTypeByExtension(file.original_name);

  switch (fileType) {
    case 'pdf':
      return <FaFilePdf className="text-red-500 text-4xl" />;
    case 'image':
      return <FaFileImage className="text-blue-500 text-4xl" />;
    case 'vector':
    case 'cad':
      return <FaFileCode className="text-orange-500 text-4xl" />;
    default:
      return <FaFile className="text-gray-500 text-4xl" />;
  }
}

// 이미지 미리보기 컴포넌트
function ImagePreview({ url, filename }: { url: string; filename: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <div className={`relative w-full h-48 ${BG_COLOR.muted} rounded overflow-hidden`}>
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <FaSpinner className="animate-spin text-gray-400 text-2xl" />
        </div>
      )}
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
          <FaExclamationTriangle className="text-2xl mb-2" />
          <span className="text-xs">미리보기 불가</span>
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
}

// PDF 미리보기 컴포넌트 (iframe 사용)
function PdfPreview({ url }: { url: string }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <div className={`relative w-full h-48 ${BG_COLOR.muted} rounded overflow-hidden`}>
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <FaSpinner className="animate-spin text-gray-400 text-2xl" />
        </div>
      )}
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
          <FaFilePdf className="text-4xl mb-2 text-red-400" />
          <span className="text-xs">PDF 미리보기</span>
        </div>
      ) : (
        <iframe
          src={`${url}#toolbar=0&navpanes=0&scrollbar=0`}
          className={`w-full h-full border-0 transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          title="PDF Preview"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setError(true);
          }}
        />
      )}
    </div>
  );
}

// pdfjs-dist 모듈 캐시 (한 번만 로드)
let cachedPdfjs: typeof import('pdfjs-dist') | null = null;
let pdfjsLoadPromise: Promise<typeof import('pdfjs-dist')> | null = null;

async function getPdfjs() {
  if (cachedPdfjs) return cachedPdfjs;
  if (pdfjsLoadPromise) return pdfjsLoadPromise;

  pdfjsLoadPromise = import('pdfjs-dist').then((module) => {
    // PDF.js worker 설정
    if (typeof window !== 'undefined') {
      module.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${module.version}/pdf.worker.min.js`;
    }
    cachedPdfjs = module;
    return module;
  });

  return pdfjsLoadPromise;
}

// dxf-parser 모듈 캐시 (한 번만 로드)
let cachedDxfParser: typeof import('dxf-parser') | null = null;
let dxfParserLoadPromise: Promise<typeof import('dxf-parser')> | null = null;

async function getDxfParser() {
  if (cachedDxfParser) return cachedDxfParser;
  if (dxfParserLoadPromise) return dxfParserLoadPromise;

  dxfParserLoadPromise = import('dxf-parser').then((module) => {
    cachedDxfParser = module;
    return module;
  });

  return dxfParserLoadPromise;
}

// DXF 파싱 결과 캐시 (fileId -> parsed data)
const dxfParseCache = new Map<string, DxfData>();
const DXF_CACHE_MAX_SIZE = 10;

function getCachedDxf(fileId: string): DxfData | undefined {
  return dxfParseCache.get(fileId);
}

function setCachedDxf(fileId: string, data: DxfData) {
  // LRU 방식으로 오래된 항목 제거
  if (dxfParseCache.size >= DXF_CACHE_MAX_SIZE) {
    const firstKey = dxfParseCache.keys().next().value;
    if (firstKey) dxfParseCache.delete(firstKey);
  }
  dxfParseCache.set(fileId, data);
}

// AutoCAD 표준 색상 인덱스 (ACI) - 주요 색상만
const ACI_COLORS: Record<number, string> = {
  0: '#FFFFFF', // ByBlock
  1: '#FF0000', // Red
  2: '#FFFF00', // Yellow
  3: '#00FF00', // Green
  4: '#00FFFF', // Cyan
  5: '#0000FF', // Blue
  6: '#FF00FF', // Magenta
  7: '#FFFFFF', // White (or Black depending on background)
  8: '#808080', // Dark Gray
  9: '#C0C0C0', // Light Gray
  10: '#FF0000',
  11: '#FF7F7F',
  12: '#CC0000',
  20: '#FF3F00',
  21: '#FF9F7F',
  30: '#FF7F00',
  31: '#FFBF7F',
  40: '#FFBF00',
  41: '#FFDF7F',
  50: '#FFFF00',
  51: '#FFFF7F',
  60: '#BFFF00',
  70: '#7FFF00',
  80: '#3FFF00',
  90: '#00FF00',
  100: '#00FF3F',
  110: '#00FF7F',
  120: '#00FFBF',
  130: '#00FFFF',
  140: '#00BFFF',
  150: '#007FFF',
  160: '#003FFF',
  170: '#0000FF',
  180: '#3F00FF',
  190: '#7F00FF',
  200: '#BF00FF',
  210: '#FF00FF',
  220: '#FF00BF',
  230: '#FF007F',
  240: '#FF003F',
  250: '#333333',
  251: '#464646',
  252: '#585858',
  253: '#6B6B6B',
  254: '#808080',
  255: '#FFFFFF',
  256: '#FFFFFF', // ByLayer - 기본 흰색
};

// DXF 색상 인덱스를 CSS 색상으로 변환
function getColorFromACI(colorIndex: number | undefined, layerColor?: number): string {
  // 색상 인덱스가 없거나 ByLayer(256)인 경우 레이어 색상 사용
  if (colorIndex === undefined || colorIndex === 256) {
    if (layerColor !== undefined && ACI_COLORS[layerColor]) {
      return ACI_COLORS[layerColor];
    }
    return '#FFFFFF'; // 기본 흰색
  }
  // ByBlock(0)인 경우 흰색
  if (colorIndex === 0) {
    return '#FFFFFF';
  }
  return ACI_COLORS[colorIndex] || '#FFFFFF';
}

// DXF 엔티티 타입 정의
interface DxfEntity {
  type: string;
  vertices?: Array<{ x: number; y: number; bulge?: number }>;
  center?: { x: number; y: number };
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  startPoint?: { x: number; y: number };
  endPoint?: { x: number; y: number };
  controlPoints?: Array<{ x: number; y: number }>;
  fitPoints?: Array<{ x: number; y: number }>;
  position?: { x: number; y: number };
  shape?: boolean;
  closed?: boolean;
  // 색상 관련
  colorIndex?: number;
  color?: number;
  layer?: string;
  // TEXT/MTEXT 관련
  text?: string;
  textHeight?: number;
  rotation?: number;
  // ELLIPSE 관련
  majorAxisEndPoint?: { x: number; y: number };
  axisRatio?: number;
  // INSERT (블록 참조) 관련
  name?: string;
  xScale?: number;
  yScale?: number;
  // SOLID/3DFACE 관련
  points?: Array<{ x: number; y: number }>;
}

interface DxfLayer {
  name: string;
  colorIndex?: number;
  color?: number;
}

interface DxfBlock {
  name: string;
  entities: DxfEntity[];
  position?: { x: number; y: number };
}

interface DxfData {
  entities: DxfEntity[];
  tables?: {
    layer?: {
      layers: Record<string, DxfLayer>;
    };
  };
  blocks?: Record<string, DxfBlock>;
}

// DXF를 Canvas 2D로 렌더링하는 함수
function renderDxfToCanvas(
  ctx: CanvasRenderingContext2D,
  dxf: DxfData,
  width: number,
  height: number
) {
  // 레이어 색상 맵 구성
  const layerColors: Record<string, number> = {};
  if (dxf.tables?.layer?.layers) {
    for (const [name, layer] of Object.entries(dxf.tables.layer.layers)) {
      layerColors[name] = layer.colorIndex ?? layer.color ?? 7;
    }
  }

  // 엔티티 색상 가져오기
  const getEntityColor = (entity: DxfEntity): string => {
    const colorIndex = entity.colorIndex ?? entity.color;
    const layerColor = entity.layer ? layerColors[entity.layer] : undefined;
    return getColorFromACI(colorIndex, layerColor);
  };

  // 모든 엔티티의 바운딩 박스 계산
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  const updateBounds = (x: number, y: number) => {
    if (isFinite(x) && isFinite(y)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  };

  // 엔티티의 바운딩 박스 계산 (재귀적으로 블록도 처리)
  const calculateEntityBounds = (entity: DxfEntity) => {
    switch (entity.type) {
      case 'LINE':
        if (entity.vertices && entity.vertices.length >= 2) {
          updateBounds(entity.vertices[0].x, entity.vertices[0].y);
          updateBounds(entity.vertices[1].x, entity.vertices[1].y);
        }
        break;
      case 'CIRCLE':
        if (entity.center && entity.radius) {
          updateBounds(entity.center.x - entity.radius, entity.center.y - entity.radius);
          updateBounds(entity.center.x + entity.radius, entity.center.y + entity.radius);
        }
        break;
      case 'ARC':
        if (entity.center && entity.radius) {
          updateBounds(entity.center.x - entity.radius, entity.center.y - entity.radius);
          updateBounds(entity.center.x + entity.radius, entity.center.y + entity.radius);
        }
        break;
      case 'ELLIPSE':
        if (entity.center && entity.majorAxisEndPoint) {
          const majorLen = Math.sqrt(
            entity.majorAxisEndPoint.x ** 2 + entity.majorAxisEndPoint.y ** 2
          );
          updateBounds(entity.center.x - majorLen, entity.center.y - majorLen);
          updateBounds(entity.center.x + majorLen, entity.center.y + majorLen);
        }
        break;
      case 'LWPOLYLINE':
      case 'POLYLINE':
        if (entity.vertices) {
          for (const v of entity.vertices) {
            updateBounds(v.x, v.y);
          }
        }
        break;
      case 'SPLINE':
        if (entity.controlPoints) {
          for (const p of entity.controlPoints) {
            updateBounds(p.x, p.y);
          }
        }
        if (entity.fitPoints) {
          for (const p of entity.fitPoints) {
            updateBounds(p.x, p.y);
          }
        }
        break;
      case 'POINT':
        if (entity.position) {
          updateBounds(entity.position.x, entity.position.y);
        }
        break;
      case 'TEXT':
      case 'MTEXT':
        if (entity.position) {
          updateBounds(entity.position.x, entity.position.y);
          // 텍스트 크기 대략적 계산
          const textHeight = entity.textHeight || 10;
          const textWidth = (entity.text?.length || 5) * textHeight * 0.6;
          updateBounds(entity.position.x + textWidth, entity.position.y + textHeight);
        }
        break;
      case 'INSERT':
        if (entity.position) {
          updateBounds(entity.position.x, entity.position.y);
          // 블록 내부 엔티티도 처리
          if (entity.name && dxf.blocks?.[entity.name]) {
            const block = dxf.blocks[entity.name];
            for (const blockEntity of block.entities) {
              calculateEntityBounds(blockEntity);
            }
          }
        }
        break;
      case 'SOLID':
      case '3DFACE':
        if (entity.points) {
          for (const p of entity.points) {
            updateBounds(p.x, p.y);
          }
        }
        break;
      case 'DIMENSION':
        // DIMENSION은 복잡하므로 기본 위치만
        if (entity.position) {
          updateBounds(entity.position.x, entity.position.y);
        }
        break;
    }
  };

  // 바운딩 박스 계산
  for (const entity of dxf.entities) {
    calculateEntityBounds(entity);
  }

  // 바운딩 박스가 유효하지 않으면 기본값
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    minX = 0;
    minY = 0;
    maxX = 100;
    maxY = 100;
  }

  // 스케일 및 오프셋 계산
  const padding = 15;
  const dxfWidth = maxX - minX || 1;
  const dxfHeight = maxY - minY || 1;
  const scaleX = (width - padding * 2) / dxfWidth;
  const scaleY = (height - padding * 2) / dxfHeight;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = padding + (width - padding * 2 - dxfWidth * scale) / 2;
  const offsetY = padding + (height - padding * 2 - dxfHeight * scale) / 2;

  // 좌표 변환 함수 (DXF는 Y축이 위로 향함)
  const transformX = (x: number) => offsetX + (x - minX) * scale;
  const transformY = (y: number) => height - (offsetY + (y - minY) * scale);

  // 캔버스 초기화 (어두운 배경)
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);

  // 엔티티 그리기
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 엔티티 렌더링 함수
  const renderEntity = (
    entity: DxfEntity,
    offsetXPos = 0,
    offsetYPos = 0,
    scaleX = 1,
    scaleY = 1
  ) => {
    const color = getEntityColor(entity);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    ctx.beginPath();

    switch (entity.type) {
      case 'LINE':
        if (entity.vertices && entity.vertices.length >= 2) {
          const x1 = entity.vertices[0].x * scaleX + offsetXPos;
          const y1 = entity.vertices[0].y * scaleY + offsetYPos;
          const x2 = entity.vertices[1].x * scaleX + offsetXPos;
          const y2 = entity.vertices[1].y * scaleY + offsetYPos;
          ctx.moveTo(transformX(x1), transformY(y1));
          ctx.lineTo(transformX(x2), transformY(y2));
        }
        break;

      case 'CIRCLE':
        if (entity.center && entity.radius) {
          const cx = entity.center.x * scaleX + offsetXPos;
          const cy = entity.center.y * scaleY + offsetYPos;
          ctx.arc(
            transformX(cx),
            transformY(cy),
            entity.radius * scale * Math.abs(scaleX),
            0,
            Math.PI * 2
          );
        }
        break;

      case 'ARC':
        if (entity.center && entity.radius) {
          const cx = entity.center.x * scaleX + offsetXPos;
          const cy = entity.center.y * scaleY + offsetYPos;

          // dxf-parser는 각도를 라디안으로 반환함
          let startAngle = entity.startAngle || 0;
          let endAngle = entity.endAngle || Math.PI * 2;

          // 각도가 도(degree) 단위인지 라디안인지 자동 감지
          // 라디안은 일반적으로 2π(≈6.28) 이하, 도는 360 이하
          // 하지만 6.28 < x < 360 범위에서 모호할 수 있으므로
          // 7보다 크면 도(degree)로 간주
          if (Math.abs(startAngle) > 7 || Math.abs(endAngle) > 7) {
            // 도(degree)를 라디안으로 변환
            startAngle = (startAngle * Math.PI) / 180;
            endAngle = (endAngle * Math.PI) / 180;
          }

          // Y축 반전으로 인해 각도 부호 반전
          // DXF는 반시계방향으로 호를 그림
          ctx.arc(
            transformX(cx),
            transformY(cy),
            entity.radius * scale * Math.abs(scaleX),
            -startAngle,
            -endAngle,
            true // 반시계 방향 (DXF 표준)
          );
        }
        break;

      case 'ELLIPSE':
        if (entity.center && entity.majorAxisEndPoint) {
          const cx = entity.center.x * scaleX + offsetXPos;
          const cy = entity.center.y * scaleY + offsetYPos;
          const majorLen = Math.sqrt(
            entity.majorAxisEndPoint.x ** 2 + entity.majorAxisEndPoint.y ** 2
          );
          const minorLen = majorLen * (entity.axisRatio || 0.5);
          const rotation = Math.atan2(entity.majorAxisEndPoint.y, entity.majorAxisEndPoint.x);
          const startAngle = entity.startAngle || 0;
          const endAngle = entity.endAngle || Math.PI * 2;
          ctx.ellipse(
            transformX(cx),
            transformY(cy),
            majorLen * scale * Math.abs(scaleX),
            minorLen * scale * Math.abs(scaleX),
            -rotation,
            -endAngle,
            -startAngle
          );
        }
        break;

      case 'LWPOLYLINE':
      case 'POLYLINE':
        if (entity.vertices && entity.vertices.length > 0) {
          const vx0 = entity.vertices[0].x * scaleX + offsetXPos;
          const vy0 = entity.vertices[0].y * scaleY + offsetYPos;
          ctx.moveTo(transformX(vx0), transformY(vy0));

          for (let i = 0; i < entity.vertices.length; i++) {
            const v = entity.vertices[i];
            const nextIdx = (i + 1) % entity.vertices.length;
            const nextV = entity.vertices[nextIdx];

            // bulge가 있으면 호로 연결
            if (
              v.bulge &&
              v.bulge !== 0 &&
              (i < entity.vertices.length - 1 || entity.closed || entity.shape)
            ) {
              const vx = v.x * scaleX + offsetXPos;
              const vy = v.y * scaleY + offsetYPos;
              const nvx = nextV.x * scaleX + offsetXPos;
              const nvy = nextV.y * scaleY + offsetYPos;

              // bulge를 이용한 호 계산
              const bulge = v.bulge;
              const dx = nvx - vx;
              const dy = nvy - vy;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const sagitta = (Math.abs(bulge) * dist) / 2;
              const radius = (dist / 2 / Math.abs(bulge) + sagitta) / 2;

              // 중심점 계산
              const midX = (vx + nvx) / 2;
              const midY = (vy + nvy) / 2;
              const perpX = -dy / dist;
              const perpY = dx / dist;
              const h = Math.sqrt(Math.max(0, radius * radius - (dist / 2) ** 2));
              const sign = bulge > 0 ? 1 : -1;
              const arcCx = midX + perpX * h * sign;
              const arcCy = midY + perpY * h * sign;

              const startAngle = Math.atan2(vy - arcCy, vx - arcCx);
              const endAngle = Math.atan2(nvy - arcCy, nvx - arcCx);

              ctx.arc(
                transformX(arcCx),
                transformY(arcCy),
                radius * scale,
                -startAngle,
                -endAngle,
                bulge < 0
              );
            } else if (i < entity.vertices.length - 1) {
              const nvx = nextV.x * scaleX + offsetXPos;
              const nvy = nextV.y * scaleY + offsetYPos;
              ctx.lineTo(transformX(nvx), transformY(nvy));
            }
          }
          if (entity.shape || entity.closed) {
            ctx.closePath();
          }
        }
        break;

      case 'SPLINE':
        {
          const points = entity.fitPoints || entity.controlPoints || [];
          if (points.length > 0) {
            const px0 = points[0].x * scaleX + offsetXPos;
            const py0 = points[0].y * scaleY + offsetYPos;
            ctx.moveTo(transformX(px0), transformY(py0));
            for (let i = 1; i < points.length; i++) {
              const px = points[i].x * scaleX + offsetXPos;
              const py = points[i].y * scaleY + offsetYPos;
              ctx.lineTo(transformX(px), transformY(py));
            }
          }
        }
        break;

      case 'POINT':
        if (entity.position) {
          const px = entity.position.x * scaleX + offsetXPos;
          const py = entity.position.y * scaleY + offsetYPos;
          ctx.arc(transformX(px), transformY(py), 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case 'TEXT':
      case 'MTEXT':
        if (entity.position && entity.text) {
          const px = entity.position.x * scaleX + offsetXPos;
          const py = entity.position.y * scaleY + offsetYPos;
          const fontSize = Math.max(8, (entity.textHeight || 10) * scale * Math.abs(scaleX));
          ctx.font = `${fontSize}px Arial, sans-serif`;
          ctx.save();
          ctx.translate(transformX(px), transformY(py));
          if (entity.rotation) {
            ctx.rotate((-entity.rotation * Math.PI) / 180);
          }
          // MTEXT 포맷 문자 제거
          const cleanText = entity.text
            .replace(/\\[A-Za-z][^;]*;/g, '')
            .replace(/\{|\}/g, '')
            .replace(/\\P/g, '\n')
            .trim();
          ctx.fillText(cleanText.split('\n')[0] || '', 0, 0);
          ctx.restore();
        }
        return; // TEXT는 stroke 안함

      case 'INSERT':
        if (entity.position && entity.name && dxf.blocks?.[entity.name]) {
          const block = dxf.blocks[entity.name];
          const insertX = entity.position.x * scaleX + offsetXPos;
          const insertY = entity.position.y * scaleY + offsetYPos;
          const blockScaleX = (entity.xScale || 1) * scaleX;
          const blockScaleY = (entity.yScale || 1) * scaleY;

          for (const blockEntity of block.entities) {
            renderEntity(blockEntity, insertX, insertY, blockScaleX, blockScaleY);
          }
        }
        return; // INSERT는 stroke 안함

      case 'SOLID':
      case '3DFACE':
        if (entity.points && entity.points.length >= 3) {
          const p0x = entity.points[0].x * scaleX + offsetXPos;
          const p0y = entity.points[0].y * scaleY + offsetYPos;
          ctx.moveTo(transformX(p0x), transformY(p0y));
          for (let i = 1; i < entity.points.length; i++) {
            const px = entity.points[i].x * scaleX + offsetXPos;
            const py = entity.points[i].y * scaleY + offsetYPos;
            ctx.lineTo(transformX(px), transformY(py));
          }
          ctx.closePath();
          ctx.globalAlpha = 0.3;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        break;

      case 'HATCH':
        // HATCH는 복잡하므로 외곽선만
        if (entity.vertices && entity.vertices.length > 0) {
          const hx0 = entity.vertices[0].x * scaleX + offsetXPos;
          const hy0 = entity.vertices[0].y * scaleY + offsetYPos;
          ctx.moveTo(transformX(hx0), transformY(hy0));
          for (let i = 1; i < entity.vertices.length; i++) {
            const hx = entity.vertices[i].x * scaleX + offsetXPos;
            const hy = entity.vertices[i].y * scaleY + offsetYPos;
            ctx.lineTo(transformX(hx), transformY(hy));
          }
          ctx.closePath();
        }
        break;

      default:
        // 지원하지 않는 엔티티는 무시
        return;
    }

    ctx.stroke();
  };

  // 모든 엔티티 렌더링
  for (const entity of dxf.entities) {
    renderEntity(entity);
  }
}

// DXF 파일 미리보기 컴포넌트 (dxf-parser + Canvas 2D 사용)
function DxfPreview({ fileId, filename }: { fileId: string; filename: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingPhase, setLoadingPhase] = useState<string>('초기화');
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!canvasRef.current) return;

    mountedRef.current = true;

    // 이전 요청 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setError('Canvas 2D 컨텍스트를 생성할 수 없습니다');
      setIsLoading(false);
      return;
    }

    const loadAndRenderDxf = async () => {
      try {
        // 캐시된 파싱 결과가 있으면 바로 렌더링
        const cachedDxf = getCachedDxf(fileId);
        if (cachedDxf) {
          setLoadingPhase('렌더링');
          renderDxfToCanvas(ctx, cachedDxf, canvas.width, canvas.height);
          setIsLoading(false);
          setError(null);
          return;
        }

        // dxf-parser 미리 로드 시작 (병렬 처리)
        const parserPromise = getDxfParser();

        setLoadingPhase('파일 다운로드');

        // DXF 미리보기 전용 API 사용 (다운로드 상태 업데이트 안함)
        const response = await fetch(`/api/webhard/preview-dxf?fileId=${fileId}`, {
          credentials: 'include',
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`다운로드 실패: ${response.status} ${errorText}`);
        }

        if (!mountedRef.current) return;

        setLoadingPhase('DXF 파싱');

        // DXF 텍스트 읽기 & 파서 로딩 병렬 처리
        const [dxfText, DxfParserModule] = await Promise.all([response.text(), parserPromise]);

        if (!dxfText || dxfText.length === 0) {
          throw new Error('빈 파일입니다');
        }

        const DxfParser = DxfParserModule.default || DxfParserModule;

        if (!mountedRef.current) return;

        // DXF 파싱
        const parser = new DxfParser();
        const dxf = parser.parseSync(dxfText) as DxfData | null;

        if (!dxf || !dxf.entities) {
          throw new Error('DXF 파싱 실패 - 유효하지 않은 DXF 형식');
        }

        // 캐시에 저장
        setCachedDxf(fileId, dxf);

        if (!mountedRef.current) return;

        setLoadingPhase('렌더링');

        // Canvas에 렌더링
        renderDxfToCanvas(ctx, dxf, canvas.width, canvas.height);

        setIsLoading(false);
        setError(null);
      } catch (err) {
        // AbortError는 무시
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'DXF 미리보기 실패');
          setIsLoading(false);
        }
      }
    };

    loadAndRenderDxf();

    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fileId]);

  if (error) {
    return (
      <div
        className={`w-full h-48 ${BG_COLOR.gradientFilePreview} rounded flex flex-col items-center justify-center p-2`}
      >
        <FaFileCode className="text-4xl text-orange-500 mb-2" />
        <p className={`text-xs ${TEXT_COLOR.muted} text-center`}>DXF 미리보기 불가</p>
        <p
          className={`text-[10px] ${TEXT_COLOR.disabled} mt-1 max-w-full text-center break-words line-clamp-2`}
        >
          {error}
        </p>
        <p className={`text-[10px] ${TEXT_COLOR.disabled} mt-1 truncate max-w-full`}>{filename}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-48 bg-[#1a1a2e] rounded overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e]">
          <div className="flex flex-col items-center">
            <FaSpinner className="animate-spin text-orange-500 text-2xl mb-2" />
            <span className="text-xs text-gray-400">{loadingPhase}...</span>
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={260}
        height={180}
        className={`w-full h-full ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
      />
    </div>
  );
}

// CAD/Vector 파일 미리보기 (아이콘 + 파일 정보) - DWG, EPS 등
function CadVectorPreview({ file }: { file: WebhardFile }) {
  const ext = file.original_name.split('.').pop()?.toUpperCase() || 'FILE';

  return (
    <div
      className={`w-full h-48 ${BG_COLOR.gradientFilePreview} rounded flex flex-col items-center justify-center`}
    >
      <div className="relative">
        <FaFileCode className="text-5xl text-orange-500" />
        <span className="absolute -bottom-1 -right-1 bg-orange-500 text-white text-[8px] px-1 rounded font-bold">
          {ext}
        </span>
      </div>
      <p className={`mt-3 text-xs ${TEXT_COLOR.muted}`}>CAD/벡터 파일</p>
      <p className={`text-[10px] ${TEXT_COLOR.disabled} mt-1`}>더블클릭하여 다운로드</p>
    </div>
  );
}

// AI (Adobe Illustrator) 파일 미리보기 컴포넌트 (PDF.js 사용)
function AiPreview({ fileId, filename }: { fileId: string; filename: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingPhase, setLoadingPhase] = useState<string>('초기화');
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!canvasRef.current) return;

    mountedRef.current = true;

    // 이전 요청 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      setError('Canvas 2D 컨텍스트를 생성할 수 없습니다');
      setIsLoading(false);
      return;
    }

    const loadAndRenderAi = async () => {
      try {
        // PDF.js 미리 로드 시작 (병렬 처리)
        const pdfjsPromise = getPdfjs();

        setLoadingPhase('파일 다운로드');

        // AI 미리보기 전용 API 사용
        const response = await fetch(`/api/webhard/preview-ai?fileId=${fileId}`, {
          credentials: 'include',
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          // PDF 호환이 아닌 경우 특별 처리
          if (response.status === 422) {
            const errorData = await response.json();
            if (errorData.error === 'AI_NOT_PDF_COMPATIBLE') {
              throw new Error('PDF 호환 모드로 저장되지 않은 AI 파일입니다');
            }
          }
          throw new Error(`다운로드 실패: ${response.status}`);
        }

        if (!mountedRef.current) return;

        setLoadingPhase('PDF 렌더링');

        // PDF.js 로딩 완료 대기
        const pdfjs = await pdfjsPromise;

        // ArrayBuffer로 읽기
        const arrayBuffer = await response.arrayBuffer();

        if (!mountedRef.current) return;

        // PDF 문서 로드
        const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        if (!mountedRef.current) return;

        // 첫 페이지 가져오기
        const page = await pdf.getPage(1);

        // 캔버스 크기에 맞게 스케일 조정
        const viewport = page.getViewport({ scale: 1 });
        const scale =
          Math.min(canvas.width / viewport.width, canvas.height / viewport.height) * 0.95; // 약간의 여백

        const scaledViewport = page.getViewport({ scale });

        // 캔버스 중앙에 배치
        const offsetX = (canvas.width - scaledViewport.width) / 2;
        const offsetY = (canvas.height - scaledViewport.height) / 2;

        // 캔버스 초기화 (흰색 배경)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 변환 행렬 적용하여 중앙 배치
        ctx.save();
        ctx.translate(offsetX, offsetY);

        // 렌더링 - pdfjs-dist의 RenderParameters 타입 요구사항 충족
        await page.render({
          canvasContext: ctx,
          viewport: scaledViewport,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).promise;
        ctx.restore();

        setIsLoading(false);
        setError(null);
      } catch (err) {
        // AbortError는 무시
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : 'AI 미리보기 실패');
          setIsLoading(false);
        }
      }
    };

    loadAndRenderAi();

    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fileId]);

  if (error) {
    return (
      <div
        className={`w-full h-48 ${BG_COLOR.gradientFilePreview} rounded flex flex-col items-center justify-center p-2`}
      >
        <FaFileCode className="text-4xl text-orange-500 mb-2" />
        <p className={`text-xs ${TEXT_COLOR.muted} text-center`}>AI 미리보기 불가</p>
        <p
          className={`text-[10px] ${TEXT_COLOR.disabled} mt-1 max-w-full text-center break-words line-clamp-2`}
        >
          {error}
        </p>
        <p className={`text-[10px] ${TEXT_COLOR.disabled} mt-1 truncate max-w-full`}>{filename}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-48 bg-white rounded overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="flex flex-col items-center">
            <FaSpinner className="animate-spin text-orange-500 text-2xl mb-2" />
            <span className="text-xs text-gray-400">{loadingPhase}...</span>
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={260}
        height={180}
        className={`w-full h-full ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
      />
    </div>
  );
}

// 텍스트 미리보기 컴포넌트
function TextPreview({ url }: { url: string }) {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchText = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        const text = await response.text();
        setContent(text.slice(0, 500)); // 처음 500자만
        setIsLoading(false);
      } catch {
        setError(true);
        setIsLoading(false);
      }
    };
    fetchText();
  }, [url]);

  return (
    <div className={`w-full h-48 ${BG_COLOR.muted} rounded overflow-hidden p-2`}>
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <FaSpinner className="animate-spin text-gray-400 text-2xl" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-full text-gray-400">
          <FaExclamationTriangle className="text-2xl mb-2" />
          <span className="text-xs">미리보기 불가</span>
        </div>
      ) : (
        <pre
          className={`text-xs ${TEXT_COLOR.secondary} whitespace-pre-wrap overflow-hidden h-full font-mono`}
        >
          {content}
          {content.length >= 500 && '...'}
        </pre>
      )}
    </div>
  );
}

// 메인 미리보기 툴팁 컴포넌트
export function FilePreviewTooltip({
  file,
  isVisible,
  position,
  onClose,
}: FilePreviewTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  const fileType = getFileTypeByExtension(file.original_name);

  // 미리보기 URL 가져오기
  useEffect(() => {
    if (!isVisible || !canPreview(file)) return;

    const fetchPreviewUrl = async () => {
      setIsLoading(true);
      try {
        // 다운로드 API를 통해 파일 URL 가져오기
        const response = await fetch(`/api/webhard/download?fileId=${file.id}&preview=true`);
        if (!response.ok) throw new Error('Failed to get preview URL');

        const data = await response.json();
        setPreviewUrl(data.url);
      } catch (error) {
        log.error('Failed to load preview:', error);
        setPreviewUrl(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreviewUrl();
  }, [isVisible, file]);

  // 툴팁 위치 조정 (화면 밖으로 나가지 않도록)
  useEffect(() => {
    if (!isVisible || !tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const rect = tooltip.getBoundingClientRect();
    const padding = 20;

    let newX = position.x + 20; // 마우스 오른쪽에 표시
    let newY = position.y;

    // 오른쪽 경계 체크
    if (newX + rect.width > window.innerWidth - padding) {
      newX = position.x - rect.width - 20; // 왼쪽에 표시
    }

    // 하단 경계 체크
    if (newY + rect.height > window.innerHeight - padding) {
      newY = window.innerHeight - rect.height - padding;
    }

    // 상단 경계 체크
    if (newY < padding) {
      newY = padding;
    }

    setAdjustedPosition({ x: newX, y: newY });
  }, [isVisible, position]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 미리보기 콘텐츠 렌더링
  const renderPreviewContent = useCallback(() => {
    if (isLoading) {
      return (
        <div className={`w-full h-48 flex items-center justify-center ${BG_COLOR.muted} rounded`}>
          <FaSpinner className="animate-spin text-gray-400 text-2xl" />
        </div>
      );
    }

    if (!previewUrl) {
      return (
        <div
          className={`w-full h-48 flex flex-col items-center justify-center ${BG_COLOR.muted} rounded`}
        >
          <FileTypeIcon file={file} />
          <span className="mt-2 text-xs text-gray-400">미리보기 불가</span>
        </div>
      );
    }

    // 확장자 기반 특수 처리
    const ext = file.original_name.split('.').pop()?.toLowerCase();

    // DXF 파일인 경우 DxfPreview 사용 (fileId를 사용하여 API를 통해 다운로드)
    if (ext === 'dxf') {
      return <DxfPreview fileId={file.id} filename={file.original_name} />;
    }

    // AI 파일인 경우 AiPreview 사용 (PDF.js로 렌더링)
    if (ext === 'ai') {
      return <AiPreview fileId={file.id} filename={file.original_name} />;
    }

    switch (fileType) {
      case 'image':
        return <ImagePreview url={previewUrl} filename={file.original_name} />;
      case 'pdf':
        return <PdfPreview url={previewUrl} />;
      case 'vector':
      case 'cad':
        // DWG, EPS 등 다른 CAD/벡터 파일 (AI는 위에서 이미 처리됨)
        return <CadVectorPreview file={file} />;
      case 'text':
        return <TextPreview url={previewUrl} />;
      default:
        return (
          <div
            className={`w-full h-48 flex flex-col items-center justify-center ${BG_COLOR.muted} rounded`}
          >
            <FileTypeIcon file={file} />
            <span className="mt-2 text-xs text-gray-400">미리보기 불가</span>
          </div>
        );
    }
  }, [isLoading, previewUrl, file, fileType]);

  // 파일 크기 포맷팅
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (!isVisible) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={tooltipRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        style={{
          position: 'fixed',
          left: adjustedPosition.x,
          top: adjustedPosition.y,
          zIndex: 9999,
        }}
        className={`${BG_COLOR.page} rounded-lg shadow-2xl border ${BORDER_COLOR.default} overflow-hidden w-72`}
        onMouseLeave={onClose}
      >
        {/* 미리보기 영역 */}
        <div className="p-2">{renderPreviewContent()}</div>

        {/* 파일 정보 */}
        <div className={`px-3 py-2 ${BG_COLOR.muted}border-t ${BORDER_COLOR.default}`}>
          <p
            className={`text-sm font-medium ${TEXT_COLOR.primary} truncate`}
            title={file.original_name}
          >
            {file.original_name}
          </p>
          <div className="flex items-center justify-between mt-1">
            <span className={`text-xs ${TEXT_COLOR.muted}`}>{formatSize(file.size)}</span>
            <span className={`text-xs ${TEXT_COLOR.disabled}`}>
              {file.mime_type?.split('/').pop()?.toUpperCase() ||
                file.original_name.split('.').pop()?.toUpperCase()}
            </span>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

// 파일 카드에 연결하는 커스텀 훅
export function useFilePreview() {
  const [previewState, setPreviewState] = useState<{
    file: WebhardFile | null;
    isVisible: boolean;
    position: { x: number; y: number };
  }>({
    file: null,
    isVisible: false,
    position: { x: 0, y: 0 },
  });

  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);
  const currentFileRef = useRef<WebhardFile | null>(null);
  const lastPositionRef = useRef({ x: 0, y: 0 });

  const handleMouseEnter = useCallback((file: WebhardFile, e: React.MouseEvent) => {
    // 모든 파일에서 hover 가능하게 (미리보기 가능 여부는 툴팁에서 처리)
    isHoveringRef.current = true;
    currentFileRef.current = file;
    lastPositionRef.current = { x: e.clientX, y: e.clientY };

    // 기존 타이머 제거
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // 0.5초 후 미리보기 표시
    hoverTimeoutRef.current = setTimeout(() => {
      if (isHoveringRef.current && currentFileRef.current) {
        setPreviewState({
          file: currentFileRef.current,
          isVisible: true,
          position: lastPositionRef.current,
        });
      }
    }, 500);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // hover 중일 때 마우스 위치 계속 업데이트
      lastPositionRef.current = { x: e.clientX, y: e.clientY };

      // 미리보기가 표시 중이면 위치도 업데이트
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

  // 클린업
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
