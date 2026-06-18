'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { MapPin, AlertCircle, LocateFixed } from 'lucide-react';
import { logger } from '@/lib/utils/logger';
import type { DeliveryAddress } from '@/app/worker/delivery/_lib/types';

const log = logger.createLogger('DeliveryKakaoMap');

/** 카카오맵 SDK URL (autoload=false) */
const KAKAO_SDK_URL = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&libraries=services&autoload=false`;

/** 서울 기본 좌표 (위치 권한 거부 시 fallback) */
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };
const DEFAULT_LEVEL = 10;
const CURRENT_LOCATION_LEVEL = 7;

interface DeliveryKakaoMapProps {
  addresses: DeliveryAddress[];
  isVisible: boolean;
}

/**
 * 카카오맵 SDK 로딩 상태를 전역으로 관리 (중복 로딩 방지)
 */
let sdkLoadPromise: Promise<void> | null = null;

function loadKakaoSdk(): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    // 이미 로드된 경우
    if (typeof window !== 'undefined' && window.kakao?.maps) {
      window.kakao.maps.load(() => resolve());
      return;
    }

    const script = document.createElement('script');
    script.src = KAKAO_SDK_URL;
    script.async = true;
    log.info('SDK URL:', script.src);

    script.onload = () => {
      if (window.kakao?.maps) {
        window.kakao.maps.load(() => resolve());
      } else {
        sdkLoadPromise = null;
        reject(new Error('카카오맵 SDK 로드 후 kakao.maps를 찾을 수 없습니다.'));
      }
    };

    script.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error('카카오맵 SDK 스크립트 로드 실패'));
    };

    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

/**
 * 주소를 좌표로 변환 (Geocoder 콜백 → Promise 래퍼)
 */
function geocodeAddress(
  geocoder: kakao.maps.services.Geocoder,
  address: string
): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    geocoder.addressSearch(address, (result, status) => {
      if (status === kakao.maps.services.Status.OK && result.length > 0) {
        resolve({
          lat: parseFloat(result[0].y),
          lng: parseFloat(result[0].x),
        });
      } else {
        log.warn(`Geocoding 실패: "${address}" (status: ${status})`);
        resolve(null);
      }
    });
  });
}

export default function DeliveryKakaoMap({ addresses, isVisible }: DeliveryKakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const markersRef = useRef<kakao.maps.Marker[]>([]);
  const infoWindowsRef = useRef<kakao.maps.InfoWindow[]>([]);
  const listenersRef = useRef<Array<{ target: kakao.maps.Marker; handler: () => void }>>([]);

  const [isMapReady, setIsMapReady] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const currentMarkerRef = useRef<kakao.maps.Marker | null>(null);

  // --- 현재 위치 가져오기 ---
  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        log.info('현재 위치 획득:', pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        log.warn('위치 권한 거부 또는 실패:', err.message);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  // --- SDK 로딩 ---
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_KAKAO_MAP_KEY) {
      setSdkError('카카오맵 앱키가 설정되지 않았습니다. (NEXT_PUBLIC_KAKAO_MAP_KEY)');
      return;
    }

    let cancelled = false;

    loadKakaoSdk()
      .then(() => {
        if (!cancelled) {
          setIsMapReady(true);
          log.info('카카오맵 SDK 로드 완료');
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setSdkError(err.message);
          log.error('카카오맵 SDK 로드 실패', err);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // --- 마커/인포윈도우 정리 함수 ---
  const clearMarkers = useCallback(() => {
    // 이벤트 리스너 제거
    for (const { target, handler } of listenersRef.current) {
      kakao.maps.event.removeListener(target, 'click', handler);
    }
    listenersRef.current = [];

    // 인포윈도우 닫기
    for (const iw of infoWindowsRef.current) {
      iw.close();
    }
    infoWindowsRef.current = [];

    // 마커 제거
    for (const marker of markersRef.current) {
      marker.setMap(null);
    }
    markersRef.current = [];
  }, []);

  // --- 지도 초기화 + 마커 배치 ---
  useEffect(() => {
    if (!isVisible || !isMapReady || !containerRef.current) return;

    // 초기 중심: 현재 위치 > 서울 기본값
    const initCenter = currentLocation || DEFAULT_CENTER;
    const initLevel =
      currentLocation && addresses.length === 0 ? CURRENT_LOCATION_LEVEL : DEFAULT_LEVEL;

    // 지도가 없으면 생성
    if (!mapRef.current) {
      const center = new kakao.maps.LatLng(initCenter.lat, initCenter.lng);
      mapRef.current = new kakao.maps.Map(containerRef.current, {
        center,
        level: initLevel,
      });
      log.info('카카오맵 인스턴스 생성');
    } else {
      mapRef.current.relayout();
    }

    // 기존 마커 정리
    clearMarkers();

    // 현재 위치 마커 제거
    if (currentMarkerRef.current) {
      currentMarkerRef.current.setMap(null);
      currentMarkerRef.current = null;
    }

    const map = mapRef.current;

    // 현재 위치 마커 표시
    if (currentLocation) {
      const curPos = new kakao.maps.LatLng(currentLocation.lat, currentLocation.lng);
      // kakao.maps SDK의 MarkerImage/Size/Point는 런타임에 존재하나 @types에 누락
      const mapsAny = kakao.maps as typeof kakao.maps & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      currentMarkerRef.current = new kakao.maps.Marker({
        position: curPos,
        map,
        image: new mapsAny.MarkerImage(
          'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/marker_red.png',
          new mapsAny.Size(30, 40),
          { offset: new mapsAny.Point(15, 40) }
        ),
        title: '현재 위치',
      } as kakao.maps.MarkerOptions);
    }

    // 납품처가 없으면 현재 위치 중심으로만 표시
    if (addresses.length === 0) {
      if (currentLocation) {
        map.setCenter(new kakao.maps.LatLng(currentLocation.lat, currentLocation.lng));
        map.setLevel(CURRENT_LOCATION_LEVEL);
      }
      return;
    }

    const geocoder = new kakao.maps.services.Geocoder();
    let cancelled = false;

    (async () => {
      const bounds = new kakao.maps.LatLngBounds();
      let hasValidMarker = false;

      // 현재 위치도 bounds에 포함
      if (currentLocation) {
        bounds.extend(new kakao.maps.LatLng(currentLocation.lat, currentLocation.lng));
        hasValidMarker = true;
      }

      // 열려있는 인포윈도우 추적 (한 번에 하나만)
      let openInfoWindow: kakao.maps.InfoWindow | null = null;

      for (const addr of addresses) {
        if (cancelled) return;

        const coords = await geocodeAddress(geocoder, addr.address);
        if (!coords || cancelled) continue;

        const position = new kakao.maps.LatLng(coords.lat, coords.lng);
        const marker = new kakao.maps.Marker({ position, map });
        markersRef.current.push(marker);

        // 인포윈도우 내용
        const phoneHtml = addr.phone
          ? `<br/><span style="font-size:11px;color:#888">${addr.phone}</span>`
          : '';
        const infoWindow = new kakao.maps.InfoWindow({
          content: `<div style="padding:8px 12px;font-size:13px;max-width:220px;line-height:1.4;">
            <strong>${addr.companyName}</strong><br/>
            <span style="font-size:11px;color:#555">${addr.address}</span>
            ${phoneHtml}
          </div>`,
          removable: true,
        });
        infoWindowsRef.current.push(infoWindow);

        // 마커 클릭 이벤트
        const handler = () => {
          if (openInfoWindow) openInfoWindow.close();
          infoWindow.open(map, marker);
          openInfoWindow = infoWindow;
        };
        kakao.maps.event.addListener(marker, 'click', handler);
        listenersRef.current.push({ target: marker, handler });

        bounds.extend(position);
        hasValidMarker = true;
      }

      if (!cancelled && hasValidMarker) {
        map.setBounds(bounds, 60, 60, 60, 60);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isVisible, isMapReady, addresses, currentLocation, clearMarkers]);

  // --- 언마운트 시 정리 ---
  useEffect(() => {
    return () => {
      clearMarkers();
      if (currentMarkerRef.current) {
        currentMarkerRef.current.setMap(null);
        currentMarkerRef.current = null;
      }
      mapRef.current = null;
    };
  }, [clearMarkers]);

  // --- 현재 위치로 이동 ---
  const handleMoveToCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCurrentLocation(loc);

        if (mapRef.current) {
          mapRef.current.setCenter(new kakao.maps.LatLng(loc.lat, loc.lng));
          mapRef.current.setLevel(CURRENT_LOCATION_LEVEL);
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  // 에러 상태
  if (sdkError) {
    return (
      <section className="mb-6">
        <div className="h-[250px] bg-gray-50 rounded-xl border border-gray-200 flex flex-col items-center justify-center gap-2 px-4">
          <AlertCircle className="w-8 h-8 text-gray-400" />
          <p className="text-xs text-gray-400 text-center">{sdkError}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <div className="relative" style={{ display: isVisible ? 'block' : 'none' }}>
        <div
          ref={containerRef}
          className="rounded-xl shadow-sm overflow-hidden"
          style={{ height: 250 }}
        >
          {/* SDK 로딩 중 스켈레톤 */}
          {!isMapReady && isVisible && (
            <div className="h-full bg-gray-100 flex flex-col items-center justify-center gap-2 animate-pulse">
              <MapPin className="w-8 h-8 text-gray-300" />
              <p className="text-xs text-gray-400">지도 로딩 중...</p>
            </div>
          )}
        </div>

        {/* 현재 위치 버튼 */}
        {isMapReady && (
          <button
            type="button"
            onClick={handleMoveToCurrentLocation}
            className="absolute bottom-3 right-3 z-[5] w-9 h-9 bg-white rounded-lg shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 active:bg-gray-100 transition-colors"
            aria-label="현재 위치로 이동"
          >
            <LocateFixed className="w-5 h-5 text-gray-600" />
          </button>
        )}
      </div>
    </section>
  );
}
