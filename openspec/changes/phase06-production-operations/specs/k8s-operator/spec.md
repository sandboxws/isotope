## ADDED Requirements

### Requirement: Kubernetes operator with Operator SDK
The operator SHALL be built using the Operator SDK (Go) with controller-runtime. It SHALL manage IsotopePipeline custom resources through the full lifecycle: create → running → scaling → upgrading → deleting.

#### Scenario: Pipeline creation
- **WHEN** an IsotopePipeline CR is created in the cluster
- **THEN** the operator SHALL create Job Manager and Task Manager pods, configure networking, and start the pipeline

#### Scenario: Pipeline deletion
- **WHEN** an IsotopePipeline CR is deleted
- **THEN** the operator SHALL gracefully stop the pipeline (trigger savepoint if configured), delete JM/TM pods, and clean up resources

### Requirement: Reconciliation loop
The operator SHALL use a level-triggered reconciliation loop: on any state change (pod failure, config update, scaling event), the controller SHALL reconcile actual state with desired state.

#### Scenario: Pod failure recovery
- **WHEN** a Task Manager pod crashes and is replaced by Kubernetes
- **THEN** the operator SHALL detect the new pod, trigger recovery from the latest checkpoint, and resume processing

### Requirement: Leader election for operator HA
The operator SHALL use leader election (controller-runtime) to ensure only one operator instance is active. Standby instances SHALL take over on leader failure.

#### Scenario: Operator failover
- **WHEN** the active operator pod crashes
- **THEN** a standby operator pod SHALL acquire the lease and resume reconciliation
