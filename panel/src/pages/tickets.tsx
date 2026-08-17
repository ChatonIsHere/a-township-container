import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Deliberately not implemented. See the card below and docs/tavern-panel.md.
export function TicketsPage() {
    return (
        <div className="flex max-w-2xl flex-col gap-4">
            <div className="flex items-center gap-3">
                <h1 className="text-2xl text-primary">Tickets</h1>
                <Badge variant="outline">not available yet</Badge>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Why this page is empty</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                    <p>
                        Support tickets were a TavernLauncher feature: players file and read tickets through the
                        launcher's auth port (1762), and on Windows the launcher process itself answered those
                        requests and stored them in tickets.json.
                    </p>
                    <p>
                        On a headless server, TavernLib answers port 1762 instead, and its AuthManager currently
                        handles logins, pings, whitelist applications and the mods list, but not the ticket_action
                        request type. Client ticket requests against this server go unanswered, so there is nothing
                        for this page to show yet.
                    </p>
                    <p>What it needs, in order:</p>
                    <ol className="list-decimal space-y-1 pl-5">
                        <li>
                            TavernLib: implement ticket_action (create, list_mine, respond, close) in AuthManager,
                            writing tickets.json in the launcher's existing shape, with the same credential check,
                            per-user limits and cooldown. The Python reference implementation is data_store.py in
                            TavernLauncher, around 140 lines.
                        </li>
                        <li>
                            Panel: a tickets page over tickets.json in tavern-config, listing open tickets with a
                            thread view, owner replies and a resolve button. Straightforward once the file exists.
                        </li>
                    </ol>
                </CardContent>
            </Card>
        </div>
    );
}
