## 1. Kubernetes Operator Scaffolding

- [ ] 1.1 Initialize operator project with Operator SDK: `operator/` directory, go.mod, Makefile
- [ ] 1.2 Define IsotopePipeline CRD types in `operator/api/v1alpha1/`
- [ ] 1.3 Implement CRD spec: planRef, parallelism, checkpointConfig, resources, scaling, image
- [ ] 1.4 Implement CRD status: phase, conditions, lastCheckpoint, currentParallelism, observedGeneration
- [ ] 1.5 Add printer columns: NAME, PHASE, PARALLELISM, LAST-CHECKPOINT, AGE
- [ ] 1.6 Implement validation webhook: reject invalid parallelism, checkpoint interval, missing plan
- [ ] 1.7 Generate CRD manifests and RBAC rules

## 2. Pipeline Controller

- [ ] 2.1 Implement pipeline controller with controller-runtime reconciliation loop
- [ ] 2.2 Implement CREATE phase: create JM pod, TM pods, configure networking, start pipeline
- [ ] 2.3 Implement RUNNING phase: monitor pod health, update status with checkpoint info
- [ ] 2.4 Implement DELETING phase: trigger savepoint (optional), delete pods, clean up resources
- [ ] 2.5 Implement failure detection: pod crash → trigger recovery from latest checkpoint
- [ ] 2.6 Implement leader election for operator HA
- [ ] 2.7 Write controller tests using envtest (lightweight K8s API)

## 3. Savepoint-Based Upgrades

- [ ] 3.1 Implement upgrade detection: observe spec.image or spec.planRef changes
- [ ] 3.2 Implement upgrade workflow: trigger savepoint → stop old pods → deploy new pods → restore
- [ ] 3.3 Implement rollback: if new pods fail health checks within timeout, restore old version
- [ ] 3.4 Implement upgrade status tracking: UPGRADING phase with conditions
- [ ] 3.5 Write tests: successful upgrade, failed upgrade with rollback

## 4. Auto-Scaling

- [ ] 4.1 Implement Kafka consumer lag monitoring: query Kafka admin API for consumer group lag
- [ ] 4.2 Implement scale-up decision: lag exceeds threshold for N consecutive intervals
- [ ] 4.3 Implement scale-down decision: lag below threshold for N consecutive intervals
- [ ] 4.4 Implement cooldown period: no scaling actions during cooldown after a scaling event
- [ ] 4.5 Implement min/max parallelism bounds enforcement
- [ ] 4.6 Integrate with savepoint-based rescaling: auto-scale triggers savepoint → rescale → resume
- [ ] 4.7 Write tests: scale-up trigger, scale-down trigger, cooldown enforcement, bounds enforcement

## 5. Observability

- [ ] 5.1 Add Prometheus client library, implement `/metrics` endpoint on Go runtime
- [ ] 5.2 Implement throughput metrics: `isotope_records_processed_total`, `isotope_records_per_second`
- [ ] 5.3 Implement latency metrics: `isotope_latency_seconds` histogram (p50/p95/p99)
- [ ] 5.4 Implement Kafka lag metrics: `isotope_kafka_consumer_lag` gauge per partition
- [ ] 5.5 Implement state metrics: `isotope_state_size_bytes` per operator
- [ ] 5.6 Implement checkpoint metrics: `isotope_checkpoint_duration_seconds` histogram
- [ ] 5.7 Implement GC metrics: `isotope_gc_pause_seconds` summary
- [ ] 5.8 Implement structured JSON logging with operator_id, pipeline_name, checkpoint_id fields
- [ ] 5.9 Implement health check endpoints: `/healthz`, `/readyz`, `/livez`
- [ ] 5.10 Create Grafana dashboard JSON: throughput, latency, lag, state size, checkpoints, GC, CPU/memory
- [ ] 5.11 Create Prometheus ServiceMonitor for K8s auto-discovery

## 6. Security

