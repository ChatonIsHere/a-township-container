import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, type Status } from "./api";
import { Layout } from "./components/layout";
import { AccessPage } from "./pages/access";
import { ConsolePage } from "./pages/console";
import { DashboardPage } from "./pages/dashboard";
import { LoginPage } from "./pages/login";
import { ModsPage } from "./pages/mods";
import { PlayersPage } from "./pages/players";
import { SettingsPage } from "./pages/settings";
import { TicketsPage } from "./pages/tickets";

export default function App() {
    const status = useQuery({
        queryKey: ["status"],
        queryFn: () => api.get<Status>("/api/status"),
        refetchInterval: 5000,
    });

    if (status.error instanceof ApiError && status.error.status === 401) {
        return <LoginPage />;
    }
    if (status.isPending) {
        return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading</div>;
    }
    if (status.error) {
        return (
            <div className="flex h-screen items-center justify-center text-destructive">
                Panel backend unreachable: {status.error.message}
            </div>
        );
    }

    return (
        <Routes>
            <Route element={<Layout status={status.data} />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/console" element={<ConsolePage />} />
                <Route path="/players" element={<PlayersPage />} />
                <Route path="/access" element={<AccessPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/mods" element={<ModsPage />} />
                <Route path="/tickets" element={<TicketsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}
