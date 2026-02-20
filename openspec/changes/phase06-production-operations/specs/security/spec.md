## ADDED Requirements

### Requirement: mTLS between JM and TMs
All communication between Job Manager and Task Managers SHALL support mutual TLS. Certificates SHALL be configurable via Kubernetes secrets or file paths.

#### Scenario: mTLS enforcement
- **WHEN** mTLS is enabled in the pipeline config
- **THEN** all JM↔TM and TM↔TM connections SHALL use mTLS with certificate verification

### Requirement: RBAC for pipeline management
The K8s operator SHALL define RBAC roles: `isotope-admin` (create, update, delete pipelines), `isotope-viewer` (read-only access to pipeline status and metrics), `isotope-operator` (service account for the operator itself).

#### Scenario: Viewer role restrictions
- **WHEN** a user with `isotope-viewer` role attempts to delete a pipeline
- **THEN** Kubernetes RBAC SHALL deny the request

### Requirement: Secrets management
Kafka credentials, database passwords, and other secrets SHALL be injected via Kubernetes secrets or environment variables. Secrets SHALL NOT appear in execution plans, logs, or metrics.

#### Scenario: Secret injection via K8s secret
- **WHEN** `kafka.password` is referenced in the pipeline config as `secretKeyRef`
- **THEN** the runtime SHALL read the value from the mounted Kubernetes secret at runtime
