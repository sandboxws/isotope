## ADDED Requirements

### Requirement: Arrow Flight server for RecordBatch transfer
Each Task Manager SHALL run an Arrow Flight gRPC server that accepts RecordBatch streams from upstream operators on other nodes. The server SHALL support `DoExchange` for bidirectional streaming with credit-based flow control.

#### Scenario: Cross-node RecordBatch transfer
- **WHEN** operator A on node 1 sends a RecordBatch to operator B on node 2
- **THEN** the RecordBatch SHALL be transferred via Arrow Flight with minimal serialization overhead (Arrow IPC format)

### Requirement: Arrow Flight client with connection pooling
The shuffle layer SHALL maintain a connection pool to remote Flight servers. Connections SHALL be reused across batches and operators targeting the same node.

#### Scenario: Connection reuse
- **WHEN** 4 operators on node 1 send data to node 2
- **THEN** they SHALL share connections from a pool rather than each opening a separate gRPC connection

### Requirement: TLS support
Arrow Flight connections SHALL support optional mTLS for encrypted inter-node communication.

#### Scenario: TLS enabled
- **WHEN** TLS is configured with certificates
- **THEN** all Flight connections SHALL use mTLS with certificate verification
