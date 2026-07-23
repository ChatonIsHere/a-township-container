import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MetricChart } from "@/components/MetricChart"
import { useMetrics } from "@/lib/useMetrics"
import {
  formatKBPerSec,
  formatMB,
  formatMBPerSec,
  formatNumber,
  formatPercent,
} from "@/lib/format"

const RANGES = [
  { key: "24h", label: "Past 24 hours" },
  { key: "3d", label: "Past 3 days" },
  { key: "7d", label: "Past week" },
  { key: "30d", label: "Past month" },
]

export default function App() {
  const [rangeKey, setRangeKey] = useState("24h")
  const { data, connected, loading } = useMetrics(rangeKey)

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="mx-auto w-full max-w-[2400px] px-6 py-6 sm:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-medium">A Township Container</h1>
            <p className="text-sm text-muted-foreground">Resource monitoring</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={connected ? "default" : "destructive"} className="gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {connected ? "Live" : "Reconnecting…"}
            </Badge>
            <Tabs value={rangeKey} onValueChange={setRangeKey}>
              <TabsList>
                {RANGES.map((r) => (
                  <TabsTrigger key={r.key} value={r.key}>
                    {r.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </header>

        <div
          className={`grid grid-cols-1 gap-4 transition-opacity duration-150 md:grid-cols-2 xl:grid-cols-3 ${
            loading ? "opacity-60" : "opacity-100"
          }`}
        >
          <MetricChart
            title="CPU usage"
            data={data}
            rangeKey={rangeKey}
            series={[{ key: "cpu_percent", label: "CPU", color: "var(--chart-1)" }]}
            valueFormatter={formatPercent}
          />
          <MetricChart
            title="Memory usage"
            data={data}
            rangeKey={rangeKey}
            series={[{ key: "mem_bytes", label: "Memory", color: "var(--chart-1)" }]}
            valueFormatter={formatMB}
          />
          <MetricChart
            title="Network throughput"
            data={data}
            rangeKey={rangeKey}
            series={[
              { key: "net_rx_bytes_per_sec", label: "RX", color: "var(--chart-1)" },
              { key: "net_tx_bytes_per_sec", label: "TX", color: "var(--chart-2)" },
            ]}
            valueFormatter={formatKBPerSec}
          />
          <MetricChart
            title="Disk I/O"
            data={data}
            rangeKey={rangeKey}
            series={[
              { key: "disk_read_bytes_per_sec", label: "Read", color: "var(--chart-1)" },
              { key: "disk_write_bytes_per_sec", label: "Write", color: "var(--chart-2)" },
            ]}
            valueFormatter={formatMBPerSec}
          />
          <MetricChart
            title="Players online"
            data={data}
            rangeKey={rangeKey}
            series={[{ key: "players_online", label: "Players", color: "var(--chart-1)" }]}
            valueFormatter={(v) => formatNumber(v, 0)}
            stepped
          />
          <MetricChart
            title="Host load average"
            data={data}
            rangeKey={rangeKey}
            series={[
              { key: "load_avg_1m", label: "1m", color: "var(--chart-1)" },
              { key: "load_avg_5m", label: "5m", color: "var(--chart-2)" },
              { key: "load_avg_15m", label: "15m", color: "var(--chart-3)" },
            ]}
            valueFormatter={(v) => formatNumber(v, 2)}
          />
        </div>
      </div>
    </div>
  )
}
