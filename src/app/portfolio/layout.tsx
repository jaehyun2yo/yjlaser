// Build-time SSG 시 NestJS API 호출 회피 — portfolio 모든 페이지 일괄 적용
export const dynamic = 'force-dynamic';

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return <div data-portfolio-page="true">{children}</div>;
}
