FROM python:3.12-slim

# conntrack: netlink-based conntrack table query (some kernels, e.g. recent
# Ubuntu, ship without CONFIG_NF_CONNTRACK_PROCFS, so /proc/net/nf_conntrack
# never exists - netlink works regardless).
# util-linux: provides nsenter, used to run conntrack in the host's network
# namespace (where Docker's DNAT'd game sessions actually live) without the
# whole container needing network_mode: host.
RUN apt-get update && \
    apt-get install -y --no-install-recommends conntrack util-linux && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY collector.py .

CMD ["python", "-u", "collector.py"]
