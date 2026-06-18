import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = '유진레이저목형 - 박스 지기구조 전문업체';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* 배경 패턴 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(237, 108, 0, 0.1) 0%, transparent 50%)',
          }}
        />

        {/* 메인 컨텐츠 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
          }}
        >
          {/* 회사명 */}
          <div
            style={{
              fontSize: 72,
              fontWeight: 'bold',
              color: 'white',
              letterSpacing: '-2px',
            }}
          >
            유진레이저목형
          </div>

          {/* 영문명 */}
          <div
            style={{
              fontSize: 32,
              color: '#ED6C00',
              fontWeight: '600',
              letterSpacing: '4px',
            }}
          >
            YJ LASER
          </div>

          {/* 슬로건 */}
          <div
            style={{
              fontSize: 28,
              color: 'rgba(255, 255, 255, 0.8)',
              marginTop: '16px',
            }}
          >
            박스 지기구조 전문업체
          </div>

          {/* 하단 구분선 */}
          <div
            style={{
              width: '120px',
              height: '4px',
              background: '#ED6C00',
              borderRadius: '2px',
              marginTop: '24px',
            }}
          />

          {/* 추가 정보 */}
          <div
            style={{
              fontSize: 20,
              color: 'rgba(255, 255, 255, 0.6)',
              marginTop: '16px',
            }}
          >
            레이저 목형 · 칼선 · 박스 설계
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
