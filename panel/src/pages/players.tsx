import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Player } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function PlayersPage() {
    const queryClient = useQueryClient();
    const [notice, setNotice] = useState("");
    const [editing, setEditing] = useState<Player | null>(null);
    const [editUserId, setEditUserId] = useState("");
    const [editRoles, setEditRoles] = useState("");
    const [confirmAction, setConfirmAction] = useState<{ title: string; body: string; run: () => void } | null>(null);

    const players = useQuery({ queryKey: ["players"], queryFn: () => api.get<Player[]>("/api/players") });

    function refresh() {
        void queryClient.invalidateQueries({ queryKey: ["players"] });
    }

    const kick = useMutation({
        mutationFn: ({ name, ban }: { name: string; ban: boolean }) =>
            api.post<{ ok: boolean; text: string }>(`/api/players/${encodeURIComponent(name)}/kick`, { ban }),
        onSuccess: res => {
            setNotice(res.text);
            refresh();
        },
        onError: err => setNotice((err as Error).message),
    });

    const update = useMutation({
        mutationFn: ({ name, body }: { name: string; body: Record<string, unknown> }) =>
            api.put<{ ok: boolean }>(`/api/players/${encodeURIComponent(name)}`, body),
        onSuccess: () => {
            setNotice("Saved.");
            refresh();
        },
        onError: err => setNotice((err as Error).message),
    });

    const resetAll = useMutation({
        mutationFn: () => api.post<{ ok: boolean; count: number }>("/api/players/reset-tokens"),
        onSuccess: res => {
            setNotice(`Cleared tokens for ${res.count} player(s). Their next login reclaims the name.`);
            refresh();
        },
        onError: err => setNotice((err as Error).message),
    });

    function openEdit(player: Player) {
        setEditing(player);
        setEditUserId(String(player.user_id));
        setEditRoles(player.roles.join(", "));
    }

    function saveEdit() {
        if (!editing) return;
        const body: Record<string, unknown> = {
            roles: editRoles.split(",").map(r => r.trim()).filter(Boolean),
        };
        const id = Number(editUserId.trim());
        if (Number.isFinite(id)) body.user_id = id;
        update.mutate({ name: editing.username, body });
        setEditing(null);
    }

    return (
        <div className="flex max-w-5xl flex-col gap-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl text-primary">Players</h1>
                <Button
                    variant="destructive"
                    onClick={() =>
                        setConfirmAction({
                            title: "Reset all tokens",
                            body: "Every player token is cleared. The next login with each username is accepted and saved as the new token. Useful after a server reset. This cannot be undone.",
                            run: () => resetAll.mutate(),
                        })
                    }
                >
                    Reset all tokens
                </Button>
            </div>
            {notice && <p className="text-sm text-info">{notice}</p>}
            <p className="text-sm text-muted-foreground">
                Roles are free text read by TavernLib in game. It recognises moderator, owner and fly.
            </p>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>User ID</TableHead>
                        <TableHead>Roles</TableHead>
                        <TableHead>Registered from</TableHead>
                        <TableHead>Token</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {(players.data ?? []).map(player => (
                        <TableRow key={player.username}>
                            <TableCell className="font-mono">{player.username}</TableCell>
                            <TableCell className="font-mono tabular-nums">{player.user_id}</TableCell>
                            <TableCell>
                                <div className="flex flex-wrap gap-1">
                                    {player.roles.map(role => (
                                        <Badge key={role} variant="amber">
                                            {role}
                                        </Badge>
                                    ))}
                                </div>
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground">{player.registered_from}</TableCell>
                            <TableCell>
                                <Badge variant={player.has_token ? "secondary" : "outline"}>
                                    {player.has_token ? "set" : "cleared"}
                                </Badge>
                            </TableCell>
                            <TableCell>
                                <div className="flex justify-end gap-1">
                                    <Button size="sm" variant="secondary" onClick={() => openEdit(player)}>
                                        Edit
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() =>
                                            setConfirmAction({
                                                title: `Reset token for ${player.username}`,
                                                body: "Their token is cleared, and the next login with this username is accepted and saved as the new token. This is how a player recovers a lost token file.",
                                                run: () => update.mutate({ name: player.username, body: { reset_token: true } }),
                                            })
                                        }
                                    >
                                        Reset token
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() =>
                                            setConfirmAction({
                                                title: `Kick ${player.username}`,
                                                body: "They are removed from the server but can rejoin.",
                                                run: () => kick.mutate({ name: player.username, ban: false }),
                                            })
                                        }
                                    >
                                        Kick
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() =>
                                            setConfirmAction({
                                                title: `Kick and ban ${player.username}`,
                                                body: "They are kicked and their username is added to the blacklist.",
                                                run: () => kick.mutate({ name: player.username, ban: true }),
                                            })
                                        }
                                    >
                                        Ban
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {players.data?.length === 0 && (
                <p className="text-sm text-muted-foreground">Nobody has joined this server yet.</p>
            )}

            <Dialog open={editing !== null} onOpenChange={open => !open && setEditing(null)}>
                <DialogContent>
                    <DialogTitle>Edit {editing?.username}</DialogTitle>
                    <DialogDescription>
                        Changing the user ID maps this username to a different save file.
                    </DialogDescription>
                    <div className="mt-4 flex flex-col gap-3">
                        <Label htmlFor="edit-user-id">User ID</Label>
                        <Input id="edit-user-id" value={editUserId} onChange={e => setEditUserId(e.target.value)} />
                        <Label htmlFor="edit-roles">Roles (comma separated)</Label>
                        <Input
                            id="edit-roles"
                            value={editRoles}
                            onChange={e => setEditRoles(e.target.value)}
                            placeholder="moderator, fly"
                        />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="secondary">Cancel</Button>
                        </DialogClose>
                        <Button onClick={saveEdit}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={confirmAction !== null} onOpenChange={open => !open && setConfirmAction(null)}>
                <DialogContent>
                    <DialogTitle>{confirmAction?.title}</DialogTitle>
                    <DialogDescription>{confirmAction?.body}</DialogDescription>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="secondary">Cancel</Button>
                        </DialogClose>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                confirmAction?.run();
                                setConfirmAction(null);
                            }}
                        >
                            Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
