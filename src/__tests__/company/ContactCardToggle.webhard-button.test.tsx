import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ContactCardToggle } from '@/components/ContactCardToggle';
import type { Booking, Contact } from '@/app/company/dashboard/types';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('@/app/actions/contacts', () => ({
  addWorkerNote: jest.fn(),
  getContactTimeline: jest.fn(async () => ({ data: [] })),
}));

jest.mock('@/components/ProcessStageIndicatorToggle', () => ({
  ProcessStageIndicatorToggle: () => <div data-testid="process-stage-indicator" />,
}));

jest.mock('@/components/ContactTimeline', () => ({
  ContactTimeline: () => <div data-testid="contact-timeline" />,
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

const mockedUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'contact-001',
    company_name: '테스트업체',
    name: '홍길동',
    position: null,
    phone: '010-1234-5678',
    email: 'test@example.com',
    status: 'in_progress',
    process_stage: 'drawing',
    drawing_type: null,
    length: null,
    width: null,
    height: null,
    material: null,
    inquiry_title: '칼선 수정 테스트.DXF',
    created_at: '2026-05-11T08:19:00.000Z',
    revision_request_title: null,
    revision_request_content: null,
    revision_requested_at: null,
    revision_request_file_url: null,
    revision_request_file_name: null,
    revision_request_history: null,
    receipt_method: null,
    visit_date: null,
    visit_time_slot: null,
    delivery_method: null,
    delivery_name: null,
    delivery_phone: null,
    delivery_address: null,
    delivery_proof_image: null,
    delivery_complete_image: null,
    attachment_filename: null,
    attachment_url: null,
    drawing_file_url: null,
    drawing_file_name: null,
    reference_photos_urls: null,
    inquiry_type: 'cutting_request',
    webhard_folder_id: 'folder-001',
    webhard_file_id: 'file-001',
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'ContactCardToggleTestWrapper';

  return Wrapper;
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 1,
    visit_date: '2026-05-20',
    visit_time_slot: '9:00~10:00',
    company_name: '테스트업체',
    status: 'pending',
    created_at: '2026-05-18T08:19:00.000Z',
    contact_id: 'contact-001',
    contacts: {
      process_stage: 'sample',
      name: '홍길동',
      status: 'in_progress',
      inquiry_title: '칼선 수정 테스트.DXF',
    },
    ...overrides,
  };
}

function renderCard(contact: Contact, expanded = false, booking?: Booking) {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <ContactCardToggle
        contact={contact}
        statusInfo={{
          label: '작업중',
          iconName: 'eye',
          color: 'text-brand',
          bgColor: 'bg-brand-light',
        }}
        expanded={expanded}
        booking={booking}
      />
    </Wrapper>
  );
}

describe('ContactCardToggle — 업체 대시보드 웹하드 이동 버튼', () => {
  beforeEach(() => {
    mockedUseRouter.mockReturnValue({
      push: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);
  });

  it('웹하드 버튼을 메모 버튼 왼쪽에 렌더하고 문의 폴더 URL로 이동한다', () => {
    const push = jest.fn();
    mockedUseRouter.mockReturnValue({
      push,
    } as unknown as ReturnType<typeof useRouter>);

    renderCard(makeContact());

    const webhardButton = screen.getAllByRole('button', { name: '웹하드로 이동' })[0];
    const memoButton = screen.getAllByRole('button', { name: '메모' })[0];

    expect(
      webhardButton.compareDocumentPosition(memoButton) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    fireEvent.click(webhardButton);

    expect(push).toHaveBeenCalledWith('/webhard?folderId=folder-001&fileId=file-001');
  });

  it('문의 폴더 id가 없으면 버튼을 비활성화하고 이동하지 않는다', () => {
    const push = jest.fn();
    mockedUseRouter.mockReturnValue({
      push,
    } as unknown as ReturnType<typeof useRouter>);

    renderCard(makeContact({ webhard_folder_id: null, webhard_file_id: null }));

    const webhardButton = screen.getAllByRole('button', { name: '웹하드로 이동' })[0];

    expect(webhardButton).toBeDisabled();

    fireEvent.click(webhardButton);

    expect(push).not.toHaveBeenCalled();
  });

  it('문의 제목의 업체명 접두사를 제거하고 패키지명만 표시한다', () => {
    renderCard(
      makeContact({
        company_name: '테스트업체',
        inquiry_title: '테스트업체 518테스트',
      })
    );

    expect(screen.getByRole('heading', { name: '518테스트' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '테스트업체 518테스트' })).not.toBeInTheDocument();
  });

  it('납품 완료 상태에서는 납품증빙 사진을 표시한다', () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        url: 'https://r2-presigned.example.com/contacts/delivery-proofs/proof.webp?sig=123',
      }),
    }) as jest.Mock;

    renderCard(
      makeContact({
        status: 'delivered',
        delivery_proof_image: 'https://cdn.yjlaser.net/contacts/delivery-proofs/proof.webp',
      }),
      true
    );

    expect(screen.getByText('납품 증빙 사진')).toBeInTheDocument();
    return waitFor(() =>
      expect(screen.getByRole('img', { name: '납품 증빙' })).toHaveAttribute(
        'src',
        'https://r2-presigned.example.com/contacts/delivery-proofs/proof.webp?sig=123'
      )
    );
  });

  it('문의카드의 예약 버튼도 웹하드/메모 버튼과 같은 카드 액션 스타일을 사용한다', () => {
    renderCard(
      makeContact({
        visit_date: '2026-05-20',
        visit_time_slot: '9:00~10:00',
      }),
      true,
      makeBooking()
    );

    const bookingChangeButton = screen.getByRole('button', { name: '예약변경' });
    const bookingCancelButton = screen.getByRole('button', { name: '예약취소' });

    expect(bookingChangeButton).toHaveClass(
      'bg-white/90',
      'border',
      'border-gray-200',
      'shadow-sm'
    );
    expect(bookingCancelButton).toHaveClass(
      'bg-white/90',
      'border',
      'border-gray-200',
      'shadow-sm'
    );
  });
});
