import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
    {
        variants: {
            variant: {
                default: "border-transparent bg-primary text-primary-foreground",
                secondary: "border-border bg-secondary text-secondary-foreground",
                destructive: "border-destructive/50 text-destructive",
                success: "border-success/50 text-success",
                info: "border-info/50 text-info",
                outline: "border-border text-muted-foreground",
                amber: "border-accent text-accent-foreground",
            },
        },
        defaultVariants: { variant: "default" },
    },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
    return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
