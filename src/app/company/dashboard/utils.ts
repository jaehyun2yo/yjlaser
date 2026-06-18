import type {
  FilterType,
  Contact,
  StatusInfo,
  Stats,
  FilterOption,
  StatusFilterType,
  StatusFilterOption,
} from './types';
import { TEXT_COLOR, BG_COLOR } from '@/lib/styles';

/**
 * 날짜 필터링 유틸리티 함수 (한국 시간 기준)
 */
export const getDateRange = (type: FilterType) => {
  // 현재 한국 시간 가져오기
  const now = new Date();
  const koreaOffset = 9 * 60; // 한국은 UTC+9
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const koreaTime = new Date(utc + koreaOffset * 60000);

  switch (type) {
    case 'this_week': {
      // 이번 주 월요일 00:00:00 (한국 시간)
      const dayOfWeek = koreaTime.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 일요일이면 -6, 아니면 1-dayOfWeek
      const monday = new Date(koreaTime);
      monday.setDate(koreaTime.getDate() + diff);
      monday.setHours(0, 0, 0, 0);
      // UTC로 변환 (DB는 UTC로 저장)
      const mondayUTC = new Date(monday.getTime() - koreaOffset * 60000);

      // 이번 주 일요일 23:59:59 (한국 시간)
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);
      // UTC로 변환
      const sundayUTC = new Date(sunday.getTime() - koreaOffset * 60000);

      return { start: mondayUTC, end: sundayUTC };
    }

    case 'this_month': {
      // 이번 달 1일 00:00:00 (한국 시간)
      const firstDay = new Date(koreaTime.getFullYear(), koreaTime.getMonth(), 1, 0, 0, 0, 0);
      const firstDayUTC = new Date(firstDay.getTime() - koreaOffset * 60000);

      // 이번 달 마지막 날 23:59:59 (한국 시간)
      const lastDay = new Date(
        koreaTime.getFullYear(),
        koreaTime.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );
      const lastDayUTC = new Date(lastDay.getTime() - koreaOffset * 60000);

      return { start: firstDayUTC, end: lastDayUTC };
    }

    case 'last_week': {
      // 지난 주 월요일 00:00:00 (한국 시간)
      const dayOfWeek = koreaTime.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const thisMonday = new Date(koreaTime);
      thisMonday.setDate(koreaTime.getDate() + diff);
      thisMonday.setHours(0, 0, 0, 0);

      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastMondayUTC = new Date(lastMonday.getTime() - koreaOffset * 60000);

      // 지난 주 일요일 23:59:59 (한국 시간)
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      lastSunday.setHours(23, 59, 59, 999);
      const lastSundayUTC = new Date(lastSunday.getTime() - koreaOffset * 60000);

      return { start: lastMondayUTC, end: lastSundayUTC };
    }

    case 'last_month': {
      // 지난 달 1일 00:00:00 (한국 시간)
      const firstDay = new Date(koreaTime.getFullYear(), koreaTime.getMonth() - 1, 1, 0, 0, 0, 0);
      const firstDayUTC = new Date(firstDay.getTime() - koreaOffset * 60000);

      // 지난 달 마지막 날 23:59:59 (한국 시간)
      const lastDay = new Date(koreaTime.getFullYear(), koreaTime.getMonth(), 0, 23, 59, 59, 999);
      const lastDayUTC = new Date(lastDay.getTime() - koreaOffset * 60000);

      return { start: firstDayUTC, end: lastDayUTC };
    }

    default:
      return null;
  }
};

/**
 * 상태 정보 가져오기
 */
