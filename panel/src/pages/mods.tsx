import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type InstalledMod, type ModSummary, type ModsResponse } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ENTRY_RE = /^[^@\s/\\:]+\.[^@\s/\\:]+(@\d+\.\d+\.\d+)?$/;

function entryId(entry: string): string {
    return entry.split("@")[0];
}

function entryVersion(entry: string): string | null {
    return entry.includes("@") ? entry.split("@")[1] : null;
}

function latestVersion(versions: string[]): string {
    const parse = (v: string) => v.split(".").map(n => Number(n) || 0);
    return [...versions]
        .sort((a, b) => {
            const [pa, pb] = [parse(a), parse(b)];
            for (let i = 0; i < 3; i++) {
                if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
            }
            return 0;
        })
        .at(-1) ?? "";
}

// what the reconciler will do for this entry on the next boot
function pendingAction(entry: string, installed: InstalledMod[] | null): string {
    if (!installed) return "";
    const current = installed.find(m => !m.untracked && m.name.toLowerCase() === entryId(entry).toLowerCase());
    const pinned = entryVersion(entry);
    if (!current) return "installs on restart";
    if (pinned && current.version !== pinned) return `changes to ${pinned} on restart`;
    if (!current.enabled) return "re-enables on restart";
    return pinned ? "installed" : "installed, tracks latest";
}

