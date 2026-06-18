import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-brand hover:bg-brand-hover text-white shadow-md hover:shadow-lg',
        secondary: 'bg-muted hover:bg-muted/80 text-foreground',
        danger: 'bg-error hover:bg-error/90 text-white',
        ghost: 'border border-border hover:bg-accent text-foreground',
        outline: 'border border-brand text-brand hover:bg-brand-light',
        link: 'text-brand hover:text-brand-hover underline-offset-4 hover:underline',
      },
      size: {
        sm: 'text-xs py-2 px-4',
        md: 'text-sm py-3 px-8',
        lg: 'text-base py-4 px-10',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
