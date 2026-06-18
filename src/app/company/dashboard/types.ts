import type { ProcessStage } from '@/lib/utils/processStages';
import type { RevisionRequestHistory } from '@/types/database.types';

export type FilterType = 'all' | 'this_week' | 'this_month' | 'last_week' | 'last_month';

export interface DateFilter {
  startDate: Date | null;
  endDate: Date | null;
}
export type StatusFilterType = 'all' | 'new' | 'in_progress' | 'completed';

export interface Company {
  id: number;
  company_name: string;
  manager_name?: string;
  manager_phone?: string;
  business_address?: string;
}

export interface Contact {
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

export interface Booking {
  id: number;
  visit_date: string;
  visit_time_slot: string;
  company_name: string;
  status: string;
  created_at: string;
  contact_id?: string | null;
  contacts?: {
    process_stage: ProcessStage | null;
    name: string;
    status: string | null;
    inquiry_title?: string | null;
  } | null;
}

export interface CompanyDashboardClientProps {
  initialCompany: Company;
  initialContacts: Contact[];
  initialBookings?: Booking[];
}

export interface StatusInfo {
  label: string;
  iconName: 'spinner' | 'eye' | 'fileAlt' | 'checkCircle';
  color: string;
  bgColor: string;
}

export interface Stats {
  total: number;
  new: number;
  inProgress: number;
  completed: number;
}

export interface FilterOption {
  value: FilterType;
  label: string;
}

export interface StatusFilterOption {
  value: StatusFilterType;
  label: string;
}
