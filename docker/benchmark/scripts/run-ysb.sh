#!/usr/bin/env bash
set -euo pipefail

# YSB Benchmark Runner
# Usage: ./run-ysb.sh [100k|500k|1m]
#
# Starts the benchmark infrastructure, runs the YSB generator at the
# specified event rate, and collects results.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BENCH_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(cd "$BENCH_DIR/../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/runtime"

RATE="${1:-100000}"

case "$RATE" in
  100k|100K)  RATE=100000  ;;
  500k|500K)  RATE=500000  ;;
  1m|1M)      RATE=1000000 ;;
esac

DURATION="${2:-60s}"

echo "═══════════════════════════════════════════════════"
echo "  Isotope YSB Benchmark"
echo "  Rate:     $RATE events/sec"
echo "  Duration: $DURATION"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Step 1: Build Go binaries ────────────────────────────────────────

echo "▸ Building Go binaries..."
cd "$RUNTIME_DIR"
go build -o "$BENCH_DIR/bin/ysb-generator" ./cmd/ysb-generator
go build -o "$BENCH_DIR/bin/ysb-bench" ./cmd/ysb-bench
echo "  Done."

# ── Step 2: Start infrastructure ─────────────────────────────────────

echo ""
echo "▸ Starting Kafka cluster + monitoring..."
cd "$BENCH_DIR"
docker compose up -d
echo "  Waiting for Kafka to be ready..."
sleep 15

# ── Step 3: Create topics ───────────────────────────────────────────

echo ""
echo "▸ Creating Kafka topics..."
docker compose exec kafka-1 kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --if-not-exists \
  --topic ad-events \
  --partitions 12 \
  --replication-factor 3 2>/dev/null || true

docker compose exec kafka-1 kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --if-not-exists \
  --topic ysb-output \
  --partitions 12 \
  --replication-factor 3 2>/dev/null || true
echo "  Done."

# ── Step 4: Run the benchmark ───────────────────────────────────────

echo ""
echo "▸ Starting YSB generator at $RATE events/sec for $DURATION..."
"$BENCH_DIR/bin/ysb-generator" \
  -brokers "localhost:9092" \
  -topic "ad-events" \
  -rate "$RATE" \
  -campaigns 100 \
  -duration "$DURATION" &
GEN_PID=$!

echo ""
echo "▸ Starting YSB Go benchmark (Arrow-native pipeline)..."
timeout "$DURATION" "$BENCH_DIR/bin/ysb-bench" 2>&1 || true &
BENCH_PID=$!

# Wait for generator to finish.
wait $GEN_PID 2>/dev/null || true
wait $BENCH_PID 2>/dev/null || true

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Benchmark complete!"
echo ""
echo "  Grafana dashboard: http://localhost:3000"
echo "  Prometheus:         http://localhost:9090"
echo ""
echo "  To tear down: docker compose -f $BENCH_DIR/docker-compose.yml down"
echo "═══════════════════════════════════════════════════"
