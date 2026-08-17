import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
    return (
        <TabsPrimitive.List
            className={cn("inline-flex h-9 items-center gap-1 rounded-md border border-border bg-secondary p-1", className)}
            {...props}
        />
    );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
    return (
        <TabsPrimitive.Trigger
            className={cn(
                "inline-flex items-center rounded-sm px-3 py-1 text-sm text-muted-foreground cursor-pointer",
                "data-[state=active]:bg-accent data-[state=active]:text-accent-foreground",
                className,
            )}
            {...props}
        />
    );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
    return <TabsPrimitive.Content className={cn("mt-4 focus-visible:outline-none", className)} {...props} />;
}
