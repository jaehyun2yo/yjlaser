/**
 * Kakao Maps JavaScript SDK TypeScript type declarations
 * @see https://apis.map.kakao.com/web/documentation/
 */

declare namespace kakao {
  namespace maps {
    /** SDK 로딩 완료 후 콜백 실행 (autoload=false 필수) */
    function load(callback: () => void): void;

    /** 지도 생성 옵션 */
    interface MapOptions {
      center: LatLng;
      level?: number;
    }

    /** 지도 인스턴스 */
    class Map {
      constructor(container: HTMLElement, options: MapOptions);
      setBounds(
        bounds: LatLngBounds,
        paddingTop?: number,
        paddingRight?: number,
        paddingBottom?: number,
        paddingLeft?: number
      ): void;
      setCenter(latlng: LatLng): void;
      setLevel(level: number): void;
      getLevel(): number;
      relayout(): void;
    }

    /** 위경도 좌표 */
    class LatLng {
      constructor(lat: number, lng: number);
      getLat(): number;
      getLng(): number;
    }

    /** 좌표 범위 (마커 전체를 포함하는 영역 계산용) */
    class LatLngBounds {
      constructor();
      extend(latlng: LatLng): void;
      isEmpty(): boolean;
    }

    /** 마커 옵션 */
    interface MarkerOptions {
      position: LatLng;
      map?: Map;
    }

    /** 마커 인스턴스 */
    class Marker {
      constructor(options: MarkerOptions);
      setMap(map: Map | null): void;
      getPosition(): LatLng;
    }

    /** 인포윈도우 옵션 */
    interface InfoWindowOptions {
      content: string;
      removable?: boolean;
    }

    /** 인포윈도우 인스턴스 */
    class InfoWindow {
      constructor(options: InfoWindowOptions);
      open(map: Map, marker: Marker): void;
      close(): void;
    }

    /** 이벤트 유틸 */
    namespace event {
      function addListener(target: Marker | Map, type: string, handler: () => void): void;
      function removeListener(target: Marker | Map, type: string, handler: () => void): void;
    }

    /** 서비스 (Geocoder 등) */
    namespace services {
      /** Geocoding 결과 상태 */
      enum Status {
        OK = 'OK',
        ZERO_RESULT = 'ZERO_RESULT',
        ERROR = 'ERROR',
      }

      /** Geocoding 결과 아이템 */
      interface GeocoderResult {
        address_name: string;
        x: string; // longitude
        y: string; // latitude
      }

      /** Geocoder 콜백 */
      type GeocoderCallback = (result: GeocoderResult[], status: Status) => void;

      /** 주소 → 좌표 변환 서비스 */
      class Geocoder {
        addressSearch(address: string, callback: GeocoderCallback): void;
      }
    }
  }
}

/** 전역 kakao 객체 선언 */
interface Window {
  kakao: typeof kakao;
}
