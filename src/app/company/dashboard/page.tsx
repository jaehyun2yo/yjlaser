import { getSessionUser } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';
import { CompanyDashboardClient } from './CompanyDashboardClient';
import type { ProcessStage } from '@/lib/utils/processStages';
import type { RevisionRequestHistory } from '@/types/database.types';
import {
  serverGetContactsByCompany,
  serverGetCompany,
  serverGetBookings,
} from '@/lib/api/nestjs-server-client';

interface Company {
  id: number;
  company_name: string;
  manager_name?: string;
  manager_phone?: string;
  business_address?: string;
}

interface Contact {
  id: string;
  company_name: string;
  name: string;
  position?: string | null;
  phone: string;
  email: string;
  status: string;
  process_stage: ProcessStage;
  drawing_type: string | null;
  length: string | null;
  width: string | null;
  height: string | null;
  material?: string | null;
  inquiry_title?: string | null;
  created_at: string;
  revision_request_title?: string | null;
  revision_request_content?: string | null;
  revision_requested_at?: string | null;
  revision_request_file_url?: string | null;
  revision_request_file_name?: string | null;
  revision_request_history?: RevisionRequestHistory | null;
  receipt_method?: string | null;
  visit_date?: string | null;
  visit_time_slot?: string | null;
  delivery_method?: string | null;
  delivery_name?: string | null;
  delivery_phone?: string | null;
  delivery_address?: string | null;
  delivery_proof_image?: string | null;
  delivery_complete_image?: string | null;
  attachment_filename?: string | null;
  attachment_url?: string | null;
  drawing_file_url?: string | null;
  drawing_file_name?: string | null;
  reference_photos_urls?: string | null;
  inquiry_type?: string | null;
  webhard_folder_id?: string | null;
  webhard_file_id?: string | null;
  // 포트폴리오 참고 정보
  portfolio_reference_url?: string | null;
  portfolio_reference_info?: {
    id: string | number;
    title: string;
    field?: string;
    type?: string;
    format?: string;
    size?: string;
    paper?: string;
    printing?: string;
    finishing?: string;
    imageUrl?: string;
  } | null;
}

export default async function CompanyDashboardPage() {
  const user = await getSessionUser();
  if (!user?.userId) {
    return null;
  }

  // 업체 정보 가져오기 (NestJS API)
  const dashboardLogger = logger.createLogger('COMPANY_DASHBOARD');
  interface Booking {
    id: number;
    visit_date: string;
    visit_time_slot: string;
    company_name: string;
    status: string;
    created_at: string;
  }

  let company: Company | null = null;
  let contacts: Contact[] = [];
  let bookings: Booking[] = [];

  try {
    const companyData = await serverGetCompany(Number(user.userId));

    if (!companyData) {
      dashboardLogger.error('Company not found', { userId: user.userId });
      return null;
    }

    company = companyData as unknown as Company;

    // 해당 업체의 문의하기(진행상황) 가져오기 (NestJS API)
    try {
      const contactsData = await serverGetContactsByCompany(company.company_name);
      contacts = (contactsData || []) as unknown as Contact[];
    } catch (contactsError) {
      dashboardLogger.error('Error fetching contacts', contactsError);
    }

    // 해당 업체의 예약 일정 가져오기 (NestJS API)
    const bookingsData = await serverGetBookings({
      companyName: company.company_name,
      status: 'confirmed',
    });

    {
      // 현재 날짜/시간보다 지난 예약 필터링
      const now = new Date();
      const typedBookings = (bookingsData || []) as unknown as Booking[];
      bookings = typedBookings.filter((booking) => {
        const visitDate = new Date(booking.visit_date);
        visitDate.setHours(0, 0, 0, 0);

        // visit_time_slot에서 종료 시간 추출 (예: "14:00~15:00" -> "15:00")
        const timeSlot = booking.visit_time_slot || '';
        const endTimeMatch = timeSlot.match(/~(\d{1,2}):(\d{2})/);

        if (!endTimeMatch) {
          // 시간 슬롯 형식이 올바르지 않으면 포함하지 않음
          return false;
        }

        const endHour = parseInt(endTimeMatch[1], 10);
        const endMinute = parseInt(endTimeMatch[2], 10);

        // 예약 종료 시간 생성
        const bookingEndTime = new Date(visitDate);
        bookingEndTime.setHours(endHour, endMinute, 0, 0);

        // 현재 시간이 예약 종료 시간보다 이후인지 확인
        return now < bookingEndTime;
      });
    }
  } catch (error) {
    dashboardLogger.error('Error', error);
    return null;
  }

  if (!company) {
    return null;
  }

  return (
    <CompanyDashboardClient
      initialCompany={company}
      initialContacts={contacts}
      initialBookings={bookings}
    />
  );
}
