## Why

A streaming pipeline that can't survive failure is a toy. Phase 3 makes Isotope production-capable by implementing Chandy-Lamport distributed snapshots adapted for streaming (barrier-based checkpointing), state recovery, and exactly-once semantics. This is where the deepest learning happens — Chandy-Lamport correctness, barrier alignment edge cases, and Kafka two-phase commit are among the most challenging distributed systems problems. Very few engineers have implemented these from scratch.

## What Changes

- Implement checkpoint coordinator: barrier injection from JobManager into sources
- Implement barrier propagation through the operator DAG with alignment buffering
- Implement Pebble state snapshots via `Checkpoint()` (hardlinked, ~1ms)
- Implement checkpoint acknowledge protocol and metadata storage
- Implement at-least-once recovery: restore state + replay Kafka offsets
- Implement idempotent sinks: upsert semantics for dedup-on-recovery
- Implement Kafka transactional sink: producer transactions coordinated with barriers
- Implement two-phase commit coordinator: pre-commit on barrier, commit on checkpoint-complete
- Implement failure testing: kill-and-recover test suite, corruption detection
- Write 8 documentation chapters under `docs/content/docs/fault-tolerance/`

## Capabilities

### New Capabilities
- `checkpoint-coordinator`: JobManager-side checkpoint triggering at configurable intervals, barrier injection into all source operators, checkpoint ID management, timeout handling
- `barrier-propagation`: Checkpoint barrier messages flowing through operator DAG, barrier alignment at multi-input operators with record buffering, barrier forwarding to downstream
- `state-snapshots`: Pebble `Checkpoint()` for hardlinked state snapshots (~1ms), snapshot metadata (operator states, source offsets), checkpoint storage (local filesystem initially)
- `checkpoint-protocol`: Acknowledge flow from operators to coordinator, checkpoint completion detection, partial failure handling, old checkpoint cleanup
- `at-least-once-recovery`: Checkpoint selection on restart, state download/restore, Kafka offset reset to checkpointed positions, source replay, non-transactional sink writes (may duplicate)
- `exactly-once-kafka`: Kafka producer transactions coordinated with checkpoint barriers, transactional sink with pre-commit/commit/abort lifecycle
- `two-phase-commit`: Coordinator protocol for end-to-end exactly-once: prepare on barrier receipt, commit on checkpoint-complete, abort on timeout/failure
- `idempotent-sinks`: Upsert-based exactly-once for JDBC sinks (ON CONFLICT), Kafka key-based deduplication
- `failure-testing`: Kill-and-recover test suite, state checksum validation, checkpoint timeout tests, corruption detection
- `fault-tolerance-docs`: 8 documentation chapters covering Chandy-Lamport, barrier alignment, unaligned checkpoints, state snapshots, exactly-once semantics, 2PC, recovery protocol, failure modes

### Modified Capabilities

_None — fault tolerance extends existing capabilities without changing their spec-level behavior._

## Impact

- **Modified packages**: `runtime/pkg/checkpoint/` (new), `runtime/pkg/connector/kafka/` (transactional producer), `runtime/pkg/connector/jdbc/` (upsert dedup), `runtime/pkg/state/` (snapshot support)
- **New infrastructure**: Checkpoint metadata storage, failure injection testing framework
- **Runtime behavior change**: All operators now handle `ProcessCheckpointBarrier()` for real (was no-op in Phase 1-2)
- **New documentation**: `docs/content/docs/fault-tolerance/` with 8 MDX chapters
