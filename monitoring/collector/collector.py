"""
Polls docker stats for TARGET_CONTAINER, the host's load average, and the
kernel's conntrack table (for a players-online count), and writes one row
per poll into Postgres.
"""

import json
import os
import re
import subprocess
import time

import docker
import psycopg2

TARGET_CONTAINER = os.environ.get("TARGET_CONTAINER", "a-township-container")
GAME_PORT = os.environ.get("GAME_PORT", "1757")
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL_SECONDS", "5"))
PLAYER_THRESHOLD = float(os.environ.get("PLAYER_ONLINE_THRESHOLD_SECONDS", "10"))

PG_HOST = os.environ.get("POSTGRES_HOST", "127.0.0.1")
PG_PORT = os.environ.get("POSTGRES_PORT", "5432")
PG_DB = os.environ.get("POSTGRES_DB", "metrics")
PG_USER = os.environ.get("POSTGRES_USER", "metrics")
PG_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "metrics")

LOADAVG_PATH = "/host/proc/loadavg"
HOST_NETNS_PATH = "/host_net_ns"

_UDP_RE = re.compile(r"\budp\b")
_SRC_RE = re.compile(r"\bsrc=(\S+)")
_DPORT_RE = re.compile(r"\bdport=(\d+)")

_docker_client = docker.DockerClient(base_url="unix://var/run/docker.sock")

_prev_net = None  # (timestamp, rx_bytes, tx_bytes)
_prev_disk = None  # (timestamp, read_bytes, write_bytes)
_player_first_seen = {}  # ip -> first_seen timestamp


def connect_db():
    while True:
        try:
            conn = psycopg2.connect(
                host=PG_HOST, port=PG_PORT, dbname=PG_DB,
                user=PG_USER, password=PG_PASSWORD,
            )
            conn.autocommit = True
            return conn
        except Exception as e:
            print(f"waiting for postgres: {e}", flush=True)
            time.sleep(2)


def get_container_stats():
    try:
        container = _docker_client.containers.get(TARGET_CONTAINER)
        return container.stats(stream=False)
    except Exception as e:
        print(f"could not read stats for {TARGET_CONTAINER}: {e}", flush=True)
        return None


def compute_cpu_percent(stats):
    # docker's non-streaming stats call already samples cpu twice ~1s apart
    # and returns both readings (cpu_stats = now, precpu_stats = ~1s ago),
    # so a single poll is enough to compute a real delta-based percentage
    try:
        cpu = stats["cpu_stats"]
        precpu = stats["precpu_stats"]
        cpu_delta = cpu["cpu_usage"]["total_usage"] - precpu["cpu_usage"]["total_usage"]
        system_delta = cpu.get("system_cpu_usage", 0) - precpu.get("system_cpu_usage", 0)
        online_cpus = cpu.get("online_cpus") or len(cpu["cpu_usage"].get("percpu_usage") or [1])
        if system_delta > 0 and cpu_delta > 0:
            return (cpu_delta / system_delta) * online_cpus * 100.0
    except (KeyError, TypeError, ZeroDivisionError):
        pass
    return None


def compute_mem_bytes(stats):
    try:
        mem = stats["memory_stats"]
        usage = mem["usage"]
        detail = mem.get("stats", {})
        # cgroup v1 exposes "cache", cgroup v2 exposes "inactive_file" - both
        # are reclaimable page cache that "docker stats" subtracts out so the
        # number reflects actual memory pressure, not just page cache
        cache = detail.get("cache", detail.get("inactive_file", 0))
        return max(usage - cache, 0), mem.get("limit")
    except (KeyError, TypeError):
        return None, None


def compute_net_totals(stats):
    try:
        networks = stats.get("networks") or {}
        rx = sum(iface["rx_bytes"] for iface in networks.values())
        tx = sum(iface["tx_bytes"] for iface in networks.values())
        return rx, tx
    except (KeyError, TypeError):
        return None, None


def compute_disk_totals(stats):
    try:
        entries = stats["blkio_stats"]["io_service_bytes_recursive"] or []
        # docker's engine API has reported this as both "Read"/"Write" and
        # lowercase "read"/"write" across versions - compare case-insensitively
        read = sum(e["value"] for e in entries if e["op"].lower() == "read")
        write = sum(e["value"] for e in entries if e["op"].lower() == "write")
        return read, write
    except (KeyError, TypeError):
        return None, None


def rate(prev, current_totals, now):
    """current_totals: (a, b), cumulative counters. Returns ((a_rate, b_rate), new_prev)."""
    a, b = current_totals
    if a is None or b is None:
        return (None, None), prev
    if prev is None:
        return (None, None), (now, a, b)
    prev_time, prev_a, prev_b = prev
    elapsed = now - prev_time
    if elapsed <= 0:
        return (None, None), (now, a, b)
    a_rate = max(a - prev_a, 0) / elapsed
    b_rate = max(b - prev_b, 0) / elapsed
    return (a_rate, b_rate), (now, a, b)


