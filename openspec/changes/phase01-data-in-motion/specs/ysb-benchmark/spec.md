## ADDED Requirements

### Requirement: YSB data generator
The benchmark infrastructure SHALL include a YSB (Yahoo Streaming Benchmark) data generator that produces ad-event records to a Kafka topic at a configurable rate (100K, 500K, 1M events/sec). Each event SHALL have fields: `ad_id`, `event_type` (view/click/purchase), `event_time`, and `user_id`.

#### Scenario: Generate at 100K events/sec
- **WHEN** the YSB generator is started with `rate: 100000`
- **THEN** it SHALL produce approximately 100,000 events per second to the `ad-events` Kafka topic

#### Scenario: Configurable event type distribution
- **WHEN** the generator is configured with default settings
- **THEN** the event type distribution SHALL be approximately 90% view, 8% click, 2% purchase

### Requirement: YSB pipeline implementation
The YSB pipeline SHALL implement the standard benchmark: `Kafka("ad-events") → Filter(event_type='view') → Map(project ad_id, event_time) → KeyBy(ad_id) → TumbleWindow(10s) → Count → Kafka("ad-view-counts")`. Both TSX and Go API implementations SHALL be provided.

#### Scenario: YSB pipeline correctness
- **WHEN** the YSB pipeline runs for 60 seconds at 100K events/sec
- **THEN** the output topic SHALL contain per-ad_id view counts aggregated in 10-second tumble windows, with no missing or duplicate windows

### Requirement: Benchmark metrics collection
The benchmark harness SHALL collect and expose via Prometheus: throughput (events/sec processed), latency histogram (p50, p95, p99), GC pause distribution, CPU utilization, and memory usage.

#### Scenario: Prometheus metrics endpoint
- **WHEN** the Go runtime is running the YSB pipeline
- **THEN** a `/metrics` HTTP endpoint SHALL expose Prometheus-formatted metrics including `isotope_throughput_events_total`, `isotope_latency_seconds`, and `isotope_gc_pause_seconds`

### Requirement: Docker Compose benchmark environment
The benchmark SHALL run in a reproducible Docker Compose environment under `docker/benchmark/` with: 3 Kafka brokers (KRaft), the Go runtime, Prometheus, Grafana with a pre-built dashboard, and the data generator.

#### Scenario: Reproducible benchmark run
- **WHEN** `docker/benchmark/scripts/run-ysb.sh` is executed
- **THEN** the full benchmark environment SHALL start, run YSB at 100K/500K/1M events/sec, collect metrics, and output a summary report

### Requirement: Baseline measurements
Phase 1 SHALL produce published baseline measurements: sustained throughput (events/sec) for the stateless Filter→Map path, p50/p95/p99 latency at 100K events/sec (target: p99 < 100ms), and GC pause distribution.

#### Scenario: Throughput baseline
- **WHEN** the YSB pipeline runs at maximum throughput with stateless operators
- **THEN** sustained throughput SHALL be at least 100K events/sec on a single node
