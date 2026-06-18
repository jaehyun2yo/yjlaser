import type { ProcessStage } from '@/lib/utils/processStages';
import type { Contact } from '@/lib/types/contact';

export interface ProcessBoardFilters {
  companyName?: string;
  dateFilter?: 'today' | 'week' | 'month' | 'all';
}

export interface ProxyContactInput {
  company_name: string;
  name: string;
  phone: string;
  inquiry_title: string;
  email?: string;
  length?: string;
  width?: string;
  height?: string;
  material?: string;
  drawing_notes?: string;
}

export interface ProcessColumnData {
  stage: ProcessStage;
  label: string;
  contacts: Contact[];
  color: string;
  bgColor: string;
}
