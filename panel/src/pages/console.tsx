import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type CommandTable } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SCROLLBACK_LIMIT = 1500;

export function ConsolePage() {
    const [lines, setLines] = useState<string[]>([]);
    const [connected, setConnected] = useState(false);
    const [input, setInput] = useState("");
    const [selected, setSelected] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    const commands = useQuery({
        queryKey: ["commands"],
        queryFn: () => api.get<CommandTable>("/api/commands"),
        staleTime: Infinity,
    });

    useEffect(() => {
        const proto = window.location.protocol === "https:" ? "wss" : "ws";
        const ws = new WebSocket(`${proto}://${window.location.host}/ws/console`);
        wsRef.current = ws;
        ws.onmessage = event => {
            const msg = JSON.parse(event.data);
            if (msg.type === "history") {
                setLines(msg.lines);
                setConnected(msg.connected);
            } else if (msg.type === "line") {
                setLines(prev => [...prev, ...String(msg.text).split("\n")].slice(-SCROLLBACK_LIMIT));
            } else if (msg.type === "status") {
                setConnected(msg.connected);
            }
        };
        ws.onclose = () => setConnected(false);
        return () => ws.close();
    }, []);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [lines]);

    const matches = useMemo(() => {
        const text = input.trimStart().toLowerCase();
        if (!text || !commands.data) return [];
        const found = Object.keys(commands.data).filter(c => c.startsWith(text));
        return found.length === 1 && found[0] === text ? [] : found;
    }, [input, commands.data]);

    useEffect(() => {
        setSelected(0);
        setDismissed(false);
    }, [input]);

    const showList = matches.length > 0 && !dismissed;

    function send() {
        const content = input.trim();
        if (!content) return;
        wsRef.current?.send(JSON.stringify({ content }));
        setInput("");
    }

    function accept(index: number) {
        if (matches[index]) setInput(matches[index] + " ");
    }

    function onKeyDown(e: React.KeyboardEvent) {
        if (showList) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected(s => Math.min(matches.length - 1, s + 1));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected(s => Math.max(0, s - 1));
            } else if (e.key === "Tab" || e.key === "Enter") {
                e.preventDefault();
                accept(selected);
            } else if (e.key === "Escape") {
                setDismissed(true);
            }
        } else if (e.key === "Enter") {
            e.preventDefault();
            send();
        }
    }

    function lineClass(line: string): string {
        if (line.startsWith("> ")) return "text-info";
        if (line.startsWith("[error]")) return "text-destructive";
        // MelonLoader log lines start with a [HH:MM:SS.mmm] timestamp
        if (/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]/.test(line)) {
            return /\[(ERROR|error)\]|ERROR/.test(line) ? "text-destructive/80" : "text-muted-foreground";
        }
        if (line.startsWith("[")) return "text-muted-foreground";
        return "";
    }

    return (
        <div className="flex h-[calc(100vh-3rem)] max-w-5xl flex-col gap-3">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl text-primary">Console</h1>
                <Badge variant={connected ? "success" : "outline"}>{connected ? "Connected" : "Disconnected"}</Badge>
            </div>
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto rounded-md border border-border bg-card p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap"
            >
                {lines.map((line, i) => (
                    <div key={i} className={lineClass(line)}>
                        {line}
                    </div>
                ))}
            </div>
            <div className="relative">
                {showList && (
                    <div className="absolute bottom-full left-0 z-10 mb-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover font-mono text-[13px] shadow-lg">
                        {matches.map((match, i) => {
                            const params = commands.data?.[match] ?? [];
                            return (
                                <button
                                    key={match}
                                    className={cn(
                                        "block w-full px-3 py-1 text-left cursor-pointer",
                                        i === selected ? "bg-accent text-accent-foreground" : "hover:bg-secondary",
                                    )}
                                    onMouseDown={e => {
                                        e.preventDefault();
                                        accept(i);
                                    }}
                                >
                                    {match}
                                    {params.length > 0 && (
                                        <span className="text-muted-foreground"> [{params.join(", ")}]</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
                <div className="flex gap-2">
                    <Input
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder={connected ? "Type a command" : "Console disconnected"}
                        disabled={!connected}
                        autoFocus
                        spellCheck={false}
                    />
                    <Button onClick={send} disabled={!connected || !input.trim()}>
                        Send
                    </Button>
                </div>
            </div>
        </div>
    );
}
