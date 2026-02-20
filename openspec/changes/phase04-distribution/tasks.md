## 1. Arrow Flight Shuffle

- [ ] 1.1 Add Arrow Flight Go dependency (`apache/arrow/go` flight module)
- [ ] 1.2 Implement Flight server: accept RecordBatch streams via DoExchange, route to local operators
- [ ] 1.3 Implement Flight client: send RecordBatch streams to remote servers, connection pooling
- [ ] 1.4 Implement Arrow IPC serialization/deserialization for network transfer
- [ ] 1.5 Implement TLS configuration for Flight connections (optional mTLS)
- [ ] 1.6 Benchmark: measure Flight throughput between two nodes (target ≥1 GB/s on local network)
- [ ] 1.7 Write tests: cross-process RecordBatch transfer, connection pool reuse, TLS handshake

## 2. Data Partitioners

- [ ] 2.1 Implement hash partitioner: Murmur3 on key columns, split RecordBatch by partition assignment
- [ ] 2.2 Implement broadcast partitioner: clone RecordBatch to all downstream instances
- [ ] 2.3 Implement round-robin partitioner: rotate batch assignment across instances
- [ ] 2.4 Implement range partitioner: assign based on key value ranges
- [ ] 2.5 Integrate partitioners with shuffle layer: local channels for same-node, Flight for cross-node
- [ ] 2.6 Write tests: partition correctness, key affinity, even distribution

## 3. Credit-Based Backpressure

- [ ] 3.1 Implement credit protocol: downstream grants credits, upstream tracks available credits
- [ ] 3.2 Implement credit integration with Flight streams: embed credit messages in DoExchange
- [ ] 3.3 Implement credit timeout with exponential backoff
- [ ] 3.4 Implement deadlock detection at graph construction time for diamond DAGs
- [ ] 3.5 Write tests: stable under 10x speed mismatch, credit exhaustion and recovery, timeout behavior
- [ ] 3.6 Stress test: diamond DAG with skewed data, verify no deadlocks

## 4. Job Manager

- [ ] 4.1 Implement JM process: accept pipeline submissions via gRPC API
- [ ] 4.2 Implement task scheduling: partition operators across available Task Managers
- [ ] 4.3 Implement co-location optimization: FORWARD-connected operators on same TM
- [ ] 4.4 Implement distributed checkpoint coordination: trigger across all TMs, collect acks
- [ ] 4.5 Implement failure detection: heartbeat timeout → TM failure → operator reassignment
- [ ] 4.6 Implement recovery coordination: select checkpoint, instruct TMs to restore state
- [ ] 4.7 Implement pipeline lifecycle API: submit, status, cancel, rescale
- [ ] 4.8 Write tests: scheduling, checkpoint coordination, TM failure recovery

## 5. Task Manager

- [ ] 5.1 Implement TM process: register with JM, report available slots
- [ ] 5.2 Implement slot management: allocate/deallocate slots for operator instances
- [ ] 5.3 Implement resource reporting: CPU, memory, slots in heartbeat messages
- [ ] 5.4 Implement heartbeat protocol: configurable interval, JM registration
- [ ] 5.5 Implement local operator execution: create operators, wire local channels + remote Flight
- [ ] 5.6 Implement barrier handling: receive barriers from JM, propagate through local operators
- [ ] 5.7 Write tests: slot allocation, heartbeat protocol, operator lifecycle

## 6. Service Discovery (etcd)

- [ ] 6.1 Add etcd client dependency (`go.etcd.io/etcd/client/v3`)
- [ ] 6.2 Implement JM registration in etcd with lease-based auto-cleanup
- [ ] 6.3 Implement TM registration in etcd with lease-based auto-cleanup
- [ ] 6.4 Implement JM leader election via etcd (campaign, observe, resign)
- [ ] 6.5 Implement TM discovery: JM watches etcd for TM registrations/removals
- [ ] 6.6 Implement operator location resolution: operator ID → TM address via etcd
- [ ] 6.7 Write tests: registration, leader election, failover, TM discovery

## 7. Rescaling

- [ ] 7.1 Implement savepoint trigger: consistent snapshot with metadata for rescaling
- [ ] 7.2 Implement key-group redistribution algorithm: compute new assignments for target parallelism
- [ ] 7.3 Implement state splitting: extract key-group ranges from Pebble snapshot into new partitions
- [ ] 7.4 Implement state merging: combine key-group ranges for scale-down
- [ ] 7.5 Implement rescale workflow: savepoint → stop → redistribute → restore → resume
- [ ] 7.6 Write tests: scale 4→8, scale 8→4, verify output correctness, verify no state loss

## 8. Remote Checkpoint Storage

- [ ] 8.1 Implement checkpoint storage interface: local filesystem and S3 backends
- [ ] 8.2 Implement S3 upload: async background upload of Pebble snapshot files
- [ ] 8.3 Implement S3 download: parallel range-request downloads for fast restore
- [ ] 8.4 Implement checkpoint storage configuration in execution plan
- [ ] 8.5 Write tests: S3 upload/download with MinIO in Docker, recovery from remote checkpoint

## 9. Multi-Node Docker Infrastructure

- [ ] 9.1 Create multi-node Docker Compose: 1 JM, 3 TMs, etcd, Kafka (3 brokers)
- [ ] 9.2 Create JM Dockerfile and TM Dockerfile
- [ ] 9.3 Implement `isotope deploy --target docker` for multi-node Docker Compose deployment
- [ ] 9.4 Write multi-node integration test: windowed aggregation across 3 nodes, verify correct output

## 10. Documentation (Distribution Chapters)

- [ ] 10.1 Create `docs/content/docs/distribution/index.mdx`: section landing page
- [ ] 10.2 Write `distribution/shuffle-and-partitioning.mdx`: hash, broadcast, round-robin, range
- [ ] 10.3 Write `distribution/arrow-flight.mdx`: Arrow IPC, Flight RPC, DoGet/DoPut/DoExchange
- [ ] 10.4 Write `distribution/grpc-streaming.mdx`: HTTP/2 frames, multiplexing, flow control
- [ ] 10.5 Write `distribution/credit-based-flow.mdx`: credit protocol, buffer sizing, deadlock prevention
- [ ] 10.6 Write `distribution/consistent-hashing.mdx`: key-group assignment, virtual nodes, rescaling math
- [ ] 10.7 Write `distribution/job-manager.mdx`: coordinator responsibilities, checkpoint triggering
- [ ] 10.8 Write `distribution/task-manager.mdx`: worker lifecycle, slot management, resource isolation
- [ ] 10.9 Write `distribution/service-discovery.mdx`: etcd leases, watches, leader election
- [ ] 10.10 Write `distribution/rescaling.mdx`: savepoint, key-group redistribution, resume

## 11. Integration & Verification

- [ ] 11.1 Verify 3-node cluster runs windowed aggregation with correct output
- [ ] 11.2 Verify Arrow Flight shuffle ≥1 GB/s between two nodes on local network
- [ ] 11.3 Verify credit-based backpressure: stable under 10x speed mismatch, no deadlocks
- [ ] 11.4 Verify rescale 4→8 parallelism with correct output after redistribution
- [ ] 11.5 Verify JM failover: standby takes over within 30 seconds
- [ ] 11.6 Verify all 9 documentation chapters build and render correctly
- [ ] 11.7 Run full test suite including multi-node tests
