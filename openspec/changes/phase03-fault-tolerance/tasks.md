## 1. Checkpoint Coordinator

- [ ] 1.1 Implement checkpoint coordinator: periodic trigger at configurable interval, checkpoint ID management
- [ ] 1.2 Implement minimum pause between checkpoints enforcement
- [ ] 1.3 Implement barrier injection: create CheckpointBarrier messages, inject into all source operators
- [ ] 1.4 Implement checkpoint timeout: abort after configurable timeout, clean up partial state
- [ ] 1.5 Implement checkpoint completion tracking: track acks from all operators
- [ ] 1.6 Write unit tests for coordinator lifecycle: trigger, inject, track, complete, timeout

## 2. Barrier Propagation

- [ ] 2.1 Implement barrier forwarding in single-input operators: receive barrier → snapshot → forward
- [ ] 2.2 Implement barrier alignment in multi-input operators: buffer records from early-barrier inputs
- [ ] 2.3 Implement alignment completion: all barriers received → process buffered records → snapshot → forward
- [ ] 2.4 Implement alignment buffer with configurable max size, abort checkpoint on overflow
- [ ] 2.5 Wire `ProcessCheckpointBarrier()` into all existing operators (was no-op before)
- [ ] 2.6 Write tests: single-input barrier flow, multi-input alignment, buffer overflow, ordering correctness

## 3. State Snapshots

- [ ] 3.1 Implement Pebble `Checkpoint()` wrapper: create hardlinked snapshot in named directory
- [ ] 3.2 Implement snapshot metadata: JSON file with checkpoint_id, timestamp, operator states, source offsets
- [ ] 3.3 Implement checkpoint directory structure: `{base}/checkpoint-{id}/operator-{id}/` with state and metadata
- [ ] 3.4 Implement old checkpoint cleanup: retain N most recent, delete older
- [ ] 3.5 Implement state checksum computation for corruption detection
- [ ] 3.6 Benchmark: snapshot creation time at 1GB, 10GB, 100GB state sizes
- [ ] 3.7 Write tests: snapshot creation, metadata persistence, cleanup, checksum verification

## 4. Checkpoint Protocol

- [ ] 4.1 Implement operator acknowledgement: send ack to coordinator after snapshot + barrier forward
- [ ] 4.2 Implement coordinator ack tracking: mark checkpoint complete when all operators ack
- [ ] 4.3 Implement partial failure handling: abort checkpoint if any operator fails to ack
- [ ] 4.4 Implement sink pre-commit notification in the ack flow
- [ ] 4.5 Write integration tests: full checkpoint cycle from trigger to completion

## 5. At-Least-Once Recovery

- [ ] 5.1 Implement checkpoint discovery: scan checkpoint directory for latest completed checkpoint
- [ ] 5.2 Implement state restore: open Pebble from snapshot directory per operator
- [ ] 5.3 Implement Kafka offset reset: seek source consumers to checkpointed offsets
- [ ] 5.4 Implement operator re-initialization: Open → InitializeState(restored) → resume ProcessBatch
- [ ] 5.5 Implement recovery time logging: metadata load, state restore per operator, time to first output
- [ ] 5.6 Write kill-and-recover test: stateless pipeline (Filter → Map), verify correct output
- [ ] 5.7 Write kill-and-recover test: stateful pipeline (windowed aggregate), verify correct window results

## 6. Exactly-Once: Idempotent Sinks

- [ ] 6.1 Implement JDBC upsert deduplication: `INSERT ... ON CONFLICT DO UPDATE` for replayed records
- [ ] 6.2 Implement Kafka dedup headers: embed checkpoint_id + sequence_number in message headers
- [ ] 6.3 Write tests: verify upsert idempotency after simulated replay
- [ ] 6.4 Write tests: verify Kafka dedup headers present and unique

## 7. Exactly-Once: Kafka Transactions

- [ ] 7.1 Implement Kafka transactional sink: unique `transactional.id` per parallel instance
- [ ] 7.2 Implement transaction lifecycle: begin on first record after checkpoint, pre-commit on barrier
- [ ] 7.3 Implement commit on checkpoint-complete signal from coordinator
- [ ] 7.4 Implement abort on checkpoint failure or timeout
- [ ] 7.5 Implement epoch bumping on recovery for zombie transaction fencing
- [ ] 7.6 Write exactly-once verification test: kill-recover 3 times, count output records, verify no duplicates

## 8. Two-Phase Commit Coordinator

- [ ] 8.1 Implement 2PC coordinator: prepare phase (collect pre-commits from sinks), commit phase (signal all sinks)
- [ ] 8.2 Implement abort handling: signal all sinks to abort on any failure
- [ ] 8.3 Implement pending transaction resolution on recovery: commit if checkpoint was complete, abort otherwise
- [ ] 8.4 Implement 2PC timeout handling: abort if any sink doesn't respond
- [ ] 8.5 Write integration test: multi-sink exactly-once (Kafka + JDBC) with kill-recover

## 9. Failure Testing

- [ ] 9.1 Build failure injection framework: random kill timing, state corruption injection
- [ ] 9.2 Write kill-during-checkpoint test: verify falls back to previous checkpoint
- [ ] 9.3 Write kill-between-checkpoints test: verify replays from last complete checkpoint
- [ ] 9.4 Write state corruption test: corrupt snapshot, verify checksum detection and fallback
- [ ] 9.5 Write checkpoint timeout test: slow operator, verify pipeline continues
- [ ] 9.6 Run extended recovery tests: 10GB state, measure recovery time (target ≤60s)

## 10. Documentation (Fault Tolerance Chapters)

- [ ] 10.1 Create `docs/content/docs/fault-tolerance/index.mdx`: section landing page
- [ ] 10.2 Write `fault-tolerance/chandy-lamport.mdx`: original algorithm, marker messages, consistent cuts
- [ ] 10.3 Write `fault-tolerance/barrier-alignment.mdx`: Flink's adaptation, alignment buffering, memory pressure
- [ ] 10.4 Write `fault-tolerance/unaligned-checkpoints.mdx`: FLIP-76 theory, buffer barriers in-flight, tradeoffs
- [ ] 10.5 Write `fault-tolerance/state-snapshots.mdx`: Pebble Checkpoint(), hardlinks, snapshot isolation
- [ ] 10.6 Write `fault-tolerance/exactly-once-semantics.mdx`: what it means, common misconceptions, end-to-end
- [ ] 10.7 Write `fault-tolerance/two-phase-commit.mdx`: coordinator protocol, Kafka transactions, JDBC
- [ ] 10.8 Write `fault-tolerance/recovery-protocol.mdx`: checkpoint selection, state restore, offset reset
- [ ] 10.9 Write `fault-tolerance/failure-modes.mdx`: network partitions, slow nodes, split-brain, corruption

## 11. Integration & Verification

- [ ] 11.1 Verify at-least-once: kill-and-recover produces correct output for all example pipelines
- [ ] 11.2 Verify checkpoint interval of 10 seconds works for pipeline with 1GB state
- [ ] 11.3 Verify Kafka transactional sink: exactly-once count after kill-and-recover
- [ ] 11.4 Verify recovery time ≤60 seconds for 10GB state from local checkpoint
- [ ] 11.5 Verify all 8 documentation chapters build and render correctly
- [ ] 11.6 Run full test suite including failure tests
