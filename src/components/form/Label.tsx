'use client';

import { useEffect, useState } from 'react';
import { TEXT_COLOR } from '@/lib/styles';

interface LabelProps {
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  mb?: 'sm' | 'md' | 'lg';
}

export function Label({
  htmlFor,
  required = false,
  children,
  className = '',
  mb = 'md',
}: LabelProps) {
  const [windowWidth, setWindowWidth] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWindowWidth(window.innerWidth);

      const handleResize = () => {
        setWindowWidth(window.innerWidth);
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const isMobile = windowWidth === null ? true : windowWidth < 768;

  const mbClass = {
    sm: 'mb-1.5',
    md: 'mb-2',
    lg: 'mb-3',
  }[mb];

  const baseClasses = `block font-medium ${TEXT_COLOR.primary} ${mbClass} ${
    isMobile ? 'text-xs' : 'text-sm'
  }`;

  return (
    <label htmlFor={htmlFor} className={`${baseClasses} ${className}`}>
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
}
