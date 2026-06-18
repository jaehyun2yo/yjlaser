/**
 * Worker 납품 관리 타입 정의
 */

/**
 * 일괄 납품 시작 결과
 */
export interface BatchDeliveryResult {
  contactId: string;
  success: boolean;
  error?: string;
}

/**
 * 납품지 주소 정보 (카카오맵 마커용)
 */
export interface DeliveryAddress {
  companyName: string;
  address: string;
  phone?: string;
}
