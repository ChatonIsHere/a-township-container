import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
    return (
        <SwitchPrimitive.Root
            className={cn(
                "inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-border bg-secondary transition-colors cursor-pointer",
                "data-[state=checked]:bg-primary data-[state=checked]:border-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                className,
            )}
            {...props}
        >
            <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-muted-foreground transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-primary-foreground" />
        </SwitchPrimitive.Root>
    );
}
