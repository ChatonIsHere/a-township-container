import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Hammer } from "lucide-react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginPage() {
    const queryClient = useQueryClient();
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            await api.post("/api/login", { password });
            await queryClient.invalidateQueries();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="flex h-screen items-center justify-center">
            <Card className="w-80">
                <CardHeader className="items-center text-center">
                    <Hammer className="mx-auto h-8 w-8 text-primary" />
                    <CardTitle>Tavern Panel</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={submit} className="flex flex-col gap-3">
                        <Label htmlFor="password">Panel password</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoFocus
                        />
                        {error && <p className="text-sm text-destructive">{error}</p>}
                        <Button type="submit" disabled={busy || !password}>
                            {busy ? "Checking" : "Log in"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
