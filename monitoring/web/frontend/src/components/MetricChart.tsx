import { useId, useMemo } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatTimeTick } from "@/lib/format"
import type { MetricRow } from "@/lib/useMetrics"

interface Series {
  key: keyof MetricRow
  label: string
  color: string
}

interface MetricChartProps {
  title: string
  data: MetricRow[]
  series: Series[]
  rangeKey: string
  valueFormatter: (value: number) => string
  stepped?: boolean
}

export function MetricChart({
  title,
  data,
  series,
  rangeKey,
  valueFormatter,
  stepped = false,
}: MetricChartProps) {
  const gradientId = useId()
  const config = series.reduce<ChartConfig>((acc, s) => {
    acc[s.key as string] = { label: s.label, color: s.color }
    return acc
  }, {})

  // numeric epoch-ms axis instead of a categorical string one, so points
  // are spaced by actual elapsed time (not just evenly by index) - a
  // categorical axis is what made sparse/gappy ranges look wrong
  const chartData = useMemo(
    () => data.map((d) => ({ ...d, t: new Date(d.time).getTime() })),
    [data]
  )
  const hasData = useMemo(
    () => data.some((d) => series.some((s) => d[s.key] != null)),
    [data, series]
  )

  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-normal text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2">
        {hasData ? (
          <ChartContainer config={config} className="aspect-auto h-75 w-full">
            <AreaChart data={chartData} margin={{ left: 4, right: 12, top: 16, bottom: 0 }}>
              <defs>
                {series.map((s) => (
                  <linearGradient
                    key={s.key as string}
                    id={`${gradientId}-${String(s.key)}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor={s.color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} strokeOpacity={0.15} />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                scale="time"
                tickFormatter={(v) => formatTimeTick(v, rangeKey)}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
                fontSize={11}
              />
              <YAxis
                tickFormatter={(v) => valueFormatter(v)}
                tickLine={false}
                axisLine={false}
                width={64}
                fontSize={11}
                domain={[0, "auto"]}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(v) => formatTimeTick(Number(v), rangeKey)}
                    formatter={(value, name) => [
                      ` ${valueFormatter(Number(value))}`,
                      config[name as string]?.label ?? name,
                    ]}
                  />
                }
              />
              {series.map((s) => (
                <Area
                  key={s.key as string}
                  dataKey={s.key as string}
                  type={stepped ? "stepAfter" : "monotone"}
                  stroke={s.color}
                  strokeWidth={1.75}
                  fill={`url(#${gradientId}-${String(s.key)})`}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </AreaChart>
          </ChartContainer>
        ) : (
          <div className="flex h-75 w-full items-center justify-center text-sm text-muted-foreground">
            Not enough data yet
          </div>
        )}
      </CardContent>
    </Card>
  )
}
