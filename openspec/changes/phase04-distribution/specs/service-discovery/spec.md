## ADDED Requirements

### Requirement: etcd-based service registration
Job Managers and Task Managers SHALL register themselves in etcd with their address, port, and capabilities. Registration SHALL use etcd leases that auto-expire on process death.

#### Scenario: Task Manager registration
- **WHEN** a Task Manager starts at address `tm-2:8081`
- **THEN** it SHALL register in etcd at key `/isotope/task-managers/tm-2` with a lease TTL of 30 seconds

### Requirement: Leader election for Job Manager HA
Multiple Job Manager instances SHALL use etcd leader election. Only the leader JM accepts pipeline submissions and triggers checkpoints. On leader failure, a standby JM takes over.

#### Scenario: JM failover
- **WHEN** the leader JM crashes
- **THEN** a standby JM SHALL win the etcd election and resume coordination within 30 seconds

### Requirement: Service discovery for operator wiring
The shuffle layer SHALL discover remote Task Managers via etcd, resolving operator placement to network addresses for Flight connections.

#### Scenario: Resolve operator location
- **WHEN** operator `agg_0` needs to send data to operator `sink_0` on another TM
- **THEN** it SHALL look up `sink_0`'s TM address from etcd to establish the Flight connection
