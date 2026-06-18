/**
 * @jest-environment jsdom
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminDashboardNotifications } from '@/app/(admin)/admin/_components/AdminDashboardNotifications';
import type { Notification } from '@/hooks/useNotifications';

const notifications: Notification[] = [
  {
    id: 'webhard-1',
    type: 'file_uploaded',
    category: 'webhard',
    title: '새 파일 업로드',
    message: 'sample.dxf 업로드',
    metadata: { link: '/webhard?folderId=folder-1' },
    is_read: false,
    read_at: null,
    created_at: '2026-05-15T00:00:00.000Z',
  },
  {
    id: 'work-1',
    type: 'worker_note_added',
    category: 'work-management',
    title: '작업 메모 추가',
    message: '현장 확인 필요',
    metadata: { link: '/admin/work-management?contactId=contact-1' },
    is_read: false,
    read_at: null,
    created_at: '2026-05-15T00:01:00.000Z',
  },
];

describe('AdminDashboardNotifications', () => {
  it('대시보드에서 알림을 카테고리별로 전환해 볼 수 있다', async () => {
    const user = userEvent.setup();
    render(
      <AdminDashboardNotifications
        notifications={notifications}
        unreadSummary={{ all: 2, webhard: 1, integration: 0, workManagement: 1 }}
      />
    );

    expect(screen.getByRole('heading', { name: '알림' })).toBeInTheDocument();
    expect(screen.getByText('새 파일 업로드')).toBeInTheDocument();
    expect(screen.getByText('작업 메모 추가')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /웹하드/ }));

    const list = screen.getByRole('list', { name: '대시보드 알림 목록' });
    expect(within(list).getByText('새 파일 업로드')).toBeInTheDocument();
    expect(within(list).queryByText('작업 메모 추가')).toBeNull();
  });
});
