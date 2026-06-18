import { render, screen, fireEvent } from '@testing-library/react';
import { ContactTimeline, ContactTimelineSkeleton } from '@/components/ContactTimeline';
import type { TimelineItem } from '@/lib/types/contact';

function statusItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: overrides.id ?? `status-${Math.random()}`,
    kind: 'status_change',
    createdAt: '2026-04-15T10:30:00.000Z',
    actorType: 'admin',
    actorName: '관리자',
    payload: {
      changeType: 'status',
      fromValue: 'received',
      toValue: 'drawing',
    },
    ...overrides,
  } as TimelineItem;
}

function drawingItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: overrides.id ?? `rev-${Math.random()}`,
    kind: 'drawing_revision',
    createdAt: '2026-04-15T11:00:00.000Z',
    actorType: 'admin',
    actorName: '관리자',
    payload: {
      revisionId: '11111111-1111-1111-1111-111111111111',
      version: 3,
      processStage: 'drawing',
      reason: 'domuson_fit',
      reasonDetail: null,
      files: [
        {
          url: 'https://r2.example.com/foo.dxf',
          name: '도면_v3.dxf',
          size: 102400,
          mimeType: 'application/dxf',
        },
      ],
      isPublic: true,
      note: null,
    },
    ...overrides,
  } as TimelineItem;
}

