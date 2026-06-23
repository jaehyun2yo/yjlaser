/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import OperationsPage from '@/app/(admin)/admin/integration/operations/page';

jest.mock('next/navigation', () => ({
  usePathname: () => '/admin/integration/operations',
}));

jest.mock('@/app/(admin)/admin/integration/operations/_components/OperationsDashboard', () => ({
  OperationsDashboard: () => (
    <div>
      <h2>미해결 실패</h2>
      <h2>주문 타임라인</h2>
      <h2>Worker heartbeat</h2>
    </div>
  ),
}));

describe('Integration operations page', () => {
  it('renders the read-only operations entry point under integration admin', () => {
    render(<OperationsPage />);

    expect(screen.getByRole('link', { name: /운영현황/ })).toHaveAttribute(
      'href',
      '/admin/integration/operations'
    );
    expect(screen.getByRole('heading', { name: '운영현황' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '미해결 실패' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '주문 타임라인' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Worker heartbeat' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /재시도|삭제|발송|동기화/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /retry|delete|send|sync/i })).toBeNull();
  });
});
