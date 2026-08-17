import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { api, type Status } from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

function uptime(bootedAt: number | null): string {
    if (!bootedAt) return "-";
    const s = Math.floor((Date.now() - bootedAt) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function DashboardPage() {
    const queryClient = useQueryClient();
    const status = useQuery({ queryKey: ["status"], queryFn: () => api.get<Status>("/api/status") });
    const [notice, setNotice] = useState("");

    const restart = useMutation({
        mutationFn: () => api.post<{ ok: boolean }>("/api/server/restart"),
        onSuccess: () => {
            setNotice("World saved, server is going down. The container restarts it automatically.");
            void queryClient.invalidateQueries({ queryKey: ["status"] });
        },
        onError: err => setNotice((err as Error).message),
    });

    const s = status.data;
    return (
        <div className="flex max-w-4xl flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl text-primary">Dashboard</h1>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="destructive" disabled={!s?.online}>
                            Restart server
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogTitle>Restart server</DialogTitle>
                        <DialogDescription>
                            The world is saved first, then the server quits and the container brings it back up.
                            Players are disconnected. Mod list changes apply on this restart.
                        </DialogDescription>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button variant="secondary">Cancel</Button>
                            </DialogClose>
                            <DialogClose asChild>
                                <Button variant="destructive" onClick={() => restart.mutate()}>
                                    Save and restart
                                </Button>
                            </DialogClose>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {notice && <p className="text-sm text-info">{notice}</p>}

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Server</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                        <Badge variant={s?.online ? "success" : "outline"} className="w-fit">
                            {s?.online ? "Online" : "Offline"}
                        </Badge>
                        <span className="truncate font-mono text-sm">{s?.serverName}</span>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Players</CardTitle>
                    </CardHeader>
                    <CardContent className="font-mono text-2xl tabular-nums">
                        {s?.playerCount ?? "-"}
                        <span className="text-base text-muted-foreground"> / {s?.playerLimit ?? "-"}</span>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Uptime</CardTitle>
                    </CardHeader>
                    <CardContent className="font-mono text-2xl tabular-nums">{uptime(s?.bootedAt ?? null)}</CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Applications</CardTitle>
                    </CardHeader>
                    <CardContent className="font-mono text-2xl tabular-nums">{s?.pendingApplications ?? 0}</CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                    <ul className="list-disc space-y-1 pl-5">
                        <li>Uptime counts from when the panel could reach the game console, not from container start.</li>
                        <li>Player counts come from TavernLib and go stale within a minute of the server stopping.</li>
                        <li>Mod changes on the Mods page only take effect after a restart.</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}