describe('ContactTimeline', () => {
  test('타임라인 로딩 스켈레톤에 전용 shimmer 애니메이션 클래스를 적용한다', () => {
    render(<ContactTimelineSkeleton rows={2} />);

    const skeleton = screen.getByTestId('timeline-skeleton');
    expect(skeleton).toHaveClass('timeline-skeleton-pulse');
    expect(skeleton.querySelectorAll('.timeline-skeleton-shimmer')).toHaveLength(6);
  });

  test('빈 entries → 안내 문구 표시', () => {
    render(<ContactTimeline entries={[]} />);
    expect(screen.getByText('타임라인 기록이 없습니다.')).toBeInTheDocument();
  });

  test('status_change 항목: 라벨/시간 표시', () => {
    render(<ContactTimeline entries={[statusItem()]} />);
    // "도면작업"은 statusLabels.STATUS_LABELS에 있음
    expect(screen.getByText('도면작업')).toBeInTheDocument();
    // 시간 포맷 (04/15)
    expect(screen.getByText(/04\/15/)).toBeInTheDocument();
  });

  test('drawing_revision 항목: 버전 뱃지 + reason 라벨 + 파일명 표시', () => {
    render(<ContactTimeline entries={[drawingItem()]} />);
    expect(screen.getByText('도면 수정 v3')).toBeInTheDocument();
    expect(screen.getByText('도무송 가공용')).toBeInTheDocument();
    expect(screen.getByText('도면_v3.dxf')).toBeInTheDocument();
  });

  test('파일 1개 → 단일 다운로드 버튼; 파일 2개 → 펼치기 토글 후 개별 다운로드', () => {
    const { rerender } = render(<ContactTimeline entries={[drawingItem()]} />);
    // 1개일 때는 펼치기 버튼이 없어야 함
    expect(screen.queryByTestId('timeline-files-toggle')).toBeNull();
    expect(screen.queryByText('다운로드')).toBeNull();
    expect(screen.getByRole('button', { name: '도면_v3.dxf 다운로드' })).toBeInTheDocument();

    // 2개로 변경
    rerender(
      <ContactTimeline
        entries={[
          drawingItem({
            payload: {
              revisionId: '22222222-2222-2222-2222-222222222222',
              version: 4,
              processStage: 'drawing',
              reason: 'sample_revision',
              reasonDetail: null,
              files: [
                { url: 'a', name: 'A.dxf', size: 100, mimeType: 'application/dxf' },
                { url: 'b', name: 'B.dxf', size: 200, mimeType: 'application/dxf' },
              ],
              isPublic: true,
              note: null,
            },
          }),
        ]}
      />
    );

    const toggle = screen.getByTestId('timeline-files-toggle');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveTextContent(/2개 파일/);
    // 펼치기 전: 파일명 보이지 않음
    expect(screen.queryByText('A.dxf')).toBeNull();

    fireEvent.click(toggle);

    // 펼친 후: 두 파일 모두 보임
    expect(screen.getByText('A.dxf')).toBeInTheDocument();
    expect(screen.getByText('B.dxf')).toBeInTheDocument();
    // 다운로드 텍스트 버튼 대신 파일 행 자체가 다운로드 버튼이다.
    expect(screen.queryByText('다운로드')).toBeNull();
    expect(screen.getByRole('button', { name: 'A.dxf 다운로드' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'B.dxf 다운로드' })).toBeInTheDocument();
  });

  test('createdAt이 빈 문자열/undefined이면 "-" 표시 (NaN 방지)', () => {
    render(
      <ContactTimeline
        entries={[
          statusItem({ id: 'a', createdAt: '' }),
          statusItem({ id: 'b', createdAt: undefined as unknown as string }),
        ]}
      />
    );
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
    // 최소한 NaN/NaN 같은 깨진 포맷이 없어야 함
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  test('isPublic=false 항목에 비공개 Badge 노출 (관리자 UI)', () => {
    render(
      <ContactTimeline
        entries={[
          drawingItem({
            id: 'private-rev',
            payload: {
              revisionId: '33333333-3333-3333-3333-333333333333',
              version: 1,
              processStage: 'drawing',
              reason: 'initial',
              reasonDetail: null,
              files: [],
              isPublic: false,
              note: '관리자 메모',
            },
          }),
        ]}
      />
    );
    expect(screen.getByTestId('timeline-private-badge')).toBeInTheDocument();
    expect(screen.getByText('비공개')).toBeInTheDocument();
  });

  it('renders entries in server-provided order (ASC expected)', () => {
    const entries: TimelineItem[] = [
      {
        id: '1',
        kind: 'status_change',
        createdAt: '2026-04-20T09:00:00Z',
        actorType: 'system',
        actorName: null,
        payload: { changeType: 'created', metadata: { source: 'website' } },
      },
      {
        id: '2',
        kind: 'status_change',
        createdAt: '2026-04-20T11:00:00Z',
        actorType: 'admin',
        actorName: '관리자A',
        payload: { changeType: 'type', toValue: 'cutting_request' },
      },
    ];
    render(<ContactTimeline entries={entries} />);
    const labels = screen.getAllByTestId('timeline-label');
    expect(labels[0]).toHaveTextContent(/문의 접수/);
    expect(labels[1]).toHaveTextContent(/유형 변경/);
  });

  it('shows actorName inline for status_change when showActor=true', () => {
    const entries: TimelineItem[] = [
      {
        id: '1',
        kind: 'status_change',
        createdAt: '2026-04-20T09:00:00Z',
        actorType: 'admin',
        actorName: '관리자A',
        payload: { changeType: 'type', toValue: 'cutting_request' },
      },
    ];
    render(<ContactTimeline entries={entries} compact showActor />);
    expect(screen.getByText(/관리자A/)).toBeInTheDocument();
  });

  it('긴급 처리와 긴급 해제 이력을 actor와 함께 표시한다', () => {
    const entries: TimelineItem[] = [
      {
        id: 'urgent-on',
        kind: 'status_change',
        createdAt: '2026-05-22T04:00:00Z',
        actorType: 'worker',
        actorName: '김재현',
        payload: { changeType: 'urgent_toggle', fromValue: 'normal', toValue: 'urgent' },
      },
      {
        id: 'urgent-off',
        kind: 'status_change',
        createdAt: '2026-05-22T05:00:00Z',
        actorType: 'worker',
        actorName: '김재현',
        payload: { changeType: 'urgent_toggle', fromValue: 'urgent', toValue: 'normal' },
      },
    ];

    render(<ContactTimeline entries={entries} compact showActor />);

    expect(screen.getByText(/긴급 처리/)).toHaveTextContent('김재현');
    expect(screen.getByText(/긴급 해제/)).toHaveTextContent('김재현');
  });

  test('긴 파일명에 truncate 클래스 적용', () => {
    const longName = '아주_매우_길고_긴_도면_파일_이름_1234567890.dxf';
    render(
      <ContactTimeline
        entries={[
          drawingItem({
            payload: {
              revisionId: '44444444-4444-4444-4444-444444444444',
              version: 2,
              processStage: 'drawing',
              reason: 'other',
              reasonDetail: null,
              files: [
                {
                  url: 'https://r2.example.com/long',
                  name: longName,
                  size: 1,
                  mimeType: 'application/dxf',
                },
              ],
              isPublic: true,
              note: null,
            },
          }),
        ]}
      />
    );
    const fileNameNode = screen.getByText(longName);
    expect(fileNameNode).toHaveClass('truncate');
    expect(fileNameNode).toHaveClass('min-w-0');
    expect(fileNameNode).toHaveClass('flex-1');
  });
});
