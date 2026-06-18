/**
 * OfficeAdvanceButton 테스트 (Phase 6: stage-transition-frontend).
 *
 * - 성공 응답 → 3 카테고리 쿼리 invalidate, 에러 모달 미표시.
 * - 422 INQUIRY_NUMBER_REQUIRED → "도면 확정 불가" 모달 + 3 카테고리 낙관적 롤백.
 * - 422 FOLDER_CREATION_FAILED → "웹하드 폴더 생성 실패" 모달.
 * - 네트워크 예외 catch 블록도 동일 매핑.
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import OfficeAdvanceButton from '@/app/worker/_components/OfficeAdvanceButton';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { Contact } from '@/lib/types/contact';

jest.mock('@/app/actions/contacts', () => ({
  updateProcessStage: jest.fn(),
}));

import { updateProcessStage } from '@/app/actions/contacts';

const mockedUpdateProcessStage = updateProcessStage as jest.MockedFunction<
  typeof updateProcessStage
>;

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'contact-p6-1',
    inquiry_number: 'INQ-001',
    work_number: null,
    company_name: '테스트업체',
    name: '홍길동',
    position: '대표',
    phone: '010-1234-5678',
    email: 'test@example.com',
    contact_type: 'company',
    service_mold_request: null,
    service_delivery_brokerage: null,
    drawing_type: null,
    has_physical_sample: null,
    has_reference_photos: null,
    drawing_modification: null,
    box_shape: null,
    length: null,
    width: null,
    height: null,
    material: null,
    drawing_notes: null,
    sample_notes: null,
    receipt_method: null,
    delivery_proof_image: null,
    delivery_complete_image: null,
    visit_date: null,
    visit_time_slot: null,
    delivery_type: null,
    delivery_address: null,
    delivery_name: null,
    delivery_phone: null,
    delivery_method: null,
    delivery_company_name: null,
    delivery_company_phone: null,
    delivery_company_address: null,
    attachment_filename: null,
    attachment_url: null,
    drawing_file_url: null,
    drawing_file_name: null,
    reference_photos_urls: null,
    status: 'drawing',
    process_stage: 'sample',
    created_at: '2026-04-24T09:00:00',
    updated_at: '2026-04-24T09:00:00',
    source: 'website',
    inquiry_type: 'mold_request',
    ...overrides,
  } as Contact;
}

function createTestSetup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryWrapper';
  return { Wrapper, queryClient };
}

async function clickAdvanceAndConfirm() {
  // 최초 버튼 클릭 → 확인 모달 오픈
  const triggerButtons = screen.getAllByRole('button', { name: /도면 확정/ });
  fireEvent.click(triggerButtons[0]);

  // 확인 모달의 "확인" 버튼 클릭 (오류 모달이 나중에 같은 라벨로 렌더되므로 "취소" 와 짝이 되는 첫 번째 확인)
  const confirmButtons = await screen.findAllByRole('button', { name: '확인' });
  await act(async () => {
    fireEvent.click(confirmButtons[0]);
  });
}

describe('OfficeAdvanceButton — 성공 경로', () => {
  beforeEach(() => {
    mockedUpdateProcessStage.mockReset();
  });

  it('sample → drawing_confirmed 성공 시 office/unclassified/field 3 카테고리 invalidateQueries 호출', async () => {
    mockedUpdateProcessStage.mockResolvedValue({ success: true });
    const { Wrapper, queryClient } = createTestSetup();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const contact = makeContact({ process_stage: 'sample' });

    render(
      <Wrapper>
        <OfficeAdvanceButton
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    await clickAdvanceAndConfirm();

    await waitFor(() => {
      expect(mockedUpdateProcessStage).toHaveBeenCalledWith('contact-p6-1', 'drawing_confirmed');
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(invalidatedKeys).toContain(
      JSON.stringify(queryKeys.processBoard.board({ workCategory: 'office' }))
    );
    expect(invalidatedKeys).toContain(
      JSON.stringify(queryKeys.processBoard.board({ workCategory: 'unclassified' }))
    );
    expect(invalidatedKeys).toContain(
      JSON.stringify(queryKeys.processBoard.board({ workCategory: 'field' }))
    );
  });

  it('성공 시 에러 모달이 표시되지 않는다', async () => {
    mockedUpdateProcessStage.mockResolvedValue({ success: true });
    const { Wrapper } = createTestSetup();

    render(
      <Wrapper>
        <OfficeAdvanceButton
          contact={makeContact()}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    await clickAdvanceAndConfirm();

    await waitFor(() => {
      expect(mockedUpdateProcessStage).toHaveBeenCalled();
    });

    expect(screen.queryByText('도면 확정 불가')).toBeNull();
    expect(screen.queryByText('웹하드 폴더 생성 실패')).toBeNull();
  });
});

describe('OfficeAdvanceButton — 422 구조화 에러', () => {
  beforeEach(() => {
    mockedUpdateProcessStage.mockReset();
  });

  it('INQUIRY_NUMBER_REQUIRED → "도면 확정 불가" 모달 + 문의번호 안내 문구', async () => {
    mockedUpdateProcessStage.mockResolvedValue({
      success: false,
      error: {
        code: 'INQUIRY_NUMBER_REQUIRED',
        message: '도면 확정 전에 문의번호(O) 또는 작업번호(F) 가 할당되어야 합니다.',
        statusCode: 422,
      },
    });
    const { Wrapper } = createTestSetup();

    render(
      <Wrapper>
        <OfficeAdvanceButton
          contact={makeContact({ process_stage: 'sample' })}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    await clickAdvanceAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('도면 확정 불가')).toBeInTheDocument();
    });
    expect(screen.getByText(/문의번호\(O-번호\)/)).toBeInTheDocument();
    // 기술 용어 노출 금지.
    expect(screen.queryByText(/INQUIRY_NUMBER_REQUIRED/)).toBeNull();
  });

  it('FOLDER_CREATION_FAILED → "웹하드 폴더 생성 실패" 모달', async () => {
    mockedUpdateProcessStage.mockResolvedValue({
      success: false,
      error: {
        code: 'FOLDER_CREATION_FAILED',
        message: '문의 폴더 생성 실패',
        statusCode: 422,
      },
    });
    const { Wrapper } = createTestSetup();

    render(
      <Wrapper>
        <OfficeAdvanceButton
          contact={makeContact({ process_stage: 'sample' })}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    await clickAdvanceAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('웹하드 폴더 생성 실패')).toBeInTheDocument();
    });
    expect(screen.getByText(/업체 정보\(Company\)/)).toBeInTheDocument();
    expect(screen.queryByText(/FOLDER_CREATION_FAILED/)).toBeNull();
  });
});

describe('OfficeAdvanceButton — 낙관적 업데이트 롤백', () => {
  beforeEach(() => {
    mockedUpdateProcessStage.mockReset();
  });

  it('실패 시 3 카테고리 캐시가 이전 데이터로 복구된다', async () => {
    mockedUpdateProcessStage.mockResolvedValue({
      success: false,
      error: {
        code: 'INQUIRY_NUMBER_REQUIRED',
        message: '...',
        statusCode: 422,
      },
    });
    const { Wrapper, queryClient } = createTestSetup();

    const contact = makeContact({ process_stage: 'sample' });
    const officeKey = queryKeys.processBoard.board({ workCategory: 'office' });
    const unclassifiedKey = queryKeys.processBoard.board({ workCategory: 'unclassified' });
    const fieldKey = queryKeys.processBoard.board({ workCategory: 'field' });

    // 초기 캐시 세팅 — office 에 이 contact 가 있는 상태.
    const initialOffice: Contact[] = [contact];
    const initialUnclassified: Contact[] = [];
    const initialField: Contact[] = [];
    queryClient.setQueryData(officeKey, initialOffice);
    queryClient.setQueryData(unclassifiedKey, initialUnclassified);
    queryClient.setQueryData(fieldKey, initialField);

    render(
      <Wrapper>
        <OfficeAdvanceButton
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    await clickAdvanceAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('도면 확정 불가')).toBeInTheDocument();
    });

    // 롤백 후 캐시가 원래 상태로 돌아와야 함.
    expect(queryClient.getQueryData<Contact[]>(officeKey)).toEqual(initialOffice);
    expect(queryClient.getQueryData<Contact[]>(unclassifiedKey)).toEqual(initialUnclassified);
    expect(queryClient.getQueryData<Contact[]>(fieldKey)).toEqual(initialField);
  });
});

describe('OfficeAdvanceButton — 네트워크 예외', () => {
  beforeEach(() => {
    mockedUpdateProcessStage.mockReset();
  });

  it('updateProcessStage 가 throw 하면 기본 전환 실패 모달 표시', async () => {
    mockedUpdateProcessStage.mockRejectedValue(new Error('fetch failed'));
    const { Wrapper } = createTestSetup();

    render(
      <Wrapper>
        <OfficeAdvanceButton
          contact={makeContact({ process_stage: 'sample' })}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    await clickAdvanceAndConfirm();

    await waitFor(() => {
      expect(screen.getByText('전환 실패')).toBeInTheDocument();
    });
    expect(screen.getByText('fetch failed')).toBeInTheDocument();
  });
});
