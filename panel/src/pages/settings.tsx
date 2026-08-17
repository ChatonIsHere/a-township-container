import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Settings } from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const REGIONS = ["unknown", "EU", "NA", "SA", "Asia", "Oceania", "Africa"];

export function SettingsPage() {
    const queryClient = useQueryClient();
    const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/api/settings") });
    const [form, setForm] = useState<Settings | null>(null);
    const [password, setPassword] = useState("");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        if (settings.data && !form) setForm(settings.data);
    }, [settings.data, form]);

    const save = useMutation({
        mutationFn: (body: Record<string, unknown>) => api.put<Settings>("/api/settings", body),
        onSuccess: data => {
            queryClient.setQueryData(["settings"], data);
            setForm(data);
            setPassword("");
            setNotice("Saved. The name, whitelist and password apply to new joins immediately.");
            void queryClient.invalidateQueries({ queryKey: ["status"] });
        },
        onError: err => setNotice((err as Error).message),
    });

    if (!form) return <p className="text-muted-foreground">Loading</p>;

    const set = (patch: Partial<Settings>) => setForm({ ...form, ...patch });

    return (
        <div className="flex max-w-2xl flex-col gap-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl text-primary">Settings</h1>
                <Button onClick={() => save.mutate({ ...form })}>Save settings</Button>
            </div>
            {notice && <p className="text-sm text-info">{notice}</p>}

            <Card>
                <CardHeader>
                    <CardTitle>Server</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="name">Server name</Label>
                        <Input id="name" value={form.name} maxLength={32} onChange={e => set({ name: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="max-players">Max players</Label>
                        <Input
                            id="max-players"
                            value={String(form.max_players)}
                            onChange={e => set({ max_players: Number(e.target.value) || 0 })}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="region">Region</Label>
                        <select
                            id="region"
                            value={form.region}
                            onChange={e => set({ region: e.target.value })}
                            className="h-9 rounded-md border border-input bg-secondary px-2 font-mono text-sm"
                        >
                            {REGIONS.map(region => (
                                <option key={region} value={region}>
                                    {region}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <Label htmlFor="hostname">Public hostname (optional)</Label>
                        <Input
                            id="hostname"
                            value={form.public_hostname}
                            placeholder="myserver.com"
                            onChange={e => set({ public_hostname: e.target.value })}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Toggles</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(
                        [
                            ["whitelist_enabled", "Enable whitelist"],
                            ["enforce_ip_limit", "Limit accounts per IP"],
                            ["community_listed", "List on community browser"],
                            ["quest_scene", "Quest scene"],
                        ] as const
                    ).map(([key, label]) => (
                        <label key={key} className="flex items-center justify-between gap-3 text-sm">
                            {label}
                            <Switch checked={form[key]} onCheckedChange={checked => set({ [key]: checked })} />
                        </label>
                    ))}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Password</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">
                        {form.password_set ? "A join password is set." : "No join password is set."}
                    </p>
                    <div className="flex gap-2">
                        <Input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="New password"
                        />
                        <Button onClick={() => save.mutate({ ...form, password })} disabled={!password}>
                            Set
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => save.mutate({ ...form, clear_password: true })}
                            disabled={!form.password_set}
                        >
                            Remove
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Auto reboot</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    <label className="flex items-center justify-between gap-3 text-sm">
                        Enable scheduled restarts (saves the world first)
                        <Switch
                            checked={form.auto_reboot_enabled}
                            onCheckedChange={checked => set({ auto_reboot_enabled: checked })}
                        />
                    </label>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        <label className="flex items-center gap-2">
                            <input
                                type="radio"
                                checked={form.auto_reboot_mode === "time"}
                                onChange={() => set({ auto_reboot_mode: "time" })}
                            />
                            Daily at
                        </label>
                        <Input
                            className="w-14 text-center"
                            value={String(form.auto_reboot_hour)}
                            onChange={e => set({ auto_reboot_hour: Number(e.target.value) || 0 })}
                        />
                        :
                        <Input
                            className="w-14 text-center"
                            value={String(form.auto_reboot_minute)}
                            onChange={e => set({ auto_reboot_minute: Number(e.target.value) || 0 })}
                        />
                        <label className="ml-4 flex items-center gap-2">
                            <input
                                type="radio"
                                checked={form.auto_reboot_mode === "interval"}
                                onChange={() => set({ auto_reboot_mode: "interval" })}
                            />
                            Every
                        </label>
                        <Input
                            className="w-14 text-center"
                            value={String(form.auto_reboot_interval)}
                            onChange={e => set({ auto_reboot_interval: Number(e.target.value) || 0 })}
                        />
                        hours
                    </div>
                    <p className="text-xs text-muted-foreground">
                        The schedule runs in the panel, so keep the panel container running for it to fire.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
