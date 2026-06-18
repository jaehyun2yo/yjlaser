'use client';

import { motion, useScroll, useTransform, useMotionValue, useSpring } from 'framer-motion';
import Link from 'next/link';
import { FaArrowRight, FaPhone, FaEnvelope } from 'react-icons/fa';
import { useRef, useEffect, useState } from 'react';

// Animation variants - 더 빠른 애니메이션
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 200,
      damping: 20,
    },
  },
};

const slideUpVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 150,
      damping: 20,
    },
  },
};

export default function InquirySection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });

  // 마우스 위치 추적 - 더 적극적인 움직임
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // 빠르고 반응적인 스프링
  const fastSpringConfig = { damping: 20, stiffness: 200 };
  const smoothMouseX = useSpring(mouseX, fastSpringConfig);
  const smoothMouseY = useSpring(mouseY, fastSpringConfig);

  // 느린 스프링 (배경용)
  const slowSpringConfig = { damping: 30, stiffness: 100 };
  const slowMouseX = useSpring(mouseX, slowSpringConfig);
  const slowMouseY = useSpring(mouseY, slowSpringConfig);

  // Intersection Observer
  useEffect(() => {
    if (!sectionRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const handleMouseMove = (e: MouseEvent) => {
      const section = sectionRef.current;
      if (!section) return;

      const rect = section.getBoundingClientRect();
      // 섹션 내에서의 상대 위치 (-0.5 ~ 0.5)
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      // 더 큰 움직임 범위
      mouseX.set(x * 150);
      mouseY.set(y * 150);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY, isVisible]);

  // Parallax transforms
  const orbScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.8, 1.2, 0.9]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0.5, 1, 1, 0.8]);

  return (
    <div ref={containerRef} data-header-theme="dark" className="relative h-[200vh] bg-[#0a0a0a]">
      {/* Sticky 컨테이너 */}
      <div ref={sectionRef} className="sticky top-0 h-screen overflow-hidden z-10">
        {/* Animated Background with Mouse Movement - 은은한 효과 */}
        <div className="absolute inset-0">
          {/* 메인 Orb - 마우스 따라 움직임 (밝기 감소) */}
          <motion.div
            style={{
              scale: orbScale,
              x: smoothMouseX,
              y: smoothMouseY,
            }}
            className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#ED6C00]/15 rounded-full blur-[120px]"
          />

          {/* 두번째 Orb - 반대 방향 (밝기 감소) */}
          <motion.div
            style={{
              scale: orbScale,
              x: useTransform(slowMouseX, (v) => -v * 0.7),
              y: useTransform(slowMouseY, (v) => -v * 0.7),
            }}
            animate={{
              x: [0, 40, -25, 0],
              y: [0, -25, 40, 0],
            }}
            transition={{
              duration: 15,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute bottom-1/4 right-1/4 w-[550px] h-[550px] bg-orange-600/12 rounded-full blur-[130px]"
          />

          {/* 세번째 Orb - 마우스 따라가는 작은 orb (밝기 감소) */}
          <motion.div
            style={{
              x: useTransform(smoothMouseX, (v) => v * 1.2),
              y: useTransform(smoothMouseY, (v) => v * 1.2),
            }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-orange-500/10 rounded-full blur-[100px]"
          />

          {/* Grid Pattern - 마우스에 따라 움직임 (더 은은하게) */}
          <motion.div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              x: useTransform(smoothMouseX, (v) => v * 0.2),
              y: useTransform(smoothMouseY, (v) => v * 0.2),
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
              `,
              backgroundSize: '60px 60px',
            }}
          />

          {/* 상하 페이드 오버레이 */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#0a0a0a] to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
          </div>
        </div>

        <motion.div
          className="relative z-10 h-full flex items-center justify-center px-4 sm:px-6 lg:px-8"
          style={{ opacity: contentOpacity }}
        >
          <motion.div
            className="max-w-5xl mx-auto text-center"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
          >
            {/* Badge */}
            <motion.div variants={itemVariants}>
              <motion.span
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 rounded-full transition-colors"
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                <span className="w-2 h-2 bg-[#ED6C00] rounded-full animate-pulse" />
                <span className="text-white/70 text-sm font-medium tracking-wide">
                  Ready to Start?
                </span>
              </motion.span>
            </motion.div>

            {/* Main Heading */}
            <motion.div variants={slideUpVariants} className="mt-6">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
                <motion.span
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}
                  className="inline-block"
                >
                  새로운 프로젝트를
                </motion.span>
                <br />
                <span className="relative">
                  <motion.span
                    className="text-[#ED6C00]"
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.15 }}
                  >
                    시작
                  </motion.span>
                  <motion.span
                    initial={{ width: 0 }}
                    whileInView={{ width: '100%' }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.25, ease: 'easeOut' }}
                    className="absolute -bottom-2 left-0 h-1 bg-gradient-to-r from-[#ED6C00] to-orange-400 rounded-full"
                  />
                </span>
                <motion.span
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.2 }}
                  className="inline-block"
                >
                  하세요
                </motion.span>
              </h2>
            </motion.div>

            {/* Description */}
            <motion.p
              variants={itemVariants}
              className="mt-6 text-lg md:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed"
            >
              맞춤형 패키지 솔루션으로 귀사의 제품 가치를 높여드립니다.
              <br className="hidden md:block" />
              지금 바로 상담을 시작하세요.
            </motion.p>

            {/* CTA Button */}
            <motion.div variants={slideUpVariants} className="mt-10">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              >
                <Link
                  href="/contact"
                  className="group relative inline-flex items-center gap-3 px-8 py-4 bg-[#ED6C00] text-white text-base font-bold rounded-full overflow-hidden shadow-2xl shadow-orange-500/30 hover:shadow-orange-500/50 transition-all duration-500"
                >
                  {/* Button Background Animation */}
                  <motion.span
                    className="absolute inset-0 bg-gradient-to-r from-orange-600 to-[#ED6C00]"
                    initial={{ opacity: 0 }}
                    whileHover={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  />

                  {/* Button Content */}
                  <span className="relative z-10 flex items-center gap-3">
                    문의하기
                    <span className="flex items-center justify-center w-8 h-8 bg-white/20 rounded-full group-hover:bg-white/30 transition-colors">
                      <FaArrowRight className="w-3 h-3 group-hover:animate-bounce-x" />
                    </span>
                  </span>

                  {/* Hover Ring Effect */}
                  <motion.span
                    className="absolute inset-0 rounded-full border-2 border-white/0"
                    whileHover={{ borderColor: 'rgba(255,255,255,0.3)', scale: 1.05 }}
                    transition={{ duration: 0.3 }}
                  />
                </Link>
              </motion.div>
            </motion.div>

            {/* Quick Contact Info */}
            <motion.div
              variants={itemVariants}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-8 text-white/50"
            >
              <motion.a
                href="tel:02-2268-8070"
                className="group/phone flex items-center gap-3"
                whileHover={{ scale: 1.08, x: 8 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              >
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover/phone:bg-[#ED6C00]/20 group-hover/phone:border-[#ED6C00]/50 transition-colors">
                  <FaPhone className="w-4 h-4 text-[#ED6C00]" />
                </div>
                <span className="text-sm">02-2268-8070</span>
              </motion.a>
              <motion.div
                className="hidden sm:block w-px h-6 bg-white/20"
                initial={{ scaleY: 0 }}
                whileInView={{ scaleY: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: 0.2 }}
              />
              <motion.a
                href="mailto:aone8070@korea.com"
                className="group/email flex items-center gap-3"
                whileHover={{ scale: 1.08, x: 8 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              >
                <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center group-hover/email:bg-[#ED6C00]/20 group-hover/email:border-[#ED6C00]/50 transition-colors">
                  <FaEnvelope className="w-4 h-4 text-[#ED6C00]" />
                </div>
                <span className="text-sm">aone8070@korea.com</span>
              </motion.a>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
