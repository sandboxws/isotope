## Context

Phases 1-3 built a complete single-process streaming engine with state, time, and fault tolerance. Phase 4 distributes it across machines. The core challenge is efficiently moving Arrow RecordBatches between nodes while maintaining backpressure guarantees, coordinating checkpoints across a cluster, and enabling rescaling through key-group redistribution.

The architecture follows Flink's model: a centralized Job Manager coordinates pipeline lifecycle, scheduling, and checkpointing, while Task Managers execute operators on worker nodes. Arrow Flight provides zero-copy network transfer, and etcd provides service discovery and leader election.

## Goals / Non-Goals

**Goals:**
- Multi-node execution across 3+ nodes
- Arrow Flight for inter-node RecordBatch transfer (target: ≥1 GB/s on local network)
- Credit-based backpressure stable under 10x producer/consumer speed mismatch
- Job Manager / Task Manager cluster architecture
- etcd-based service discovery and JM leader election
- Rescaling from N→M parallelism with correct output
- Remote checkpoint storage (S3/MinIO)
- 9 documentation chapters

**Non-Goals:**
- Auto-scaling (Phase 6) — manual rescaling only
- Kubernetes operator (Phase 6) — manual deployment via CLI/scripts
- SQL query compilation (Phase 5) — operators still configured via Protobuf plan
- Gossip-based service discovery — etcd only
- Multi-region deployment

## Decisions

### Decision 1: Arrow Flight for inter-node shuffle (not raw gRPC, not TCP)

**Choice:** Apache Arrow Flight (gRPC-based) for cross-node RecordBatch transfer.

**Rationale:** Arrow Flight uses the Arrow IPC wire format, which is the same as the in-memory format — no serialization needed beyond framing. This is "zero-copy" in the sense that no data conversion happens. Flight also provides built-in gRPC features: TLS, authentication, flow control, and multiplexing.

**Alternatives considered:**
- Raw gRPC with custom protobuf — requires serializing Arrow data to protobuf (expensive)
- TCP with custom framing — no TLS, auth, multiplexing for free; more code to maintain
- RDMA/DPDK — fastest but requires specialized hardware and kernel bypass

**Tradeoff:** gRPC adds ~100μs overhead per message vs raw TCP. For batch sizes of 4096+ rows, this is negligible compared to data volume.

### Decision 2: Credit-based (not TCP-level) backpressure

**Choice:** Application-level credit-based flow control layered on top of gRPC streams.

**Rationale:** TCP flow control (window scaling) operates at the byte level, not at the semantic batch level. Credit-based flow control operates on "I can accept N more batches," which matches the pipeline's processing capacity. This prevents buffer bloat where TCP accepts data into kernel buffers that the application can't process fast enough.

**Tradeoff:** More complex than relying on TCP/gRPC flow control. But provides much better latency predictability and avoids buffer bloat.

### Decision 3: etcd for coordination (not ZooKeeper, not embedded Raft)

**Choice:** etcd for service discovery, leader election, and distributed coordination.

**Rationale:** etcd is the standard for Kubernetes-native coordination. The Go client library is mature. etcd leases provide automatic cleanup on process death. Leader election is a single API call.

**Alternatives considered:**
- ZooKeeper — Java ecosystem, heavier, less Go-native
- Embedded Raft (hashicorp/raft) — eliminates external dependency but much more complex to implement correctly
- Consul — feature-rich but heavier than needed

### Decision 4: Centralized Job Manager (not peer-to-peer)

**Choice:** Centralized Job Manager for scheduling, checkpoint coordination, and failure recovery. Single leader with standby via etcd leader election.

**Rationale:** Centralized coordination is simpler to implement and reason about. The JM is a lightweight coordinator — all heavy work (data processing, state management) happens on Task Managers. JM failover via etcd leader election provides HA.

**Tradeoff:** JM is a single point of failure (mitigated by leader election). JM failure causes a brief pause (new leader election + state recovery) but doesn't lose data.

### Decision 5: Key-group contiguous ranges for state redistribution

**Choice:** Key groups assigned as contiguous ranges: instance `i` gets `[i * (max/N), (i+1) * (max/N))`. On rescale, ranges are split or merged.

**Rationale:** Contiguous ranges minimize state movement during rescaling. Scaling 4→8 splits each range in half — only half the state moves. This is the same approach Flink uses (key-group assignment from FLIP-6).

## Risks / Trade-offs

- **Arrow Flight latency overhead** → 2-5ms per hop may compound through deep DAGs. Profile early and document the gap between "zero-copy" claims and actual measured latency.
- **Credit-based backpressure deadlocks in diamond DAGs** → Classic distributed systems problem. Detect at graph construction time and warn. May need per-path credit pools.
- **etcd learning curve** → Lease management, watch API, and consistency model have subtle behaviors. Budget a week for etcd integration.
- **Rescaling correctness is hard to verify** → Property-based tests comparing output at different parallelism levels. State audit after redistribution.
- **Multi-node testing infrastructure** → Need Docker Compose with 3+ runtime containers, etcd, Kafka. Test suite becomes slower.

## Open Questions

- Should the JM store pipeline metadata in etcd or in its own state (local file / Pebble)?
- For credit-based backpressure: should credits be per-operator or per-physical-channel?
- Should we support heterogeneous TM configurations (different slot counts, memory)?
- For rescaling: should we support scale-down (8→4) in addition to scale-up?
