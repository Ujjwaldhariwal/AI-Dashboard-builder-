// Component: Button
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { AlertCircle, Check, LoaderCircle } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent px-4 text-sm font-semibold ring-offset-background transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out hover:border-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:pointer-events-none disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 data-[state=loading]:cursor-wait data-[state=error]:border-destructive data-[state=error]:bg-destructive/10 data-[state=error]:text-destructive data-[state=success]:border-emerald-600/30 data-[state=success]:bg-emerald-600/10 data-[state=success]:text-emerald-700 dark:data-[state=success]:text-emerald-300',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        neon: 'bg-primary text-primary-foreground hover:bg-primary/90',
        glass: 'border-border bg-background text-foreground hover:bg-accent',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 min-h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-6',
        icon: 'h-10 w-10 px-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  isLoading?: boolean
  status?: 'idle' | 'error' | 'success'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      status = 'idle',
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button'
    const state = isLoading ? 'loading' : status
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        aria-busy={isLoading || undefined}
        data-state={state}
        disabled={asChild ? undefined : disabled || isLoading}
        {...props}
      >
        {!asChild && isLoading ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : null}
        {!asChild && !isLoading && status === 'error' ? (
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
        ) : null}
        {!asChild && !isLoading && status === 'success' ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : null}
        {children}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
