## Context

Phases 1-5 built a feature-complete distributed streaming framework. Phase 6 is the "last mile" — making it deployable, observable, and operable in production. The K8s operator provides declarative pipeline management, auto-scaling responds to load changes, observability enables debugging, and security protects the cluster.

This phase is more engineering than research — the streaming concepts are established; now it's about operational excellence. The Kubernetes Operator pattern is well-documented, and Isotope follows standard patterns from controller-runtime and Operator SDK.

## Goals / Non-Goals

**Goals:**
- Kubernetes operator with IsotopePipeline CRD (full lifecycle)
- Savepoint-based zero-downtime upgrades with automatic rollback
- Reactive auto-scaling based on Kafka consumer lag with dampening
- Prometheus metrics, structured logging, health checks
- Grafana dashboard for pipeline observability
- Helm chart for operator installation
- CLI production commands: `deploy --target k8s`, `deploy --target docker`, `doctor`
- mTLS, RBAC, secrets management
- 6 documentation chapters
- Full course site deployed and navigable

**Non-Goals:**
- Predictive auto-scaling (ML-based) — reactive only
- Multi-cluster deployment — single cluster
- Custom metrics-based scaling (beyond Kafka lag) — keep it simple
- Web-based management UI — CLI only
- Audit logging (logging who did what) — defer to K8s audit logs

## Decisions

### Decision 1: Operator SDK (not raw controller-runtime, not kubebuilder)

**Choice:** Operator SDK (Go) which wraps controller-runtime with additional tooling.

**Rationale:** Operator SDK provides project scaffolding, CRD generation, OLM integration, and testing helpers. It's the standard for Go operators. kubebuilder is similar but Operator SDK adds OLM support and is maintained by Red Hat + community.

### Decision 2: Reactive auto-scaling only (no predictive)

**Choice:** Scale based on Kafka consumer lag thresholds with dampening. No machine learning or predictive models.

**Rationale:** Reactive scaling is simpler, predictable, and sufficient for most streaming workloads. The lag metric directly measures whether the pipeline is keeping up. Dampening (cooldown periods, threshold hysteresis) prevents oscillation without needing complex control theory.

**Tradeoff:** Reactive scaling is always behind the curve — lag must increase before scaling up. For workloads with predictable spikes (e.g., daily peaks), predictive scaling would be better. Accept this limitation.

### Decision 3: Savepoint-based upgrades (not rolling update)

**Choice:** Upgrades trigger a savepoint → stop → deploy new → restore. Not a pod-by-pod rolling update.

**Rationale:** Streaming pipelines are stateful — you can't simply replace pods one by one because state is distributed across key groups. A savepoint captures the entire pipeline's state at a consistent point, allowing the new version to restore from it. This is the same approach Flink uses.

**Tradeoff:** Brief downtime during upgrade (stop → deploy → restore). Mitigated by fast Pebble Checkpoint() (~1ms) and fast restore from local/S3 snapshots.

### Decision 4: Prometheus metrics (not OpenTelemetry)

**Choice:** Prometheus pull-based metrics with the standard `/metrics` endpoint.

**Rationale:** Prometheus is the de facto standard for Kubernetes observability. Every K8s cluster has Prometheus. The Go `prometheus/client_golang` library is mature. OpenTelemetry metrics are gaining adoption but adding another dependency and protocol isn't justified when Prometheus works.

### Decision 5: Helm chart (not Kustomize, not raw manifests)

**Choice:** Helm chart for operator installation with configurable values.

**Rationale:** Helm is the most widely used K8s package manager. It supports templating for environment-specific configuration (image registry, resource limits, RBAC). Kustomize is simpler but less flexible for distribution.

## Risks / Trade-offs

- **K8s operator is a product, not a feature** → CRD versioning, webhooks, leader election, RBAC, Helm charts each take a week. Budget 4 weeks total.
- **Auto-scaling feedback loops** → Scale up triggers rebalancing → throughput drops → lag spikes → more scale-up → oscillation. Mitigate with aggressive cooldown (5 min) and hysteresis thresholds.
- **Dashboard API mismatch** → Go runtime metrics differ from FlinkReactor's Flink REST API. Build the dashboard from scratch for Isotope's metric names.
- **mTLS certificate management** → Certificate rotation, CA management, and distribution are complex in K8s. Use cert-manager or simple mounted secrets.
- **Testing operator behavior** → K8s controller tests require envtest (lightweight K8s API server). Setup is non-trivial but essential.

## Open Questions

- Should the operator manage etcd as a sub-resource, or require a pre-existing etcd cluster?
- Should auto-scaling support custom metrics (beyond Kafka lag) via Prometheus queries?
- Should the Helm chart include Prometheus and Grafana, or assume they're pre-installed?
- For upgrades: should the operator support canary deployments (run old and new in parallel)?
