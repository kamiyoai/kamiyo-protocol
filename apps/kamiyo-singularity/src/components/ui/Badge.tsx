import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-bg-tertiary text-text-secondary",
        primary: "bg-accent-muted text-accent border border-accent-border",
        accent: "bg-accent/10 text-accent border border-accent/20",
        secondary: "bg-bg-secondary text-text-secondary border border-border",
        outline: "border border-border text-text-secondary",
        success: "bg-accent/10 text-accent border border-accent/20",
        danger: "bg-bg-tertiary text-text-secondary border border-border",
        warning: "bg-bg-tertiary text-text-secondary border border-border",
        info: "bg-bg-tertiary text-text-secondary border border-border",
        bid: "bg-bid/10 text-bid border border-bid/20",
        ask: "bg-ask/10 text-ask border border-ask/20",
        muted: "bg-bg-secondary text-text-muted",
        destructive: "bg-bg-tertiary text-text-secondary border border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
