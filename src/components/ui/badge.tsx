import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full text-xs font-medium', {
  variants: {
    variant: {
      success: 'bg-success-light text-success-foreground',
      warning: 'bg-warning-light text-warning-foreground',
      error: 'bg-error-light text-error-foreground',
      info: 'bg-info-light text-info-foreground',
      gray: 'bg-muted text-muted-foreground',
      primary: 'bg-brand-light text-brand',
      purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      notification: 'bg-destructive text-white',
    },
    size: {
      xs: 'px-2 py-0.5 text-[11px]',
      sm: 'px-1.5 py-0.5 text-[10px]',
      md: 'px-2 py-1',
      lg: 'px-2.5 py-1.5',
    },
  },
  defaultVariants: { variant: 'gray', size: 'md' },
});

function Badge({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
