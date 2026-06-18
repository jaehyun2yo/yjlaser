'use client';

import Image from 'next/image';
import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import styles from '@/components/home/SpringSummerHome.module.css';

type WorkItem = {
  title: string;
  client: string;
  description: string;
  image: string;
};

type Capability = {
  title: string;
  body: string;
};

const works: WorkItem[] = [
  {
    title: 'Cosmetic rigid box',
    client: 'Premium package',
    description: '정밀 칼선과 샘플링으로 화장품 패키지의 구조 안정성을 빠르게 검증합니다.',
    image: '/images/box-shapes/c1-box.png',
  },
  {
    title: 'E-commerce mailer',
    client: 'Fulfillment ready',
    description: '배송 충격과 조립성을 함께 고려한 택배형 지기구조를 설계합니다.',
    image: '/images/box-shapes/tuck.png',
  },
  {
    title: 'Display package',
    client: 'Retail fixture',
    description: '진열, 접힘, 접착 동선을 한 번에 맞춘 POP 패키지 목형을 제작합니다.',
    image: '/images/box-shapes/shopping.png',
  },
  {
    title: 'Industrial insert',
    client: 'Protective detail',
    description: '제품별 유격과 재질을 반영해 생산 현장에서 바로 쓰는 내장재를 만듭니다.',
    image: '/images/box-shapes/pvc.png',
  },
];

const capabilities: Capability[] = [
  {
    title: 'Structural design',
    body: '패키지 목적, 종이 두께, 접착 방식까지 포함해 지기구조를 설계합니다.',
  },
  {
    title: 'Laser mold cutting',
    body: '정밀 레이저 장비로 목형 오차를 줄이고 반복 생산 품질을 안정화합니다.',
  },
  {
    title: 'Sample and revision',
    body: '샘플 확인, 수정, 납품까지 빠르게 이어지는 실무형 제작 흐름을 운영합니다.',
  },
];

const clientSegments = [
  'COSMETIC',
  'FOOD',
  'PHARMA',
  'E-COMMERCE',
  'DISPLAY',
  'EXPORT',
  'LUXURY',
  'FMCG',
  'STARTUP',
  'RETAIL',
  'INDUSTRIAL',
  'SEASONAL',
  'GIFT',
  'BEVERAGE',
  'TEXTILE',
  'STATIONERY',
  'PET CARE',
  'K-BRAND',
];

const sectionMotion = {
  hidden: { opacity: 0, y: 42 },
  visible: { opacity: 1, y: 0 },
};