export const getStatusInfo = (status: string, inquiryType?: string | null): StatusInfo => {
  switch (status) {
    case 'new':
      return {
        label: '신규',
        iconName: 'spinner',
        color: 'text-white',
        bgColor: BG_COLOR.infoBright,
      };
    case 'read':
      return {
        label: '작업중',
        iconName: 'eye',
        color: 'text-[#ED6C00]',
        bgColor: BG_COLOR.brandAlphaSoft,
      };
    case 'in_progress':
      return {
        label: '작업중',
        iconName: 'eye',
        color: 'text-[#ED6C00]',
        bgColor: BG_COLOR.brandAlphaSoft,
      };
    case 'revision_in_progress':
      return {
        label: '수정작업중',
        iconName: 'eye',
        color: TEXT_COLOR.orange,
        bgColor: BG_COLOR.orangeLight,
      };
    case 'received':
      return {
        label: '접수',
        iconName: 'fileAlt',
        color: TEXT_COLOR.tertiaryMid,
        bgColor: BG_COLOR.light,
      };
    case 'drawing':
      return {
        label: '도면작업',
        iconName: 'eye',
        color: 'text-[#ED6C00]',
        bgColor: BG_COLOR.brandAlphaSoft,
      };
    case 'confirmed':
      return {
        label: '컨펌',
        iconName: 'eye',
        color: 'text-[#ED6C00]',
        bgColor: BG_COLOR.brandAlphaSoft,
      };
    case 'production':
      return {
        label: '제작중',
        iconName: 'eye',
        color: 'text-[#ED6C00]',
        bgColor: BG_COLOR.brandAlphaSoft,
      };
    case 'cutting':
      return {
        label: '칼작업',
        iconName: 'eye',
        color: 'text-[#ED6C00]',
        bgColor: BG_COLOR.brandAlphaSoft,
      };
    case 'finishing':
      return {
        label: '마감작업',
        iconName: 'eye',
        color: 'text-[#ED6C00]',
        bgColor: BG_COLOR.brandAlphaSoft,
      };
    case 'on_hold':
      return {
        label: '보류',
        iconName: 'fileAlt',
        color: TEXT_COLOR.tertiaryMid,
        bgColor: BG_COLOR.light,
      };
    case 'replied':
      return {
        label: '답변완료',
        iconName: 'checkCircle',
        color: TEXT_COLOR.success,
        bgColor: BG_COLOR.successLight,
      };
    case 'completed':
      return {
        label: inquiryType === 'laser_cutting' ? '가공완료되었습니다' : '납품완료',
        iconName: 'checkCircle',
        color: TEXT_COLOR.success,
        bgColor: BG_COLOR.successLight,
      };
    case 'delivering':
      return {
        label: '납품중',
        iconName: 'spinner',
        color: 'text-blue-600',
        bgColor: BG_COLOR.infoAlpha,
      };
    case 'delivered':
      return {
        label: '납품완료',
        iconName: 'checkCircle',
        color: TEXT_COLOR.success,
        bgColor: BG_COLOR.successLight,
      };
    default:
      return {
        label: status,
        iconName: 'fileAlt',
        color: TEXT_COLOR.tertiaryMid,
        bgColor: BG_COLOR.light,
      };
  }
};

/**
 * 통계 계산
 */
export const calculateStats = (contacts: Contact[]): Stats => {
  return {
    total: contacts.length,
    new: contacts.filter((c) => c.status === 'received').length,
    inProgress: contacts.filter(
      (c) =>
        c.status === 'drawing' ||
        c.status === 'confirmed' ||
        c.status === 'production' ||
        c.status === 'cutting' ||
        c.status === 'finishing'
    ).length,
    completed: contacts.filter((c) => c.status === 'delivered' || c.status === 'completed').length,
  };
};

/**
 * 필터 옵션
 */
export const filterOptions: FilterOption[] = [
  { value: 'all', label: '전체' },
  { value: 'this_week', label: '이번 주' },
  { value: 'this_month', label: '이번 달' },
  { value: 'last_week', label: '지난 주' },
  { value: 'last_month', label: '지난 달' },
];

/**
 * 필터 타입에 따른 라벨 텍스트
 */
export const getFilterLabel = (filterType: FilterType): string => {
  switch (filterType) {
    case 'this_week':
      return '이번 주 (월요일 ~ 일요일)';
    case 'this_month':
      return '이번 달 (1일 ~ 말일)';
    case 'last_week':
      return '지난 주 (월요일 ~ 일요일)';
    case 'last_month':
      return '지난 달 (1일 ~ 말일)';
    default:
      return '';
  }
};

/**
 * 상태 필터 옵션
 */
export const statusFilterOptions: StatusFilterOption[] = [
  { value: 'all', label: '전체' },
  { value: 'new', label: '접수' },
  { value: 'in_progress', label: '작업중' },
  { value: 'completed', label: '납품' },
];

/**
 * 상태 필터에 따른 문의사항 필터링
 */
export const filterByStatus = (contacts: Contact[], statusFilter: StatusFilterType): Contact[] => {
  if (statusFilter === 'all') {
    return contacts;
  }

  switch (statusFilter) {
    case 'new':
      return contacts.filter((c) => c.status === 'received');
    case 'in_progress':
      return contacts.filter(
        (c) =>
          c.status === 'drawing' ||
          c.status === 'confirmed' ||
          c.status === 'production' ||
          c.status === 'cutting' ||
          c.status === 'finishing'
      );
    case 'completed':
      return contacts.filter((c) => c.status === 'delivered' || c.status === 'completed');
    default:
      return contacts;
  }
};
