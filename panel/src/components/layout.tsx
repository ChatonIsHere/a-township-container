import { NavLink, Outlet } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Hammer, LayoutDashboard, LogOut, Puzzle, Settings, Shield, Terminal, Ticket, Users } from "lucide-react";
import { api, type Status } from "@/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const links = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/console", label: "Console", icon: Terminal },
    { to: "/players", label: "Players", icon: Users },
    { to: "/access", label: "Access", icon: Shield },
    { to: "/settings", label: "Settings", icon: Settings },
    { to: "/mods", label: "Mods", icon: Puzzle },
    { to: "/tickets", label: "Tickets", icon: Ticket },
];

export function Layout({ status }: { status?: Status }) {
    const queryClient = useQueryClient();

    async function logout() {
        await api.post("/api/logout");
        queryClient.clear();
        window.location.reload();
    }

    return (
        <div className="flex min-h-screen">
            <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
                <div className="flex items-center gap-3 border-l-4 border-primary px-4 py-5">
                    <Hammer className="h-6 w-6 text-primary" />
                    <div>
                        <div className="font-serif text-base font-bold text-primary">The Modding Tavern</div>
                        <div className="text-xs text-muted-foreground">Tavern Panel</div>
                    </div>
                </div>
                <nav className="flex flex-1 flex-col gap-1 p-3">
                    {links.map(link => (
                        <NavLink
                            key={link.to}
                            to={link.to}
                            end={link.to === "/"}
                            className={({ isActive }) =>
                                cn(
                                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground",
                                    isActive && "bg-accent/25 text-accent-foreground",
                                )
                            }
                        >
                            <link.icon className="h-4 w-4" />
                            {link.label}
                            {link.to === "/access" && (status?.pendingApplications ?? 0) > 0 && (
                                <Badge variant="destructive" className="ml-auto">
                                    {status?.pendingApplications}
                                </Badge>
                            )}
                        </NavLink>
                    ))}
                </nav>
                <div className="border-t border-border p-3">
                    <div className="mb-2 flex items-center gap-2 px-3 text-xs text-muted-foreground">
                        <span
                            className={cn("h-2 w-2 rounded-full", status?.online ? "bg-success" : "bg-muted-foreground")}
                        />
                        {status?.online ? "Online" : "Offline"}
                        <span className="ml-auto truncate font-mono">{status?.serverName}</span>
                    </div>
                    <button
                        onClick={logout}
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground cursor-pointer"
                    >
                        <LogOut className="h-4 w-4" />
                        Log out
                    </button>
                </div>
            </aside>
            <main className="min-w-0 flex-1 p-6">
                <Outlet />
            </main>
        </div>
    );
}