- [ ] 6.1 Implement mTLS configuration: certificate loading, TLS config for JM↔TM and TM↔TM connections
- [ ] 6.2 Implement RBAC roles: isotope-admin, isotope-viewer, isotope-operator service account
- [ ] 6.3 Implement secrets management: read Kafka credentials and DB passwords from K8s secrets
- [ ] 6.4 Ensure secrets never appear in logs, metrics, or execution plans
- [ ] 6.5 Write tests: mTLS connection, secret injection, RBAC enforcement

## 7. Helm Chart

- [ ] 7.1 Create Helm chart structure: `charts/isotope-operator/`
- [ ] 7.2 Template operator deployment, service account, cluster role, cluster role binding
- [ ] 7.3 Template CRD installation
- [ ] 7.4 Template optional Prometheus ServiceMonitor
- [ ] 7.5 Add configurable values: image, replicas, resources, RBAC, monitoring
- [ ] 7.6 Write Helm chart tests and documentation

## 8. CLI Production Commands

- [ ] 8.1 Implement `isotope deploy --target k8s`: synth → build container → push → generate CR → apply → monitor
- [ ] 8.2 Implement `isotope deploy --target docker`: generate Docker Compose → start
- [ ] 8.3 Implement `isotope doctor`: check Kafka, K8s permissions, registry access, resources
- [ ] 8.4 Write integration tests for CLI production commands

## 9. Documentation (Production Chapters)

- [ ] 9.1 Create `docs/content/docs/production/index.mdx`: section landing page
- [ ] 9.2 Write `production/kubernetes-operator.mdx`: Operator pattern, controller-runtime, reconciliation
- [ ] 9.3 Write `production/crd-design.mdx`: spec vs status, conditions, validation webhooks
- [ ] 9.4 Write `production/auto-scaling.mdx`: PID basics, lag-based scaling, cooldown, oscillation prevention
- [ ] 9.5 Write `production/observability.mdx`: RED metrics, histogram design, label cardinality, alerts
- [ ] 9.6 Write `production/deployment-strategies.mdx`: savepoint upgrades, blue-green, rollback
- [ ] 9.7 Write `production/security.mdx`: mTLS setup, RBAC, secrets management

## 10. Reference Documentation

- [ ] 10.1 Write `docs/content/docs/reference/proto-schema.mdx`: full Protobuf schema reference
- [ ] 10.2 Write `docs/content/docs/reference/cli-commands.mdx`: CLI reference for all commands
- [ ] 10.3 Write `docs/content/docs/reference/operator-catalog.mdx`: all operators with examples
- [ ] 10.4 Write `docs/content/docs/reference/connector-catalog.mdx`: all connectors with config
- [ ] 10.5 Write `docs/content/docs/reference/papers.mdx`: annotated bibliography of referenced papers

## 11. Getting Started Documentation

- [ ] 11.1 Write `docs/content/docs/getting-started/index.mdx`: What is Isotope
- [ ] 11.2 Write `docs/content/docs/getting-started/installation.mdx`: Setup Go, Node, protoc, Docker
- [ ] 11.3 Write `docs/content/docs/getting-started/first-pipeline.mdx`: Hello world Generator → Console
- [ ] 11.4 Write `docs/content/docs/getting-started/project-structure.mdx`: Monorepo tour

## 12. Integration & Verification

- [ ] 12.1 Verify `isotope deploy --target k8s` deploys a pipeline to a K8s cluster
- [ ] 12.2 Verify auto-scaling adjusts parallelism based on lag with dampening
- [ ] 12.3 Verify Grafana dashboard shows all key metrics for a running pipeline
- [ ] 12.4 Verify zero-downtime upgrade via savepoint + redeploy
- [ ] 12.5 Verify rollback on failed upgrade
- [ ] 12.6 Verify all 6 production documentation chapters build and render correctly
- [ ] 12.7 Verify full course documentation site is deployed and navigable (56+ chapters)
- [ ] 12.8 Run full test suite including operator tests
