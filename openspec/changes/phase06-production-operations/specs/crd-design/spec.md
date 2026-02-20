## ADDED Requirements

### Requirement: IsotopePipeline CRD spec
The CRD spec SHALL include: `planRef` (reference to compiled execution plan), `parallelism` (default parallelism), `checkpointConfig` (interval, mode, storage), `resources` (CPU/memory per JM/TM), `scaling` (min/max parallelism, auto-scaling config), and `image` (runtime container image).

#### Scenario: Pipeline CRD with auto-scaling
- **WHEN** an IsotopePipeline CR specifies `scaling: {min: 2, max: 16, targetLag: 1000}`
- **THEN** the operator SHALL create the pipeline at min parallelism and enable auto-scaling

### Requirement: IsotopePipeline CRD status
The CRD status SHALL include: `phase` (Creating, Running, Scaling, Upgrading, Failed, Deleting), `conditions` (Ready, CheckpointHealthy, ScalingActive), `lastCheckpoint` (ID, timestamp, duration), `currentParallelism`, and `observedGeneration`.

#### Scenario: Status reflects running state
- **WHEN** a pipeline is running with checkpoint 42 completed 5 seconds ago
- **THEN** the status SHALL show `phase: Running`, `conditions: [Ready=True, CheckpointHealthy=True]`, `lastCheckpoint: {id: 42}`

### Requirement: Validation webhook
The operator SHALL implement a validating webhook that rejects invalid CRD specs: invalid parallelism (≤0), invalid checkpoint interval (<1s), missing plan reference.

#### Scenario: Reject invalid spec
- **WHEN** an IsotopePipeline CR is submitted with `parallelism: -1`
- **THEN** the webhook SHALL reject it with a descriptive error

### Requirement: Printer columns
The CRD SHALL define printer columns for `kubectl get isotopepipelines`: NAME, PHASE, PARALLELISM, LAST-CHECKPOINT, AGE.

#### Scenario: kubectl output
- **WHEN** `kubectl get isotopepipelines` is run
- **THEN** it SHALL show a table with pipeline name, phase, current parallelism, and last checkpoint info
