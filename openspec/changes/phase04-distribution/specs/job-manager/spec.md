## ADDED Requirements

### Requirement: Pipeline lifecycle management
The Job Manager SHALL manage pipeline lifecycle: submit (accept execution plan), schedule (assign operators to Task Managers), run (start execution), cancel (stop gracefully), and recover (restart from checkpoint).

#### Scenario: Pipeline submission and scheduling
- **WHEN** a client submits an ExecutionPlan to the Job Manager
- **THEN** the JM SHALL partition operators across available Task Managers based on parallelism and available slots

### Requirement: Distributed checkpoint triggering
The Job Manager SHALL trigger checkpoints for all Task Managers simultaneously. Checkpoint barriers, acknowledgements, and completion SHALL be coordinated through the JM.

#### Scenario: Multi-node checkpoint
- **WHEN** a checkpoint is triggered with operators across 3 Task Managers
- **THEN** the JM SHALL inject barriers via all Task Managers and track acknowledgements until all operators complete

### Requirement: Failure detection and recovery
The Job Manager SHALL detect Task Manager failures via heartbeat timeout and trigger recovery: reassign operators from the failed TM to healthy TMs, restore state from the latest checkpoint.

#### Scenario: Task Manager failure recovery
- **WHEN** Task Manager 2 stops sending heartbeats for 30 seconds
- **THEN** the JM SHALL mark TM2 as failed, reassign its operators to other TMs, and trigger recovery from the latest checkpoint

### Requirement: Task scheduling with resource awareness
The JM SHALL schedule operators based on available slots and resource requirements. Operators with HASH shuffle between them SHOULD be co-located when possible to minimize network transfer.

#### Scenario: Co-location optimization
- **WHEN** a Filter→Map chain has FORWARD shuffle
- **THEN** both operators SHALL be scheduled on the same Task Manager
