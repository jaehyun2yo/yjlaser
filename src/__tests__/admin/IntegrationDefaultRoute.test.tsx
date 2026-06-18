/**
 * @jest-environment jsdom
 */

import IntegrationDefaultPage from '@/app/(admin)/admin/integration/page';
import { redirect } from 'next/navigation';

jest.mock('next/navigation', () => ({
  redirect: jest.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

describe('Integration default route', () => {
  it('/admin/integration 기본 진입은 업체관리로 보낸다', () => {
    expect(() => IntegrationDefaultPage()).toThrow('NEXT_REDIRECT:/admin/integration/companies');
    expect(redirect).toHaveBeenCalledWith('/admin/integration/companies');
  });
});
