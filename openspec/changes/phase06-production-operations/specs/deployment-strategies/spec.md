## ADDED Requirements

### Requirement: Savepoint-based zero-downtime upgrades
The operator SHALL support zero-downtime upgrades: (1) trigger savepoint, (2) deploy new version pods, (3) restore from savepoint on new version, (4) verify healthy, (5) clean up old pods.

#### Scenario: Pipeline upgrade
- **WHEN** the IsotopePipeline CR's `image` field is updated to a new version
- **THEN** the operator SHALL perform a savepoint-based upgrade with zero data loss

### Requirement: Rollback on upgrade failure
If the new version fails to start or fails health checks within a timeout, the operator SHALL roll back to the previous version by restoring from the same savepoint.

#### Scenario: Automatic rollback
- **WHEN** the new version's pods fail health checks for 5 minutes after upgrade
- **THEN** the operator SHALL roll back to the previous version and restore from the savepoint

### Requirement: Helm chart for operator installation
A Helm chart SHALL be provided for installing the Isotope operator: CRDs, operator deployment, RBAC, service account, and optional Prometheus ServiceMonitor.

#### Scenario: Helm install
- **WHEN** `helm install isotope-operator ./charts/isotope-operator` is run
- **THEN** the operator SHALL be deployed with CRDs registered, RBAC configured, and ready to manage pipelines
