import Link from 'next/link';
import { ArrowRight, Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import styles from '@/styles/HeroSection.module.css';

export function HeroCopy() {
  return (
    <div className={styles.copy}>
      <p className={styles.eyebrow}>
        <Boxes aria-hidden="true" size={16} />
        B2B package structure
      </p>
      <h1 className={styles.title}>
        구조가 정확한 패키지는
        <span>제품의 첫인상을 바꿉니다</span>
      </h1>
      <p className={styles.description}>
        C형 박스 전개도부터 완성품까지 이어지는 3D 설계 경험을 위한 테스트 히어로입니다. 정밀한 목형
        제작과 패키지 구조 설계를 한 화면에서 설명할 수 있도록 확장합니다.
      </p>
      <div className={styles.actions}>
        <Button asChild size="lg">
          <Link href="/contact">
            제작 문의
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/portfolio">제작 사례</Link>
        </Button>
      </div>
    </div>
  );
}