export default function SpringSummerHome() {
  const prefersReducedMotion = useReducedMotion();
  const [isBooting, setIsBooting] = useState(true);
  const [email, setEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] = useState<'idle' | 'sent'>('idle');
  const workRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion) {
      setIsBooting(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsBooting(false);
    }, 1100);

    return () => window.clearTimeout(timeoutId);
  }, [prefersReducedMotion]);

  const scrollWorkRow = (direction: 'previous' | 'next') => {
    const row = workRowRef.current;
    if (!row) return;

    row.scrollBy({
      left: direction === 'next' ? 620 : -620,
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  };

  const handleNewsletterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim()) return;
    setNewsletterStatus('sent');
  };

  return (
    <main className={`${styles.homeSurface} min-h-screen overflow-x-hidden scroll-smooth bg-[#e5ebda] text-[#44394c]`}>
      <motion.div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-[#e5ebda]"
        initial={false}
        animate={isBooting ? { opacity: 1 } : { opacity: 0, pointerEvents: 'none' }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.42 }}
        aria-hidden={!isBooting}
      >
        <p className={`${styles.displayLoader} max-w-[8ch]`}>
          YJ
          <br />
          LASER
        </p>
      </motion.div>

      <section
        id="top"
        data-header-theme="light"
        className="mx-auto min-h-[112svh] max-w-[1440px] px-5 pb-24 pt-28 md:px-8 lg:px-10"
      >
        <div className="grid min-h-[88svh] grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)] lg:items-center">
          <motion.div
            variants={sectionMotion}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0"
          >
            <p className="mb-8 max-w-3xl text-sm leading-[1.5] tracking-[0.023em] text-[#44394c]">
              Seoul based laser mold and package structure studio. We turn dielines, material
              details, and production constraints into precise packaging tools.
            </p>
            <h1 className={`${styles.displayHero} max-w-[6.9ch]`}>
              New
              <br />
              Mold
              <br />
              Work
            </h1>
          </motion.div>

          <motion.article
            initial={{ opacity: 0, y: 56 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="relative self-end rounded-[4px] bg-white p-5"
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-[4px] bg-white">
              <video
                src="/videos/laser-cutting.mp4"
                className="h-full w-full object-cover grayscale"
                autoPlay
                muted
                loop
                playsInline
              />
              <div className="absolute bottom-5 left-5 max-w-[260px] rounded-[4px] bg-white p-4 text-sm leading-[1.45] tracking-[0.023em]">
                2004부터 이어진 레이저 목형 제작, 박스 구조 설계, 샘플 검수.
              </div>
            </div>
          </motion.article>
        </div>
      </section>

      <section
        id="what-we-do"
        data-header-theme="light"
        className="mx-auto max-w-[1440px] px-5 py-20 md:px-8 lg:px-10"
      >
        <motion.div
          variants={sectionMotion}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-120px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="grid gap-10 border-t border-[#c0c3b6] pt-16 lg:grid-cols-[0.36fr_1fr]"
        >
          <p className="text-xs leading-[1.2] tracking-[0.02em]">What we do</p>
          <div className="space-y-14">
            <p className={`${styles.subheading} max-w-3xl`}>
              From first dieline to production-ready laser mold, we help packaging teams make
              quieter, cleaner, more reliable structural decisions.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {capabilities.map((capability) => (
                <article key={capability.title} className="rounded-[4px] bg-white p-5">
                  <h2 className={`${styles.displayEditorial} mb-12`}>
                    {capability.title}
                  </h2>
                  <p className="text-sm leading-[1.5] tracking-[0.023em]">{capability.body}</p>
                </article>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      <section
        id="our-work"
        data-header-theme="light"
        className="mx-auto max-w-[1440px] overflow-hidden px-5 py-20 md:px-8 lg:px-10"
      >
        <div className="mb-5 flex items-end justify-between gap-8 border-t border-[#c0c3b6] pt-16">
          <div>
            <p className="mb-6 text-xs leading-[1.2] tracking-[0.02em]">Our work</p>
            <h2 className={styles.displaySection}>
              Project cards
            </h2>
          </div>
          <div className="flex shrink-0 gap-5 text-sm tracking-[0.023em]" aria-label="작업 캐러셀 제어">
            <button type="button" onClick={() => scrollWorkRow('previous')} aria-label="이전 작업 보기">
              ←
            </button>
            <button type="button" onClick={() => scrollWorkRow('next')} aria-label="다음 작업 보기">
              →
            </button>
          </div>
        </div>

        <div
          ref={workRowRef}
          role="region"
          aria-label="주요 작업 캐러셀"
          className="-mx-5 flex snap-x gap-5 overflow-x-auto px-5 pb-4 [scrollbar-width:none] md:-mx-8 md:px-8 lg:-mx-10 lg:px-10 [&::-webkit-scrollbar]:hidden"
        >
          {works.map((work) => (
            <Link
              key={work.title}
              href="/portfolio"
              className="group relative h-[620px] min-w-[82vw] snap-start overflow-hidden rounded-[4px] bg-white md:min-w-[620px]"
            >
              <Image
                src={work.image}
                alt={work.title}
                fill
                sizes="(min-width: 768px) 620px, 82vw"
                className="object-contain p-10 transition duration-500 group-hover:scale-[1.025]"
              />
              <div className="absolute bottom-5 left-5 max-w-[310px] rounded-[4px] bg-white p-5">
                <p className="text-sm leading-[1.3] tracking-[0.023em]">{work.title}</p>
                <p className="mt-1 text-sm leading-[1.3] tracking-[0.023em] text-[#44394c]/70">
                  {work.client}
                </p>
                <p className="mt-4 text-sm leading-[1.5] tracking-[0.023em]">{work.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section
        id="clients"
        data-header-theme="light"
        className="mx-auto max-w-[1440px] px-5 py-20 md:px-8 lg:px-10"
      >
        <div className="grid gap-10 border-t border-[#c0c3b6] pt-16 lg:grid-cols-[0.36fr_1fr]">
          <p className="text-xs leading-[1.2] tracking-[0.02em]">Clients we help in 2026</p>
          <div>
            <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
              {clientSegments.map((segment) => (
                <div
                  key={segment}
                  className="flex aspect-[1.55] items-center justify-center rounded-[4px] bg-white px-3 text-center text-sm leading-[1.2] tracking-[0.023em]"
                >
                  {segment}
                </div>
              ))}
            </div>
            <p className="mt-16 max-w-[720px] text-lg leading-[1.4] tracking-[0.02em]">
              With two decades of production experience, we help teams move from rough package
              ideas to clean dielines, working samples, and dependable laser molds.
            </p>
          </div>
        </div>
      </section>

      <section
        id="about-us"
        data-header-theme="light"
        className="mx-auto max-w-[1440px] px-5 py-20 md:px-8 lg:px-10"
      >
        <div className="grid gap-10 border-t border-[#c0c3b6] pt-16 lg:grid-cols-[0.36fr_1fr]">
          <p className="text-xs leading-[1.2] tracking-[0.02em]">About us</p>
          <div className="space-y-16">
            <h2 className={`${styles.displayEditorial} max-w-[7.2ch]`}>
              Lasting first impressions
            </h2>
            <div className="grid gap-5 md:grid-cols-[0.8fr_1fr]">
              <div className="relative h-[420px] overflow-hidden rounded-[4px] bg-white">
                <video
                  src="/videos/laser-cutting.mp4"
                  className="h-full w-full object-cover grayscale"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              </div>
              <div className="relative h-[420px] overflow-hidden rounded-[4px] bg-white">
                <Image
                  src="/images/box-shapes/b-box.png"
                  alt="박스 목형 샘플"
                  fill
                  sizes="(min-width: 768px) 50vw, 90vw"
                  className="object-contain p-10"
                />
              </div>
            </div>
            <p className="max-w-[720px] text-lg leading-[1.4] tracking-[0.02em]">
              We specialize in package structures, laser molds, samples, and production-ready
              dielines. Our process connects designers, manufacturers, and brand teams without
              losing the small details.
            </p>
          </div>
        </div>

        <div className="mt-24 grid gap-10 border-t border-[#c0c3b6] pt-16 lg:grid-cols-[0.36fr_1fr]">
          <p className="text-xs leading-[1.2] tracking-[0.02em]">Send us your thoughts</p>
          <div>
            <h2 className={`${styles.displayEditorial} max-w-[8ch]`}>
              Can we help you?
            </h2>
            <form onSubmit={handleNewsletterSubmit} className="mt-12 max-w-[720px]">
              <div className="flex items-end gap-5">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="type your email"
                  inputSize="lg"
                  className="rounded-[4px] border-0 border-b border-[#b0b2a9] bg-transparent px-0 text-sm tracking-[0.023em] text-[#44394c] placeholder:text-[#44394c]/65 focus:border-[#44394c] focus:ring-0"
                  aria-label="뉴스레터 이메일"
                />
                <button
                  type="submit"
                  className="pb-3 text-sm tracking-[0.023em]"
                  aria-label="뉴스레터 신청"
                >
                  →
                </button>
              </div>
              {newsletterStatus === 'sent' && (
                <p className="mt-4 text-sm leading-[1.5] tracking-[0.023em]">
                  Saved locally for this prototype.
                </p>
              )}
            </form>
            <div className="mt-14 flex flex-wrap gap-5 text-sm leading-[1.5] tracking-[0.023em]">
              <Link href="/contact" className="underline underline-offset-4">
                Write us →
              </Link>
              <a href="tel:+82222648070" className="underline underline-offset-4">
                +82 2 2264 8070
              </a>
              <span>퇴계로39길 20, 서울</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
