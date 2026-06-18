import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import HeroPackageStructureSection from '@/components/home/HeroPackageStructureSection';

export default function HomePageV2() {
  return (
    <main className="min-h-screen scroll-smooth bg-stone-50">
      <HeroPackageStructureSection />
      <section
        data-header-theme="dark"
        className="min-h-[72svh] border-t border-neutral-950/10 bg-neutral-950 px-4 py-8 text-white sm:px-6 lg:px-8"
        style={{ backgroundColor: 'rgb(10, 10, 10)', color: 'rgb(255, 255, 255)' }}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-5 pr-36 sm:flex-row sm:items-center sm:justify-between lg:pr-44">
          <div>
            <p className="text-sm font-semibold uppercase tracking-normal text-brand">
              YJ Laser Mold
            </p>
            <p className="mt-2 text-xl font-bold tracking-normal sm:text-2xl">
              도면의 선 하나가 패키지 완성도를 만듭니다
            </p>
          </div>
          <Link
            href="/about"
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 transition-colors hover:text-white"
          >
            회사 소개 보기
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </main>
  );
}
