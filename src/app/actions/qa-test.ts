'use server';

import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('QA_TEST');

const NESTJS_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
const API_KEY = process.env.INTEGRATION_API_KEY || '';

const QA_MARKER = '{{ 테스트 }}';
const PRODUCTION_DISABLED_ERROR = 'QA 테스트 작업은 production에서 비활성화되어 있습니다.';

const TEST_DATA = [
  {
    workNumber: '260410-F-001',
    inquiryTitle: '260410-F-001 원컴퍼니 {{ 테스트 }} [아루다] 3ml_무지_단상자 [한결 341] 2절',
    companyName: '원컴퍼니',
  },
  {
    workNumber: '260410-F-002',
    inquiryTitle: '260410-F-002 원컴퍼니 {{ 테스트 }} [딥포인트] 포뷰트 스프레이 단상자 국2절',
    companyName: '원컴퍼니',
  },
  {
    workNumber: '260410-F-003',
    inquiryTitle: '260410-F-003 대성목형 {{ 테스트 }} (5552) 4절',
    companyName: '대성목형',
  },
  {
    workNumber: '260410-F-004',
    inquiryTitle: '260410-F-004 동성사 {{ 테스트 }} 잡코리아 리플렛 132x239 8절',
    companyName: '동성사',
  },
  {
    workNumber: '260410-F-005',
    inquiryTitle: '260410-F-005 필컴 {{ 테스트 }} 프리미엄택 칼선 타공3mm 8절',
    companyName: '필컴',
  },
];

interface CreatedContact {
  contactId: string;
  workNumber: string;
  companyName: string;
  processStage: string;
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

async function apiFetch<T>(
  endpoint: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${NESTJS_URL}/api/v1${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json();
}

export async function createQATestContacts(): Promise<{
  success: boolean;
  contacts: CreatedContact[];
  error?: string;
}> {
  try {
    if (isProductionRuntime()) {
      return { success: false, contacts: [], error: PRODUCTION_DISABLED_ERROR };
    }

    if (!API_KEY) {
      return { success: false, contacts: [], error: 'INTEGRATION_API_KEY 미설정' };
    }

    const contacts: CreatedContact[] = [];

    for (const data of TEST_DATA) {
      // 1. POST /contacts (Public) — 최소한의 필드로 문의 생성 (번호 자동생성 방지)
      const created = await apiFetch<{ id: string }>('/contacts', {
        method: 'POST',
        body: {
          name: '자동등록',
          email: 'qa-test@yjlaser.com',
          phone: '-',
          companyName: data.companyName,
          contactType: 'company',
          inquiryTitle: data.inquiryTitle,
          drawingType: 'have',
          referralSource: 'QA테스트',
          drawingNotes: '네스팅 QA 테스트용',
        },
      });

      const contactId = created.id;

      // 2. PATCH /contacts/:id — workNumber, processStage, status, inquiryType 고정 설정
      await apiFetch(`/contacts/${contactId}`, {
        method: 'PATCH',
        body: {
          workNumber: data.workNumber,
          inquiryType: 'mold_request',
          status: 'cutting',
          processStage: 'laser',
        },
      });

      contacts.push({
        contactId,
        workNumber: data.workNumber,
        companyName: data.companyName,
        processStage: 'laser',
      });

      log.info(`QA 테스트 문의 생성: ${data.companyName} (${data.workNumber})`);
    }

    return { success: true, contacts };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error(`QA 테스트 문의 생성 실패: ${msg}`);
    return { success: false, contacts: [], error: msg };
  }
}

export async function deleteQATestContacts(
  contactIds?: string[]
): Promise<{ success: boolean; deleted: number; error?: string }> {
  try {
    if (isProductionRuntime()) {
      return { success: false, deleted: 0, error: PRODUCTION_DISABLED_ERROR };
    }

    if (!API_KEY) {
      return { success: false, deleted: 0, error: 'INTEGRATION_API_KEY 미설정' };
    }

    let idsToDelete = contactIds || [];

    // contactIds가 없으면 {{ 테스트 }} 마커로 검색
    if (idsToDelete.length === 0) {
      try {
        const result = await apiFetch<{ contacts: Array<{ id: string; inquiry_title: string }> }>(
          `/contacts?search=${encodeURIComponent(QA_MARKER)}&limit=50`
        );
        idsToDelete = result.contacts.map((c) => c.id);
      } catch {
        // fallback: 업체명으로 검색
        for (const company of ['원컴퍼니', '대성목형', '동성사', '필컴']) {
          try {
            const result = await apiFetch<{
              contacts: Array<{ id: string; inquiry_title: string }>;
            }>(`/contacts?search=${encodeURIComponent(company)}&limit=20`);
            const qaContacts = result.contacts.filter((c) => c.inquiry_title?.includes(QA_MARKER));
            idsToDelete.push(...qaContacts.map((c) => c.id));
          } catch {
            /* skip */
          }
        }
      }
    }

    if (idsToDelete.length === 0) {
      return { success: false, deleted: 0, error: '삭제할 QA 테스트 문의를 찾을 수 없습니다' };
    }

    let deleted = 0;
    for (const id of idsToDelete) {
      try {
        await apiFetch(`/contacts/${id}?permanent=true`, { method: 'DELETE' });
        deleted++;
      } catch (err) {
        log.warn(`QA 테스트 문의 삭제 실패: ${id} - ${err}`);
      }
    }

    log.info(`QA 테스트 문의 ${deleted}건 삭제 완료`);
    return { success: true, deleted };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error(`QA 테스트 문의 삭제 실패: ${msg}`);
    return { success: false, deleted: 0, error: msg };
  }
}
