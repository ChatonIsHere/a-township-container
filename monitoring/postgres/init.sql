CREATE TABLE IF NOT EXISTS metrics (
    time TIMESTAMPTZ NOT NULL DEFAULT now(),
    cpu_percent DOUBLE PRECISION,
    mem_bytes BIGINT,
    mem_limit_bytes BIGINT,
    net_rx_bytes_per_sec DOUBLE PRECISION,
    net_tx_bytes_per_sec DOUBLE PRECISION,
    disk_read_bytes_per_sec DOUBLE PRECISION,
    disk_write_bytes_per_sec DOUBLE PRECISION,
    players_online INTEGER,
    load_avg_1m DOUBLE PRECISION,
    load_avg_5m DOUBLE PRECISION,
    load_avg_15m DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS metrics_time_idx ON metrics (time DESC);
