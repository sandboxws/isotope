## Context

Phase 2 gave Isotope state and time semantics. But state without fault tolerance means any failure loses everything. Phase 3 implements the Chandy-Lamport distributed snapshot algorithm, adapted for streaming as barrier-based checkpointing — the same approach Flink uses. This is the most algorithmically challenging phase of the project.

The key insight from Chandy-Lamport: if you inject markers into all input channels and each process records its state when it receives a marker, the collection of all states forms a "consistent cut" — a snapshot that could have occurred during real execution. In streaming, the markers are checkpoint barriers injected into the data stream.

## Goals / Non-Goals

**Goals:**
- Chandy-Lamport barrier-based checkpointing with aligned barriers
- Pebble state snapshots via hardlinked `Checkpoint()` (~1ms)
- At-least-once recovery: state restore + Kafka offset replay
- Exactly-once with Kafka transactional sinks and 2PC coordination
- Idempotent sinks (JDBC upsert) as simpler exactly-once alternative
- Kill-and-recover test suite verifying correctness
- Recovery time ≤60 seconds for 10GB state
- 8 documentation chapters

**Non-Goals:**
- Unaligned checkpoints — documented in theory but not implemented (follow-up optimization)
- Incremental checkpoints — full snapshots only (Pebble hardlinks are fast enough for now)
- Remote checkpoint storage (S3) — Phase 4 adds this for multi-node
- Savepoints (user-triggered snapshots for upgrades) — Phase 4
- Multi-node recovery coordination — Phase 4

## Decisions

### Decision 1: Aligned barriers (not unaligned)

**Choice:** Implement aligned barrier checkpointing first. Unaligned checkpoints are documented but deferred.

**Rationale:** Aligned barriers are conceptually cleaner — each operator snapshots exactly at the barrier boundary, creating a clean consistent cut. The tradeoff is that multi-input operators must buffer records during alignment, which can cause backpressure amplification under data skew. Unaligned checkpoints (FLIP-76 in Flink) solve this by allowing operators to snapshot immediately and buffer the barrier itself in-flight, but they're significantly more complex and produce larger snapshots.

**Tradeoff:** Under data skew, alignment buffering at Join operators can consume significant memory. Mitigated by setting alignment buffer limits that abort the checkpoint rather than OOM.

### Decision 2: Pebble Checkpoint() for state snapshots

**Choice:** Use Pebble's native `Checkpoint()` API which creates a hardlinked copy of the LSM tree.

**Rationale:** Pebble's `Checkpoint()` creates hardlinks to existing SST files and flushes the memtable. This is O(1) in state size (just creating file hardlinks) and takes ~1ms regardless of whether the state is 1MB or 100GB. No data copying. The snapshot is immediately consistent because SST files are immutable.

**Tradeoff:** Hardlinks only work on the local filesystem — cannot be sent to S3 directly. Phase 4 will add async snapshot upload.

### Decision 3: Progressive exactly-once (idempotent → transactional)

**Choice:** Implement idempotent sinks first (JDBC upsert, Kafka dedup headers), then Kafka transactional sinks with 2PC.

**Rationale:** Idempotent sinks provide exactly-once semantics without the complexity of distributed transactions. For many use cases (JDBC with primary keys, Kafka with key-based consumers), idempotent writes are sufficient and simpler. Kafka transactions add the full 2PC protocol but require careful epoch management, zombie fencing, and transaction timeout handling.

### Decision 4: Single-process 2PC coordinator

**Choice:** The 2PC coordinator runs in-process with the pipeline (not a separate service). In Phase 4 (multi-node), this moves to the Job Manager.

**Rationale:** For single-process execution, an in-process coordinator avoids network overhead. The coordinator maintains transaction state in memory and writes commit decisions to the checkpoint metadata file for recovery resolution.

### Decision 5: Checkpoint metadata as JSON files

**Choice:** Checkpoint metadata (operator states, source offsets, completion status) stored as JSON files alongside Pebble snapshots.

**Rationale:** Simple, human-readable, debuggable. No need for a metadata database at this stage. Phase 4 may add etcd-based metadata for distributed coordination.

## Risks / Trade-offs

- **Barrier alignment correctness is extremely subtle** → Multi-input operators with partial barriers, record ordering, and timeout handling have many edge cases. Budget 4-6 weeks. Each bug teaches distributed systems principles.
- **Exactly-once with Kafka has no Go reference** → Working from Kafka protocol spec and Flink's Java source. The franz-go library supports transactions but the coordination protocol must be implemented from scratch.
- **Recovery time scales with state size** → 100GB state = 100GB of SST files to re-open. Pebble doesn't need to "download" local hardlinks, but re-opening a large DB takes time for manifest parsing. Target ≤60s for 10GB.
- **Checkpoint metadata management is fiddly** → Tracking complete vs incomplete, cleaning old checkpoints, handling partial failures during the cleanup itself. Keep it simple — sequential metadata writes.
- **Kill-and-recover tests are slow** → Each test must start pipeline, produce data, kill, restart, verify. Use short checkpoint intervals (1s) in tests to reduce wait time.

## Open Questions

- Should alignment buffer overflow trigger checkpoint abort or pipeline pause?
- For Kafka transactions: should each parallel sink instance have its own transactional.id, or share one with epoch fencing?
- Should checksum validation on restore be configurable (skip for speed, enable for safety)?
- For recovery: should the runtime auto-detect the latest checkpoint, or accept a checkpoint ID parameter?
