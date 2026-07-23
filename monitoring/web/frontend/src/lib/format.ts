// fixed-unit formatters - unlike an auto-scaling B/KB/MB/GB formatter, these
// never change units partway through a chart, which is what actually causes
// the Y-axis tick width (and wrapping/cropping) to jump around
export function formatMB(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-"
  return `${(value / (1024 * 1024)).toFixed(0)} MB`
}

export function formatKBPerSec(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-"
  return `${(value / 1024).toFixed(1)} KB/s`
}

export function formatMBPerSec(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-"
  return `${(value / (1024 * 1024)).toFixed(1)} MB/s`
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "-"
  return `${value.toFixed(1)}%`
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return "-"
  return value.toFixed(decimals)
}

export function formatTimeTick(value: number | string, rangeKey: string): string {
  const d = new Date(value)
  if (rangeKey === "24h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}
