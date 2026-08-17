import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type AccessLists, type Application } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ListName = "whitelist" | "blacklist";
type Kind = "username" | "ip";

interface ListTabProps {
    list: ListName;
    hint: string;
    withComments?: boolean;
    access?: AccessLists;
    onAdd: (list: ListName, kind: Kind, value: string) => void;
    onRemove: (list: ListName, kind: Kind, value: string) => void;
    onComment?: (value: string) => void;
}

// module level so re-renders of the page never remount it and eat typed input
function ListTab({ list, hint, withComments, access, onAdd, onRemove, onComment }: ListTabProps) {
    const [kind, setKind] = useState<Kind>("username");
    const [value, setValue] = useState("");
    const doc = access?.[list];
    const rows = doc
        ? [
              ...doc.usernames.map(v => ({ kind: "username" as const, value: v })),
              ...doc.ips.map(v => ({ kind: "ip" as const, value: v })),
          ]
        : [];
    return (
        <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">{hint}</p>
            <div className="flex gap-2">
                <select
                    value={kind}
                    onChange={e => setKind(e.target.value as Kind)}
                    className="h-9 rounded-md border border-input bg-secondary px-2 font-mono text-sm"
                >
                    <option value="username">username</option>
                    <option value="ip">ip</option>
                </select>
                <Input value={value} onChange={e => setValue(e.target.value)} placeholder="Value to allow or block" />
                <Button
                    onClick={() => {
                        onAdd(list, kind, value);
                        setValue("");
                    }}
                    disabled={!value.trim()}
                >
                    Add
                </Button>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Value</TableHead>
                        {withComments && <TableHead>Comment</TableHead>}
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map(row => (
                        <TableRow key={`${row.kind}:${row.value}`}>
                            <TableCell>
                                <Badge variant="outline">{row.kind}</Badge>
                            </TableCell>
                            <TableCell className="font-mono">{row.value}</TableCell>
                            {withComments && (
                                <TableCell className="text-muted-foreground">
                                    {access?.comments[row.value] ?? ""}
                                </TableCell>
                            )}
                            <TableCell>
                                <div className="flex justify-end gap-1">
                                    {withComments && onComment && (
                                        <Button size="sm" variant="secondary" onClick={() => onComment(row.value)}>
                                            Comment
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => onRemove(list, row.kind, row.value)}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

export function AccessPage() {
    const queryClient = useQueryClient();
    const [notice, setNotice] = useState("");
    const [commentTarget, setCommentTarget] = useState<string | null>(null);
    const [commentText, setCommentText] = useState("");

    const access = useQuery({ queryKey: ["access"], queryFn: () => api.get<AccessLists>("/api/access") });
    const applications = useQuery({
        queryKey: ["applications"],
        queryFn: () => api.get<Application[]>("/api/applications"),
        refetchInterval: 15000,
    });

    function refresh() {
        void queryClient.invalidateQueries({ queryKey: ["access"] });
        void queryClient.invalidateQueries({ queryKey: ["applications"] });
        void queryClient.invalidateQueries({ queryKey: ["status"] });
    }

    const mutate = useMutation({
        mutationFn: ({ url, body }: { url: string; body: unknown }) => api.post<{ ok: boolean }>(url, body),
        onSuccess: refresh,
        onError: err => setNotice((err as Error).message),
    });

    const onAdd = (list: ListName, kind: Kind, value: string) =>
        mutate.mutate({ url: "/api/access/entries", body: { list, kind, value } });
    const onRemove = (list: ListName, kind: Kind, value: string) =>
        mutate.mutate({ url: "/api/access/remove", body: { list, kind, value } });
    const onComment = (value: string) => {
        setCommentTarget(value);
        setCommentText(access.data?.comments[value] ?? "");
    };

    return (
        <div className="flex max-w-4xl flex-col gap-4">
            <h1 className="text-2xl text-primary">Access</h1>
            {notice && <p className="text-sm text-destructive">{notice}</p>}
            <Tabs defaultValue="whitelist">
                <TabsList>
                    <TabsTrigger value="whitelist">Whitelist</TabsTrigger>
                    <TabsTrigger value="blacklist">Blacklist</TabsTrigger>
                    <TabsTrigger value="applications">
                        Applications
                        {(applications.data?.length ?? 0) > 0 && (
                            <Badge variant="destructive" className="ml-2">
                                {applications.data?.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="whitelist">
                    <ListTab
                        list="whitelist"
                        withComments
                        hint="When the whitelist is enabled in Settings, only these entries may join. Comments are your own notes."
                        access={access.data}
                        onAdd={onAdd}
                        onRemove={onRemove}
                        onComment={onComment}
                    />
                </TabsContent>
                <TabsContent value="blacklist">
                    <ListTab
                        list="blacklist"
                        hint="Blocked players are rejected at login."
                        access={access.data}
                        onAdd={onAdd}
                        onRemove={onRemove}
                    />
                </TabsContent>
                <TabsContent value="applications">
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-muted-foreground">
                            Join attempts against your whitelisted server. Approving adds both the username and the IP
                            to the whitelist, with the username saved as the IP's comment.
                        </p>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Username</TableHead>
                                    <TableHead>IP</TableHead>
                                    <TableHead>Applied</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(applications.data ?? []).map((request, index) => (
                                    <TableRow key={`${request.username}:${request.ip}`}>
                                        <TableCell className="font-mono">{request.username}</TableCell>
                                        <TableCell className="font-mono">{request.ip}</TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {request.applied_at ? new Date(request.applied_at).toLocaleString() : ""}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    size="sm"
                                                    onClick={() =>
                                                        mutate.mutate({
                                                            url: "/api/applications/resolve",
                                                            body: { index, approve: true },
                                                        })
                                                    }
                                                >
                                                    Approve
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() =>
                                                        mutate.mutate({
                                                            url: "/api/applications/resolve",
                                                            body: { index, approve: false },
                                                        })
                                                    }
                                                >
                                                    Deny
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        {applications.data?.length === 0 && (
                            <p className="text-sm text-muted-foreground">No pending applications.</p>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            <Dialog open={commentTarget !== null} onOpenChange={open => !open && setCommentTarget(null)}>
                <DialogContent>
                    <DialogTitle>Comment for {commentTarget}</DialogTitle>
                    <DialogDescription>Notes only, players never see this.</DialogDescription>
                    <div className="mt-4">
                        <Input value={commentText} onChange={e => setCommentText(e.target.value)} />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="secondary">Cancel</Button>
                        </DialogClose>
                        <Button
                            onClick={() => {
                                mutate.mutate({
                                    url: "/api/access/comment",
                                    body: { value: commentTarget, comment: commentText.trim() },
                                });
                                setCommentTarget(null);
                            }}
                        >
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
