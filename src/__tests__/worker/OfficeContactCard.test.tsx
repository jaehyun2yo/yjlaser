/**
 * OfficeContactCard 테스트 (Phase 4: 생성시간 표시)
 * - created_at이 Worker 카드 전용 포맷으로 렌더되는지
 * - 생성시간이 다운로드 아이콘 왼쪽에 표시되는지
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import OfficeContactCard from '@/app/worker/_components/OfficeContactCard';
import type { Contact } from '@/lib/types/contact';

// 무거운 자식 컴포넌트는 stub으로 교체 (이 테스트의 관심사는 생성시간 렌더링)
jest.mock('@/app/worker/_components/OfficeAdvanceButton', () => ({
  __esModule: true,
  default: () => <div data-testid="office-advance-button" />,
}));
jest.mock('@/components/contacts/InquiryClassifyButtons', () => ({
  InquiryClassifyButtons: () => <div data-testid="inquiry-classify-buttons" />,
}));
jest.mock('@/app/worker/_components/ConfirmModal', () => ({
  ConfirmModal: () => null,
}));
jest.mock('@/app/worker/_components/WorkerDrawingUpload', () => ({
  WorkerDrawingUpload: () => null,
}));
jest.mock('@/app/(admin)/admin/contacts/_components/InquiryTypeBadge', () => ({
  InquiryTypeBadge: () => <div data-testid="inquiry-type-badge" />,
}));
jest.mock('@/components/ContactTimeline', () => ({
  ContactTimeline: () => <div data-testid="contact-timeline" />,
}));
jest.mock('@/lib/hooks/useContactTimeline', () => ({
  useContactTimeline: () => ({
    expanded: false,
    toggle: jest.fn(),
    entries: [],
    isLoading: false,
  }),
}));
jest.mock('@/app/actions/contacts', () => ({
  toggleStageCompleted: jest.fn(),
  advanceSplitGroupStage: jest.fn(),
}));
jest.mock('@/app/worker/_lib/downloadFiles', () => ({
  downloadContactFile: jest.fn(),
  downloadLatestDrawing: jest.fn(),
}));

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'test-contact-001',
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
    process_stage: 'drawing',
    created_at: '2026-03-23T09:03:00',
    updated_at: '2026-03-23T09:03:00',
    source: 'webhard',
    inquiry_type: 'cutting_request',
    ...overrides,
  } as Contact;
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
  Wrapper.displayName = 'TestQueryWrapper';
  return Wrapper;
}

describe('OfficeContactCard — 생성시간 표시', () => {
  it('created_at을 YY년 M월 D일 오전/오후 H시 m분 포맷으로 렌더한다', () => {
    const contact = makeContact({ created_at: '2026-05-12T10:57:00' });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    expect(screen.getByText('26년 5월 12일 오전 10시 57분')).toBeInTheDocument();
  });

  it('webhard_folder_path 있을 때: 생성시간은 경로 줄이 아니라 다운로드 아이콘 왼쪽에 렌더된다', () => {
    const contact = makeContact({
      webhard_folder_path: '/거래처/테스트업체',
      created_at: '2026-05-12T10:57:00',
      inquiry_number: '260511-O-001',
      work_number: '260511-F-010',
      webhard_folder_id: 'folder-001',
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    const pathEl = screen.getByText('/거래처/테스트업체');
    const timeEl = screen.getByText('26년 5월 12일 오전 10시 57분');
    const numberEl = screen.getByText('260511-O-001 / 260511-F-010');
    const downloadButton = screen.getByTitle('작업 파일 다운로드');
    expect(pathEl.parentElement).not.toBe(timeEl.parentElement);
    expect(timeEl.parentElement).not.toBe(numberEl.parentElement);
    expect(timeEl.nextElementSibling).toBe(downloadButton);
    expect(timeEl).toHaveAttribute('data-testid', 'worker-contact-created-at-test-contact-001');
    expect(timeEl).toHaveClass('text-gray-500');
    expect(timeEl.parentElement).toHaveClass('mt-5');
    expect(timeEl.parentElement?.parentElement).toHaveClass('items-start');
    expect(timeEl.parentElement?.parentElement).not.toHaveClass('grid');
    expect(pathEl).not.toHaveClass('flex-1');
  });

  it('webhard_folder_path 없을 때도 생성시간이 렌더된다', () => {
    const contact = makeContact({
      webhard_folder_path: null,
      created_at: '2026-05-12T10:57:00',
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    expect(screen.getByText('26년 5월 12일 오전 10시 57분')).toBeInTheDocument();
    // 경로는 없어야 함
    expect(screen.queryByText('/거래처/테스트업체')).toBeNull();
  });

  it('문의번호 메타는 사무실번호 / 현장번호 형식으로 렌더된다', () => {
    const contact = makeContact({
      inquiry_number: '260511-O-001',
      work_number: '260511-F-010',
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    expect(screen.getByText('260511-O-001 / 260511-F-010')).toBeInTheDocument();
  });

  it('현장번호가 없으면 사무실번호만 렌더하고 구분자는 숨긴다', () => {
    const contact = makeContact({
      inquiry_number: '260511-O-001',
      work_number: null,
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    expect(screen.getByText('260511-O-001')).toBeInTheDocument();
    expect(screen.queryByText('260511-O-001 /')).toBeNull();
  });
});

describe('OfficeContactCard — 긴급 overlay', () => {
  it('is_urgent=true 일 때 루트 컨테이너에 bg-red-500 이 적용되지 않는다 (overlay 전용)', () => {
    const contact = makeContact({ is_urgent: true });
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    const root = container.firstChild as HTMLElement;
    expect(root.className).not.toContain('bg-red-500');
    expect(root.className).toContain('bg-white');
  });

  it('is_urgent=true 일 때 긴급 배지(Siren + "긴급" 텍스트)가 렌더된다', () => {
    const contact = makeContact({ is_urgent: true });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    const badge = screen.getByTestId('urgent-badge');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-error');
    expect(badge.className).toContain('text-white');
    expect(badge).toHaveTextContent('긴급');
    // Siren 아이콘 (lucide SVG) 렌더 확인
    expect(badge.querySelector('svg')).not.toBeNull();
  });

  it('is_urgent=false 일 때 긴급 배지가 렌더되지 않는다', () => {
    const contact = makeContact({ is_urgent: false });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    expect(screen.queryByTestId('urgent-badge')).toBeNull();
  });
});

describe('OfficeContactCard — 카드 파일명 표시 형식', () => {
  it('업체명 - 파일명 형식으로 렌더하고 inquiry_title은 표시명에 포함하지 않는다', () => {
    const contact = makeContact({
      company_name: '테스트업체',
      inquiry_title: '박스패키지-001',
      drawing_file_name: 'design.dxf',
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    const fileName = screen.getByTestId('worker-contact-file-name-test-contact-001');
    expect(fileName).toHaveTextContent('테스트업체 - design.dxf');
    expect(fileName).toHaveClass('font-normal');
    expect(fileName.querySelector('span:first-child')).toHaveClass('font-bold');
    expect(fileName.querySelector('span:last-child')).toHaveClass('font-normal');
    expect(screen.queryByText(/박스패키지-001/)).toBeNull();
  });

  it('이미 번호와 업체명이 붙은 drawing_file_name은 카드에서 파일명만 남긴다', () => {
    const contact = makeContact({
      company_name: '테스트업체',
      inquiry_number: '260518-O-001',
      inquiry_title: null,
      drawing_file_name: '260518-O-001 - 테스트업체 - 화면 캡처.png',
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    expect(screen.getByTestId('worker-contact-file-name-test-contact-001')).toHaveTextContent(
      '테스트업체 - 화면 캡처.png'
    );
  });

  it('drawing_file_name = null 일 때: "파일 없음" fallback 렌더', () => {
    const contact = makeContact({
      company_name: '테스트업체',
      inquiry_title: '박스패키지-001',
      drawing_file_name: null,
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    expect(screen.getByTestId('worker-contact-file-name-test-contact-001')).toHaveTextContent(
      '테스트업체 - 파일 없음'
    );
  });

  it('inquiry_title / drawing_file_name 모두 null 이어도 카드 렌더 실패 없음', () => {
    const contact = makeContact({
      company_name: '테스트업체',
      inquiry_title: null,
      drawing_file_name: null,
    });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    expect(screen.getByTestId('worker-contact-file-name-test-contact-001')).toHaveTextContent(
      '테스트업체 - 파일 없음'
    );
  });
});

describe('OfficeContactCard — 미분류 CTA 노출', () => {
  it('inquiry_type=null → InquiryClassifyButtons 렌더, OfficeAdvanceButton 없음', () => {
    const contact = makeContact({ inquiry_type: null, process_stage: 'drawing' });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    expect(screen.getByTestId('inquiry-classify-buttons')).toBeInTheDocument();
    expect(screen.queryByTestId('office-advance-button')).toBeNull();
  });

  it("inquiry_type='cutting_request' → OfficeAdvanceButton 렌더, 분류 CTA 없음", () => {
    const contact = makeContact({ inquiry_type: 'cutting_request', process_stage: 'drawing' });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    expect(screen.getByTestId('office-advance-button')).toBeInTheDocument();
    expect(screen.queryByTestId('inquiry-classify-buttons')).toBeNull();
  });
});

describe('OfficeContactCard — 새 문의 표시', () => {
  it('hasNewContactNotification=true 일 때 알림창과 같은 빨간점을 표시한다', () => {
    const contact = makeContact({ status: 'drawing' });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
          hasNewContactNotification
        />
      </Wrapper>
    );

    const dot = screen.getByTestId('worker-contact-new-dot-test-contact-001');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass('bg-error');
  });

  it('hasNewContactNotification=false 일 때 새 문의 빨간점을 표시하지 않는다', () => {
    const contact = makeContact({ status: 'drawing' });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    expect(screen.queryByTestId('worker-contact-new-dot-test-contact-001')).toBeNull();
  });

  it("status='received'여도 읽지 않은 알림이 아니면 새 문의 빨간점을 표시하지 않는다", () => {
    const contact = makeContact({ status: 'received' });
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
        />
      </Wrapper>
    );

    expect(screen.queryByTestId('worker-contact-new-dot-test-contact-001')).toBeNull();
  });

  it('카드를 클릭하면 해당 문의 알림을 읽음 처리한다', () => {
    const contact = makeContact({ status: 'drawing' });
    const onMarkNotificationRead = jest.fn();
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
          onMarkNotificationRead={onMarkNotificationRead}
          hasNewContactNotification
        />
      </Wrapper>
    );

    fireEvent.click(container.firstChild as HTMLElement);

    expect(onMarkNotificationRead).toHaveBeenCalledWith('test-contact-001');
  });
});

describe('OfficeContactCard — 알림 이동 강조', () => {
  it('isNotificationHighlighted=true 일 때 카드 루트에 강조 스타일을 적용한다', () => {
    const contact = makeContact({ status: 'drawing' });
    const Wrapper = createWrapper();
    const { container } = render(
      <Wrapper>
        <OfficeContactCard
          contact={contact}
          onAdvance={jest.fn()}
          onAdvanceComplete={jest.fn()}
          isAdvancing={false}
          isNotificationHighlighted
        />
      </Wrapper>
    );

    const root = container.firstChild as HTMLElement;
    expect(root).toHaveAttribute('data-notification-highlighted', 'true');
    expect(root).toHaveClass('border-brand');
    expect(root).toHaveClass('ring-brand');
    expect(root).toHaveClass('bg-brand-light');
  });
});
