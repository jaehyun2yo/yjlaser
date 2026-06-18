/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { IntegrationNav } from '@/app/(admin)/admin/integration/_components/IntegrationNav';

jest.mock('next/navigation', () => ({
  usePathname: () => '/admin/integration/companies',
}));

describe('IntegrationNav', () => {
  it('통합관리에서 불필요한 대시보드/재고/납품/현장작업 탭을 노출하지 않는다', () => {
    render(<IntegrationNav />);

    expect(screen.queryByRole('link', { name: /대시보드/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /재고관리/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /납품관리/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /현장작업/ })).toBeNull();

    expect(screen.getByRole('link', { name: /업체관리/ })).toHaveAttribute(
      'href',
      '/admin/integration/companies'
    );
    expect(screen.getByRole('link', { name: /예약관리/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /작업자관리/ })).toBeInTheDocument();
  });
});