def get_players_online(now):
    """Unique source IPs with an active UDP session to the game port, present
    continuously for at least PLAYER_THRESHOLD seconds.

    Queries the host's conntrack table over netlink (nsenter into a
    read-only bind mount of the host's network namespace, then `conntrack
    -L`) rather than reading /proc/net/nf_conntrack - some kernels (recent
    Ubuntu among them) ship without CONFIG_NF_CONNTRACK_PROCFS, so that file
    never exists no matter what, while the netlink interface always works
    as long as the nf_conntrack module is loaded. This also avoids
    network_mode: host for the whole container (that was found to
    destabilize a WSL2 dev host - see git history - so it's deliberately
    scoped to just this one query via nsenter instead).
    """
    current_ips = set()
    try:
        result = subprocess.run(
            ["nsenter", f"--net={HOST_NETNS_PATH}", "conntrack", "-L", "-p", "udp"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or f"conntrack exited {result.returncode}")
        for line in result.stdout.splitlines():
            if not _UDP_RE.search(line):
                continue
            # first src=/dport= pair is the original (pre-DNAT) direction -
            # the real client IP and the port they actually dialled
            src_match = _SRC_RE.search(line)
            dport_match = _DPORT_RE.search(line)
            if src_match and dport_match and dport_match.group(1) == str(GAME_PORT):
                current_ips.add(src_match.group(1))
    except Exception as e:
        print(f"conntrack query failed: {e}", flush=True)
        return None

    for ip in current_ips:
        _player_first_seen.setdefault(ip, now)
    for ip in list(_player_first_seen):
        if ip not in current_ips:
            del _player_first_seen[ip]

    return sum(1 for first_seen in _player_first_seen.values() if now - first_seen >= PLAYER_THRESHOLD)


def get_load_avg():
    try:
        with open(LOADAVG_PATH) as f:
            parts = f.read().split()
        return float(parts[0]), float(parts[1]), float(parts[2])
    except Exception as e:
        print(f"could not read {LOADAVG_PATH}: {e}", flush=True)
        return None, None, None


def main():
    global _prev_net, _prev_disk

    conn = connect_db()
    print(f"polling '{TARGET_CONTAINER}' every {POLL_INTERVAL}s, "
          f"game port {GAME_PORT}, player threshold {PLAYER_THRESHOLD}s", flush=True)

    while True:
        loop_start = time.monotonic()
        now = time.time()

        stats = get_container_stats()
        cpu_percent = mem_bytes = mem_limit = None
        net_rx_rate = net_tx_rate = None
        disk_read_rate = disk_write_rate = None

        if stats:
            cpu_percent = compute_cpu_percent(stats)
            mem_bytes, mem_limit = compute_mem_bytes(stats)
            (net_rx_rate, net_tx_rate), _prev_net = rate(_prev_net, compute_net_totals(stats), now)
            (disk_read_rate, disk_write_rate), _prev_disk = rate(_prev_disk, compute_disk_totals(stats), now)

        players_online = get_players_online(now)
        load1, load5, load15 = get_load_avg()

        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO metrics (
                        cpu_percent, mem_bytes, mem_limit_bytes,
                        net_rx_bytes_per_sec, net_tx_bytes_per_sec,
                        disk_read_bytes_per_sec, disk_write_bytes_per_sec,
                        players_online, load_avg_1m, load_avg_5m, load_avg_15m
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING time
                    """,
                    (cpu_percent, mem_bytes, mem_limit,
                     net_rx_rate, net_tx_rate,
                     disk_read_rate, disk_write_rate,
                     players_online, load1, load5, load15),
                )
                (row_time,) = cur.fetchone()
                cur.execute(
                    "SELECT pg_notify('metrics_update', %s)",
                    (json.dumps({
                        "time": row_time.isoformat(),
                        "cpu_percent": cpu_percent,
                        "mem_bytes": mem_bytes,
                        "net_rx_bytes_per_sec": net_rx_rate,
                        "net_tx_bytes_per_sec": net_tx_rate,
                        "disk_read_bytes_per_sec": disk_read_rate,
                        "disk_write_bytes_per_sec": disk_write_rate,
                        "players_online": players_online,
                        "load_avg_1m": load1,
                        "load_avg_5m": load5,
                        "load_avg_15m": load15,
                    }),),
                )
        except Exception as e:
            print(f"failed to write metrics row: {e}", flush=True)
            try:
                conn.close()
            except Exception:
                pass
            conn = connect_db()

        elapsed = time.monotonic() - loop_start
        time.sleep(max(POLL_INTERVAL - elapsed, 0))


if __name__ == "__main__":
    main()
