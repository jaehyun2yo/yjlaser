'use client';

import { useRef } from 'react';
import { HeroCanvas } from '@/components/r3f/HeroCanvas';
import { useScrollProgress } from '@/hooks/useScrollProgress';
import styles from '@/styles/HeroSection.module.css';

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const { progress: foldProgress, progressRef: foldProgressRef } = useScrollProgress(sectionRef);

  return (
    <section
      ref={sectionRef}
      className={styles.hero}
      data-scroll-section
      data-hero-variant="r3f-packaging"
      data-fold-progress={foldProgress.toFixed(3)}
    >
      <div className={styles.inner}>
        <div className={styles.visual}>
          <HeroCanvas foldProgressRef={foldProgressRef} />
        </div>
      </div>
    </section>
  );
}
