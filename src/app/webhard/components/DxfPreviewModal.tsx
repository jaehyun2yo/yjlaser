'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FaTimes,
  FaSpinner,
  FaSearchPlus,
  FaSearchMinus,
  FaExpand,
  FaDownload,
  FaExclamationTriangle,
} from 'react-icons/fa';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import { Button } from '@/components/ui/button';

interface DxfPreviewModalProps {
  fileId: string;
  filename: string;
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
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
  colorIndex?: number;
  color?: number;
  layer?: string;
  text?: string;
  textHeight?: number;
  rotation?: number;
  majorAxisEndPoint?: { x: number; y: number };
  axisRatio?: number;
  name?: string;
  xScale?: number;
  yScale?: number;
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

// AutoCAD 표준 색상 인덱스 (ACI)
const ACI_COLORS: Record<number, string> = {
  0: '#FFFFFF',
  1: '#FF0000',
  2: '#FFFF00',
  3: '#00FF00',
  4: '#00FFFF',
  5: '#0000FF',
  6: '#FF00FF',
  7: '#FFFFFF',
  8: '#808080',
  9: '#C0C0C0',
  256: '#FFFFFF',
};

// DXF 색상 인덱스를 CSS 색상으로 변환
function getColorFromACI(colorIndex: number | undefined, layerColor?: number): string {
  if (colorIndex === undefined || colorIndex === 256) {
    if (layerColor !== undefined && ACI_COLORS[layerColor]) {
      return ACI_COLORS[layerColor];
    }
    return '#FFFFFF';
  }
  if (colorIndex === 0) {
    return '#FFFFFF';
  }
  return ACI_COLORS[colorIndex] || '#FFFFFF';
}

export function DxfPreviewModal({
  fileId,
  filename,
  isOpen,
  onClose,
  onDownload,
}: DxfPreviewModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingPhase, setLoadingPhase] = useState<string>('초기화');
  const [dxfData, setDxfData] = useState<DxfData | null>(null);

  // 뷰포트 상태
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  // DXF 파싱 및 로드
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const abortController = new AbortController();

    const loadDxf = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setLoadingPhase('파일 다운로드');

        // DXF 미리보기 전용 API 사용
        const response = await fetch(`/api/webhard/preview-dxf?fileId=${fileId}`, {
          credentials: 'include',
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`다운로드 실패: ${response.status}`);
        }

        setLoadingPhase('DXF 파싱');

        // dynamic import로 dxf-parser 로딩
        const DxfParserModule = await import('dxf-parser');
        const DxfParser = DxfParserModule.default || DxfParserModule;

        const dxfText = await response.text();

        if (!dxfText || dxfText.length === 0) {
          throw new Error('빈 파일입니다');
        }

        if (!mounted) return;

        // DXF 파싱
        const parser = new DxfParser();
        const parsed = parser.parseSync(dxfText) as DxfData | null;

        if (!parsed || !parsed.entities) {
          throw new Error('DXF 파싱 실패 - 유효하지 않은 DXF 형식');
        }

        if (!mounted) return;

