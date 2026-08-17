import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default: "bg-primary text-primary-foreground hover:bg-primary/85",
                secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-accent hover:text-accent-foreground",
                destructive: "bg-destructive/15 text-destructive border border-destructive/50 hover:bg-destructive hover:text-destructive-foreground",
                ghost: "hover:bg-secondary",
                outline: "border border-border bg-transparent hover:bg-secondary",
            },
            size: {
                default: "h-9 px-4 py-2",
                sm: "h-8 px-3 text-xs",
                icon: "h-9 w-9",
            },
        },
        defaultVariants: { variant: "default", size: "default" },
    },
);

// ComponentProps includes ref, which radix Slot needs when this sits under an asChild trigger
export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type, ...props }: ButtonProps) {
    return <button type={type ?? "button"} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
