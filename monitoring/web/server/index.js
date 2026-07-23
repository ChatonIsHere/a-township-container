const path = require("node:path");
const http = require("node:http");
const express = require("express");
const { WebSocketServer } = require("ws");
const { Pool, Client } = require("pg");

const PORT = process.env.PORT || 8080;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "postgres",
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || "metrics",
  user: process.env.POSTGRES_USER || "metrics",
  password: process.env.POSTGRES_PASSWORD || "metrics",
});

// range key -> (how far back to query, bucket width in seconds). Longer
// ranges use wider buckets so the browser never has to render more than a
// few hundred/thousand points regardless of poll interval.
const RANGES = {
  "24h": { interval: "24 hours", bucketSeconds: 60 },
  "3d": { interval: "3 days", bucketSeconds: 300 },
  "7d": { interval: "7 days", bucketSeconds: 900 },
  "30d": { interval: "30 days", bucketSeconds: 3600 },
};

const METRIC_COLUMNS = [
  "cpu_percent",
  "mem_bytes",
  "net_rx_bytes_per_sec",
  "net_tx_bytes_per_sec",
  "disk_read_bytes_per_sec",
  "disk_write_bytes_per_sec",
  "players_online",
  "load_avg_1m",
  "load_avg_5m",
  "load_avg_15m",
];

async function queryRange(rangeKey) {
  const range = RANGES[rangeKey];
  if (!range) return null;

  const aggregated = METRIC_COLUMNS.map((col) =>
    col === "players_online"
      ? `round(avg(${col}))::int AS ${col}`
      : `avg(${col}) AS ${col}`
  ).join(",\n           ");

  const { rows } = await pool.query(
    `SELECT to_timestamp(floor(extract(epoch FROM time) / $1) * $1) AS time,
            ${aggregated}
       FROM metrics
      WHERE time > now() - $2::interval
      GROUP BY 1
      ORDER BY 1`,
    [range.bucketSeconds, range.interval]
  );
  return rows;
}

const app = express();

app.get("/api/metrics", async (req, res) => {
  const rangeKey = String(req.query.range || "24h");
  try {
    const rows = await queryRange(rangeKey);
    if (!rows) {
      res.status(400).json({ error: `unknown range '${rangeKey}', expected one of ${Object.keys(RANGES).join(", ")}` });
      return;
    }
    res.json(rows);
  } catch (e) {
    console.error("query failed:", e);
    res.status(500).json({ error: "query failed" });
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(row) {
  const payload = JSON.stringify(row);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

// a dedicated, long-lived connection for LISTEN - pool connections aren't
// suitable since they can be recycled out from under a LISTEN at any time
async function listenForMetrics() {
  const client = new Client({
    host: process.env.POSTGRES_HOST || "postgres",
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || "metrics",
    user: process.env.POSTGRES_USER || "metrics",
    password: process.env.POSTGRES_PASSWORD || "metrics",
  });

  client.on("notification", (msg) => {
    try {
      broadcast(JSON.parse(msg.payload));
    } catch (e) {
      console.error("bad notify payload:", e);
    }
  });

  client.on("error", (e) => {
    console.error("LISTEN connection error, reconnecting:", e.message);
    client.end().catch(() => {});
    setTimeout(listenForMetrics, 2000);
  });

  try {
    await client.connect();
    await client.query("LISTEN metrics_update");
    console.log("listening for metrics_update notifications");
  } catch (e) {
    console.error("could not start LISTEN, retrying:", e.message);
    setTimeout(listenForMetrics, 2000);
  }
}

listenForMetrics();

server.listen(PORT, () => {
  console.log(`listening on :${PORT}`);
});