        setDxfData(parsed);
        setLoadingPhase('렌더링');
        setIsLoading(false);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        if (mounted) {
          setError(err instanceof Error ? err.message : 'DXF 미리보기 실패');
          setIsLoading(false);
        }
      }
    };

    loadDxf();

    return () => {
      mounted = false;
      abortController.abort();
    };
  }, [isOpen, fileId]);

  // Canvas 렌더링
  const renderDxf = useCallback(() => {
    if (!dxfData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas 크기 설정
    const container = containerRef.current;
    if (!container) return;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // 레이어 색상 맵 구성
    const layerColors: Record<string, number> = {};
    if (dxfData.tables?.layer?.layers) {
      for (const [name, layer] of Object.entries(dxfData.tables.layer.layers)) {
        layerColors[name] = layer.colorIndex ?? layer.color ?? 7;
      }
    }

    // 엔티티 색상 가져오기
    const getEntityColor = (entity: DxfEntity): string => {
      const colorIndex = entity.colorIndex ?? entity.color;
      const layerColor = entity.layer ? layerColors[entity.layer] : undefined;
      return getColorFromACI(colorIndex, layerColor);
    };

    // 바운딩 박스 계산
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

    // 모든 엔티티의 바운딩 박스 계산
    for (const entity of dxfData.entities) {
      switch (entity.type) {
        case 'LINE':
          if (entity.vertices && entity.vertices.length >= 2) {
            updateBounds(entity.vertices[0].x, entity.vertices[0].y);
            updateBounds(entity.vertices[1].x, entity.vertices[1].y);
          }
          break;
        case 'CIRCLE':
        case 'ARC':
          if (entity.center && entity.radius) {
            updateBounds(entity.center.x - entity.radius, entity.center.y - entity.radius);
            updateBounds(entity.center.x + entity.radius, entity.center.y + entity.radius);
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
        case 'POINT':
          if (entity.position) {
            updateBounds(entity.position.x, entity.position.y);
          }
          break;
      }
    }

    // 바운딩 박스가 유효하지 않으면 기본값
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      minX = 0;
      minY = 0;
      maxX = 100;
      maxY = 100;
    }

    const dxfWidth = maxX - minX || 1;
    const dxfHeight = maxY - minY || 1;

    // 초기 스케일 계산 (fit-to-view)
    const padding = 40;
    const scaleX = (canvas.width - padding * 2) / dxfWidth;
    const scaleY = (canvas.height - padding * 2) / dxfHeight;
    const baseScale = Math.min(scaleX, scaleY);

    // 좌표 변환 함수
    const transformX = (x: number) =>
      canvas.width / 2 + (x - (minX + maxX) / 2) * baseScale * scale + offsetX;
    const transformY = (y: number) =>
      canvas.height / 2 - (y - (minY + maxY) / 2) * baseScale * scale + offsetY;

    // Canvas 초기화 (다크 모드 배경)
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 엔티티 그리기
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const entity of dxfData.entities) {
      const color = getEntityColor(entity);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();

      switch (entity.type) {
        case 'LINE':
          if (entity.vertices && entity.vertices.length >= 2) {
            ctx.moveTo(transformX(entity.vertices[0].x), transformY(entity.vertices[0].y));
            ctx.lineTo(transformX(entity.vertices[1].x), transformY(entity.vertices[1].y));
          }
          break;

        case 'CIRCLE':
          if (entity.center && entity.radius) {
            ctx.arc(
              transformX(entity.center.x),
              transformY(entity.center.y),
              entity.radius * baseScale * scale,
              0,
              Math.PI * 2
            );
          }
          break;

        case 'ARC':
          if (entity.center && entity.radius) {
            let startAngle = entity.startAngle || 0;
            let endAngle = entity.endAngle || Math.PI * 2;

            if (Math.abs(startAngle) > 7 || Math.abs(endAngle) > 7) {
              startAngle = (startAngle * Math.PI) / 180;
              endAngle = (endAngle * Math.PI) / 180;
            }

            ctx.arc(
              transformX(entity.center.x),
              transformY(entity.center.y),
              entity.radius * baseScale * scale,
              -startAngle,
              -endAngle,
              true
            );
          }
          break;

        case 'LWPOLYLINE':
        case 'POLYLINE':
          if (entity.vertices && entity.vertices.length > 0) {
            ctx.moveTo(transformX(entity.vertices[0].x), transformY(entity.vertices[0].y));
            for (let i = 1; i < entity.vertices.length; i++) {
              ctx.lineTo(transformX(entity.vertices[i].x), transformY(entity.vertices[i].y));
            }
            if (entity.shape || entity.closed) {
              ctx.closePath();
            }
          }
          break;

        case 'POINT':
          if (entity.position) {
            ctx.arc(
              transformX(entity.position.x),
              transformY(entity.position.y),
              2,
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
          break;

        default:
          continue;
      }

      ctx.stroke();
    }
  }, [dxfData, scale, offsetX, offsetY]);

  // Canvas 렌더링 트리거
  useEffect(() => {
    if (dxfData) {
      renderDxf();
    }
  }, [dxfData, renderDxf]);

  // 마우스 휠 확대/축소
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((prev) => Math.max(0.1, Math.min(10, prev * delta)));
  }, []);

  // 마우스 드래그 패닝
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsPanning(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setOffsetX((prev) => prev + dx);
      setOffsetY((prev) => prev + dy);
      setLastMousePos({ x: e.clientX, y: e.clientY });
    },
    [isPanning, lastMousePos]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // 확대/축소 버튼
  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(10, prev * 1.2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(0.1, prev / 1.2));
  }, []);

  const handleResetView = useCallback(() => {
    setScale(1);
    setOffsetX(0);
    setOffsetY(0);
  }, []);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className={`${BG_COLOR.page} rounded-lg shadow-2xl w-full max-w-6xl h-[80vh] flex flex-col overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div
            className={`flex items-center justify-between px-6 py-4 border-b ${BORDER_COLOR.default}`}
          >
            <div className="flex-1 min-w-0">
              <h2 className={`text-xl font-semibold truncate ${TEXT_COLOR.primary}`}>{filename}</h2>
              <p className={`text-sm mt-1 ${TEXT_COLOR.secondary}`}>DXF 미리보기</p>
            </div>
            <button
              onClick={onClose}
              className={`p-2 ${BG_COLOR.hoverMuted} rounded-lg transition-colors`}
              aria-label="닫기"
            >
              <FaTimes className={`w-5 h-5 ${TEXT_COLOR.secondary}`} />
            </button>
          </div>

          {/* 컨텐츠 */}
          <div className="flex-1 relative overflow-hidden" ref={containerRef}>
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a2e]">
                <div className="flex flex-col items-center">
                  <FaSpinner className="animate-spin text-orange-500 text-4xl mb-4" />
                  <span className={`text-sm ${TEXT_COLOR.secondary}`}>{loadingPhase}...</span>
                </div>
              </div>
            ) : error ? (
              <div
                className={`absolute inset-0 flex items-center justify-center ${BG_COLOR.gradientFilePreview}`}
              >
                <div className="flex flex-col items-center p-6 max-w-md text-center">
                  <FaExclamationTriangle className="text-5xl text-orange-500 mb-4" />
                  <p className={`text-lg font-semibold mb-2 ${TEXT_COLOR.primary}`}>
                    DXF 미리보기 불가
                  </p>
                  <p className={`text-sm ${TEXT_COLOR.secondary}`}>{error}</p>
                </div>
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className={`w-full h-full ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
              />
            )}
          </div>

          {/* 컨트롤 */}
          {!isLoading && !error && (
            <div
              className={`flex items-center justify-between px-6 py-4 border-t ${BORDER_COLOR.default}`}
            >
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={handleZoomIn}
                  className="flex items-center gap-2"
                  aria-label="확대"
                >
                  <FaSearchPlus className="w-4 h-4" />
                  <span className="text-sm">확대</span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleZoomOut}
                  className="flex items-center gap-2"
                  aria-label="축소"
                >
                  <FaSearchMinus className="w-4 h-4" />
                  <span className="text-sm">축소</span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleResetView}
                  className="flex items-center gap-2"
                  aria-label="원본 크기"
                >
                  <FaExpand className="w-4 h-4" />
                  <span className="text-sm">원본 크기</span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={onDownload}
                  className="flex items-center gap-2"
                  aria-label="다운로드"
                >
                  <FaDownload className="w-4 h-4" />
                  <span className="text-sm">다운로드</span>
                </Button>
              </div>
              <div className={`text-sm ${TEXT_COLOR.secondary}`}>
                <span>확대: {Math.round(scale * 100)}%</span>
                <span className="ml-4">마우스 휠: 확대/축소</span>
                <span className="ml-4">드래그: 이동</span>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