export function ModsPage() {
    const queryClient = useQueryClient();
    const [notice, setNotice] = useState("");
    const [mods, setMods] = useState<string[] | null>(null);
    const [addEntry, setAddEntry] = useState("");
    const [repoUrl, setRepoUrl] = useState("");
    const [search, setSearch] = useState("");

    const state = useQuery({ queryKey: ["mods"], queryFn: () => api.get<ModsResponse>("/api/mods") });
    const index = useQuery({ queryKey: ["mods-index"], queryFn: () => api.get<ModSummary[]>("/api/mods/index") });

    useEffect(() => {
        if (state.data && mods === null) setMods(state.data.modslist.mods);
    }, [state.data, mods]);

    const saved = state.data?.modslist.mods ?? [];
    const dirty = mods !== null && JSON.stringify(mods) !== JSON.stringify(saved);

    // anything enabled on the server that the desired list no longer covers gets disabled at boot
    const willDisable = useMemo(() => {
        const desired = new Set((mods ?? []).map(entryId).map(id => id.toLowerCase()));
        return (state.data?.installed ?? [])
            .filter(m => !m.untracked && m.enabled && !desired.has(m.name.toLowerCase()))
            .map(m => m.name);
    }, [mods, state.data?.installed]);

    function refresh() {
        void queryClient.invalidateQueries({ queryKey: ["mods"] });
    }

    const saveList = useMutation({
        mutationFn: (list: string[]) => api.put<{ ok: boolean }>("/api/mods/list", { mods: list }),
        onSuccess: () => {
            setNotice("Mod list saved. Restart the server to apply it.");
            refresh();
        },
        onError: err => setNotice((err as Error).message),
    });

    const action = useMutation({
        mutationFn: ({ url, body }: { url: string; body?: unknown }) =>
            api.post<{ ok: boolean; text?: string }>(url, body),
        onSuccess: res => {
            setNotice(res.text ?? "Done.");
            refresh();
            void queryClient.invalidateQueries({ queryKey: ["mods-index"] });
        },
        onError: err => setNotice((err as Error).message),
    });

    const installed = state.data?.installed ?? null;
    const untracked = (installed ?? []).filter(m => m.untracked);
    const dependencies = (installed ?? []).filter(
        m => !m.untracked && !(mods ?? []).some(e => entryId(e).toLowerCase() === m.name.toLowerCase()),
    );

    const filteredIndex = (index.data ?? []).filter(mod => {
        if (!mod.server_side) return false;
        const q = search.toLowerCase();
        return (
            !q ||
            mod.id.toLowerCase().includes(q) ||
            mod.name.toLowerCase().includes(q) ||
            mod.author.toLowerCase().includes(q) ||
            mod.description.toLowerCase().includes(q)
        );
    });

    return (
        <div className="flex max-w-5xl flex-col gap-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl text-primary">Mods</h1>
                <div className="flex gap-2">
                    <Button
                        variant="secondary"
                        onClick={() => action.mutate({ url: "/api/mods/cleanup" })}
                        disabled={!state.data?.online}
                    >
                        Clean up disabled
                    </Button>
                    <Button onClick={() => mods && saveList.mutate(mods)} disabled={!dirty}>
                        Save mod list
                    </Button>
                </div>
            </div>
            {notice && <p className="text-sm text-info">{notice}</p>}
            {!state.data?.online && (
                <p className="text-sm text-muted-foreground">
                    Server is offline. The desired list can still be edited, live state and toggles need the server up.
                </p>
            )}
            {dirty && <p className="text-sm text-primary">Unsaved changes.</p>}

            <Card>
                <CardHeader>
                    <CardTitle>Desired mods</CardTitle>
                    <CardDescription>
                        TavernLib installs this list, with dependencies, every time the server boots. Entries are
                        Author.Mod for latest, or Author.Mod@1.2.0 to pin a version.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    <div className="flex gap-2">
                        <Input
                            value={addEntry}
                            onChange={e => setAddEntry(e.target.value)}
                            placeholder="Author.Mod or Author.Mod@1.2.0"
                            spellCheck={false}
                        />
                        <Button
                            onClick={() => {
                                const entry = addEntry.trim();
                                if (!ENTRY_RE.test(entry)) {
                                    setNotice("Entries must look like Author.Mod or Author.Mod@1.2.0");
                                    return;
                                }
                                setMods([...(mods ?? []).filter(e => entryId(e) !== entryId(entry)), entry]);
                                setAddEntry("");
                            }}
                            disabled={!addEntry.trim()}
                        >
                            Add
                        </Button>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Entry</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(mods ?? []).map(entry => (
                                <TableRow key={entry}>
                                    <TableCell className="font-mono">{entry}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {pendingAction(entry, installed)}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end">
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => setMods((mods ?? []).filter(e => e !== entry))}
                                            >
                                                Remove
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    {mods?.length === 0 && <p className="text-sm text-muted-foreground">No mods desired.</p>}
                    {willDisable.length > 0 && (
                        <p className="text-sm text-destructive">
                            Enabled on the server but not in this list, disables on restart: {willDisable.join(", ")}
                        </p>
                    )}
                    {dependencies.length > 0 && willDisable.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                            Also installed as dependencies: {dependencies.map(d => `${d.name} ${d.version}`).join(", ")}.
                            Dependencies stay as long as something in the list needs them.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Untracked mods</CardTitle>
                    <CardDescription>
                        Files in Mods/ this manager did not install. Toggles apply on the next restart. Managed mods
                        are controlled by the list above instead.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {untracked.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {installed ? "No untracked mods." : "Needs the server online."}
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Kind</TableHead>
                                    <TableHead>State</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {untracked.map(mod => (
                                    <TableRow key={mod.name}>
                                        <TableCell className="font-mono">{mod.name}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{mod.kind}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={mod.enabled ? "success" : "outline"}>
                                                {mod.enabled ? "enabled" : "disabled"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-end">
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() =>
                                                        action.mutate({
                                                            url: "/api/mods/toggle",
                                                            body: { name: mod.name, enable: !mod.enabled },
                                                        })
                                                    }
                                                >
                                                    {mod.enabled ? "Disable" : "Enable"}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Browse community mods</CardTitle>
                    <CardDescription>Server-side mods from your configured repositories.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mods" />
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {filteredIndex.map(mod => {
                            const inList = (mods ?? []).some(e => entryId(e).toLowerCase() === mod.id.toLowerCase());
                            return (
                                <div key={mod.id} className="flex flex-col gap-2 rounded-md border border-border bg-secondary/40 p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="font-serif text-primary">{mod.name}</div>
                                            <div className="font-mono text-xs text-muted-foreground">
                                                {mod.id} {mod.versions.length > 0 && `(latest ${latestVersion(mod.versions)})`}
                                            </div>
                                        </div>
                                        <Button size="sm" disabled={inList} onClick={() => setMods([...(mods ?? []), mod.id])}>
                                            {inList ? "In list" : "Add"}
                                        </Button>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{mod.description}</p>
                                    <div className="flex flex-wrap gap-1">
                                        {mod.client_side && <Badge variant="info">client</Badge>}
                                        {mod.server_side && <Badge variant="success">server</Badge>}
                                        <Badge variant={mod.parity_required ? "amber" : "outline"}>
                                            {mod.parity_required ? "clients must match" : "optional for clients"}
                                        </Badge>
                                        <Badge variant="outline">{mod.source}</Badge>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {index.isPending && <p className="text-sm text-muted-foreground">Fetching repositories</p>}
                    {index.data && filteredIndex.length === 0 && (
                        <p className="text-sm text-muted-foreground">Nothing matches.</p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Repositories</CardTitle>
                    <CardDescription>
                        Sources this server may pull mods from. Adding one you have not vetted means trusting its
                        author with code that runs on your server.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    <div className="flex gap-2">
                        <Input
                            value={repoUrl}
                            onChange={e => setRepoUrl(e.target.value)}
                            placeholder="https://raw.githubusercontent.com/user/repo/main"
                            spellCheck={false}
                        />
                        <Button
                            onClick={() => {
                                action.mutate({ url: "/api/mods/repos", body: { url: repoUrl.trim() } });
                                setRepoUrl("");
                            }}
                            disabled={!repoUrl.trim()}
                        >
                            Add repo
                        </Button>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Shorthand</TableHead>
                                <TableHead>URL</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(state.data?.repos ?? []).map(repo => (
                                <TableRow key={repo.url}>
                                    <TableCell className="font-mono">{repo.shorthand}</TableCell>
                                    <TableCell className="font-mono text-xs text-muted-foreground">{repo.url}</TableCell>
                                    <TableCell>
                                        <div className="flex justify-end">
                                            {repo.removable ? (
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() =>
                                                        action.mutate({
                                                            url: "/api/mods/repos/remove",
                                                            body: { reference: repo.shorthand },
                                                        })
                                                    }
                                                >
                                                    Remove
                                                </Button>
                                            ) : (
                                                <Badge variant="outline">default</Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
