## Why

Phases 1-3 built a complete single-node streaming engine. Phase 4 makes Isotope distributed: data shuffle across machines via Arrow Flight, credit-based backpressure to prevent overload, cluster management with Job Manager / Task Manager architecture, and rescaling via key-group redistribution. This is where Isotope transitions from "streaming engine on one machine" to "distributed streaming framework."

## What Changes

- Implement Arrow Flight server/client for inter-node RecordBatch transfer
- Implement hash, broadcast, round-robin, and range partitioners for data shuffle
- Implement credit-based backpressure protocol for cross-node gRPC streams
- Implement Job Manager: pipeline lifecycle, checkpoint triggering, task scheduling
- Implement Task Manager: goroutine slot management, resource reporting, heartbeats
- Implement etcd-based service discovery and leader election
- Implement rescaling: savepoint → redistribute key groups → resume with new parallelism
- Add remote checkpoint storage (S3-compatible) for multi-node recovery
- Write 9 documentation chapters under `docs/content/docs/distribution/`

## Capabilities

### New Capabilities
- `arrow-flight-shuffle`: Arrow Flight gRPC server/client for zero-copy RecordBatch transfer between nodes, connection pooling, TLS support
- `data-partitioners`: Hash partitioner (Murmur3 on key columns), broadcast partitioner, round-robin partitioner, range partitioner for data shuffle across nodes
- `credit-backpressure`: Credit-based flow control protocol for cross-node gRPC streams, deadlock detection at graph construction time, credit timeout with backoff
- `job-manager`: Centralized coordinator for pipeline lifecycle (submit, run, cancel), distributed checkpoint triggering, task scheduling and placement, failure detection and recovery coordination
- `task-manager`: Worker node process managing goroutine slots, resource reporting (CPU, memory, slots), heartbeat protocol with Job Manager
- `service-discovery`: etcd-based service discovery for JM/TM registration, leader election for Job Manager HA, heartbeat-based failure detection
- `rescaling`: Savepoint trigger → stop pipeline → key-group redistribution algorithm → state restore with new key-group assignment → resume
- `remote-checkpoints`: S3-compatible checkpoint storage for multi-node recovery, async snapshot upload, parallel download on restore
- `distribution-docs`: 9 documentation chapters covering shuffle, Arrow Flight, gRPC, credit-based flow, consistent hashing, Job Manager, Task Manager, service discovery, rescaling

### Modified Capabilities

_None at spec level — distribution extends single-node capabilities to multi-node._

## Impact

- **New packages**: `runtime/pkg/shuffle/`, `runtime/pkg/cluster/`, `runtime/pkg/flight/`
- **New dependencies**: `apache/arrow/go` Flight module, `go.etcd.io/etcd/client/v3`, S3 SDK
- **Architecture change**: Runtime splits into Job Manager and Task Manager processes
- **New documentation**: `docs/content/docs/distribution/` with 9 MDX chapters
- **Deployment change**: Multi-node Docker Compose and Kubernetes deployment support
