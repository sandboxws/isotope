## ADDED Requirements

### Requirement: Prometheus metrics endpoint
The Go runtime SHALL expose a `/metrics` HTTP endpoint with Prometheus-formatted metrics: `isotope_records_processed_total` (counter, per operator), `isotope_records_per_second` (gauge), `isotope_latency_seconds` (histogram, p50/p95/p99), `isotope_kafka_consumer_lag` (gauge, per partition), `isotope_state_size_bytes` (gauge, per operator), `isotope_checkpoint_duration_seconds` (histogram), `isotope_gc_pause_seconds` (summary).

#### Scenario: Scrape metrics endpoint
- **WHEN** Prometheus scrapes `/metrics`
- **THEN** it SHALL receive all configured metrics with correct labels (operator_id, pipeline_name)

### Requirement: Structured JSON logging
The runtime SHALL use structured JSON logging with fields: `timestamp`, `level`, `message`, `operator_id`, `pipeline_name`, `checkpoint_id` (where applicable). Log levels: DEBUG, INFO, WARN, ERROR.

#### Scenario: Structured log output
- **WHEN** a checkpoint completes
- **THEN** a log entry SHALL be emitted: `{"level":"info","msg":"checkpoint complete","checkpoint_id":42,"duration_ms":150}`

### Requirement: Health check APIs
The runtime SHALL expose `/healthz` (liveness — process is alive), `/readyz` (readiness — pipeline is processing data), and `/livez` (liveness alias) HTTP endpoints for Kubernetes probes.

#### Scenario: Readiness probe
- **WHEN** a pipeline is running and processing records
- **THEN** `/readyz` SHALL return HTTP 200

#### Scenario: Pipeline not ready during recovery
- **WHEN** a pipeline is recovering from a checkpoint
- **THEN** `/readyz` SHALL return HTTP 503 until recovery completes

### Requirement: Grafana dashboard
A pre-built Grafana dashboard JSON SHALL be provided with panels for: throughput over time, latency percentiles, Kafka consumer lag, state size per operator, checkpoint duration, GC pauses, CPU/memory usage.

#### Scenario: Dashboard displays metrics
- **WHEN** the Grafana dashboard is imported and Prometheus is scraping the runtime
- **THEN** all panels SHALL display live metrics for the running pipeline
