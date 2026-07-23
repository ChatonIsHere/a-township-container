import { useEffect, useRef, useState } from "react"

export interface MetricRow {
  time: string
  cpu_percent: number | null
  mem_bytes: number | null
  net_rx_bytes_per_sec: number | null
  net_tx_bytes_per_sec: number | null
  disk_read_bytes_per_sec: number | null
  disk_write_bytes_per_sec: number | null
  players_online: number | null
  load_avg_1m: number | null
  load_avg_5m: number | null
  load_avg_15m: number | null
}

export const RANGE_MS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
}

// must mirror the bucket widths the backend aggregates each range to
// (server/index.js RANGES) - live points get snapped to the same grid so
// the live tail doesn't look like raw noise spliced onto averaged history
export const RANGE_BUCKET_MS: Record<string, number> = {
  "24h": 60 * 1000,
  "3d": 5 * 60 * 1000,
  "7d": 15 * 60 * 1000,
  "30d": 60 * 60 * 1000,
}

function bucketStart(iso: string, bucketMs: number): number {
  return Math.floor(new Date(iso).getTime() / bucketMs) * bucketMs
}

export function useMetrics(rangeKey: string) {
  const [data, setData] = useState<MetricRow[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const rangeMsRef = useRef(RANGE_MS[rangeKey])
  const bucketMsRef = useRef(RANGE_BUCKET_MS[rangeKey])

  useEffect(() => {
    rangeMsRef.current = RANGE_MS[rangeKey]
    bucketMsRef.current = RANGE_BUCKET_MS[rangeKey]
  }, [rangeKey])

  // (re)load history whenever the selected range changes - clear the old
  // range's data immediately so a stale, differently-scaled series never
  // stays on screen while the new range is loading
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setData([])
    fetch(`/api/metrics?range=${rangeKey}`)
      .then((r) => r.json())
      .then((rows: MetricRow[]) => {
        if (!cancelled) setData(rows)
      })
      .catch((e) => console.error("failed to fetch metrics", e))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [rangeKey])

  // one persistent websocket for the life of the page - new points get
  // snapped into the current range's bucket grid (replacing the last point
  // if it falls in the same bucket, otherwise appended as a new one) and
  // anything older than the current range's window is trimmed so the
  // series keeps scrolling forward instead of growing unbounded
  useEffect(() => {
    let ws: WebSocket | undefined
    let cancelled = false
    let retryTimer: number | undefined

    function connect() {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
      ws = new WebSocket(`${proto}//${window.location.host}/ws`)

      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
        if (!cancelled) retryTimer = window.setTimeout(connect, 2000)
      }
      ws.onerror = () => ws?.close()
      ws.onmessage = (event) => {
        try {
          const row: MetricRow = JSON.parse(event.data)
          const cutoff = Date.now() - rangeMsRef.current
          const bucketMs = bucketMsRef.current
          const rowBucket = bucketStart(row.time, bucketMs)
          setData((prev) => {
            const last = prev[prev.length - 1]
            const next =
              last && bucketStart(last.time, bucketMs) === rowBucket
                ? [...prev.slice(0, -1), row]
                : [...prev, row]
            return next.filter((r) => new Date(r.time).getTime() >= cutoff)
          })
        } catch (e) {
          console.error("bad ws message", e)
        }
      }
    }
    connect()

    return () => {
      cancelled = true
      if (retryTimer) window.clearTimeout(retryTimer)
      ws?.close()
    }
  }, [])

  return { data, connected, loading }
}
