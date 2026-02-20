## Why

Phases 1-5 built a complete distributed streaming framework with state, fault tolerance, multi-node execution, and SQL support. Phase 6 makes it production-ready: a Kubernetes operator for declarative pipeline management, auto-scaling based on consumer lag, observability (metrics, logging, tracing), deployment strategies for stateful upgrades, and security. This is the "last mile" that turns a framework into something deployable.

## What Changes

- Build a Kubernetes operator (Operator SDK) with IsotopePipeline CRD
- Implement pipeline controller: create → running → scaling → upgrading → deleting lifecycle
- Implement savepoint-based zero-downtime upgrades
- Implement reactive auto-scaling: Kafka lag → adjust parallelism with dampening
- Build Prometheus metrics endpoint with full streaming metrics
- Build Grafana dashboard for pipeline observability
- Add structured JSON logging and health check API
- Implement CLI production commands: `isotope deploy --target k8s`, `isotope doctor`
- Add mTLS, RBAC, and secrets management
- Implement Helm chart for operator installation
- Write 6 documentation chapters under `docs/content/docs/production/`

## Capabilities

### New Capabilities
- `k8s-operator`: Kubernetes operator (Go, Operator SDK) with IsotopePipeline CRD, pipeline controller with full lifecycle management, RBAC rules, leader election
- `crd-design`: IsotopePipeline CRD with spec (pipeline plan, parallelism, checkpoint config), status (running/scaling/failed, conditions, last checkpoint), printer columns, validation webhooks
- `auto-scaling`: Reactive auto-scaler monitoring Kafka consumer lag, PID-controller-inspired dampening to prevent oscillation, cooldown periods, savepoint-based rescaling integration
- `observability`: Prometheus metrics endpoint (throughput, latency, lag, state size, checkpoint duration, GC pauses), structured JSON logging, health check/readiness/liveness APIs
- `deployment-strategies`: Savepoint-based zero-downtime upgrades (trigger savepoint → deploy new → restore), rolling update support, Helm chart for operator installation
- `security`: mTLS between Job Manager and Task Managers, RBAC model for pipeline submission/management, secrets management for Kafka credentials and database passwords
- `production-cli`: `isotope deploy --target k8s` (synth → container build → CRD apply), `isotope deploy --target docker` (Docker Compose), `isotope doctor` (validate connectivity, permissions, resources)
- `production-docs`: 6 documentation chapters covering K8s operator, CRD design, auto-scaling, observability, deployment strategies, security

### Modified Capabilities

_None at spec level._

## Impact

- **New directory**: `operator/` (K8s operator Go module with Operator SDK)
- **New dependencies**: `sigs.k8s.io/controller-runtime`, Operator SDK, Helm
- **New infrastructure**: Helm chart, Grafana dashboards, Prometheus service monitor
- **CLI additions**: `deploy --target k8s`, `deploy --target docker`, `doctor`
- **New documentation**: `docs/content/docs/production/` with 6 MDX chapters
- **Deployment**: Isotope becomes deployable to Kubernetes clusters via `isotope deploy`
