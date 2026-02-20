## ADDED Requirements

### Requirement: Credit-based flow control protocol
Cross-node data channels SHALL use credit-based flow control: the downstream operator grants credits (number of batches it can accept). The upstream operator sends data only when credits are available. When credits reach zero, the upstream blocks.

#### Scenario: Credit flow under normal operation
- **WHEN** downstream grants 5 credits and upstream has 3 batches to send
- **THEN** upstream SHALL send 3 batches, reducing credits to 2

#### Scenario: Credit exhaustion causes upstream stall
- **WHEN** upstream has exhausted all credits (0 remaining)
- **THEN** upstream SHALL stall (not send) until downstream returns credits

### Requirement: Deadlock detection at graph construction time
The execution graph builder SHALL detect potential deadlock scenarios in diamond DAGs (A→B, A→C, B→D, C→D) where credit exhaustion on one path can block the other. Detected deadlocks SHALL trigger a warning with suggested buffer sizing.

#### Scenario: Diamond DAG deadlock detection
- **WHEN** an execution graph has a diamond pattern with credit-based channels
- **THEN** the graph builder SHALL emit a warning about potential deadlock and suggest increased buffer sizes

### Requirement: Credit timeout with backoff
If no credits are received within a configurable timeout, the upstream SHALL apply exponential backoff before retrying. After max retries, it SHALL report a backpressure timeout error.

#### Scenario: Credit timeout recovery
- **WHEN** downstream is temporarily slow and doesn't return credits for 5 seconds
- **THEN** upstream SHALL wait with backoff and resume when credits arrive
