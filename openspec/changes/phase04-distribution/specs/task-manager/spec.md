## ADDED Requirements

### Requirement: Goroutine slot management
Each Task Manager SHALL manage a configurable number of task slots. Each slot runs one operator instance as a goroutine with dedicated channel buffers and memory budget.

#### Scenario: Slot allocation
- **WHEN** a Task Manager has 16 slots and receives 10 operator assignments
- **THEN** 10 slots SHALL be occupied, 6 available for future assignments

### Requirement: Resource reporting
The Task Manager SHALL report resource usage to the Job Manager via heartbeats: CPU utilization, memory usage, slot availability, and per-operator throughput.

#### Scenario: Heartbeat with resources
- **WHEN** a heartbeat is sent to the Job Manager
- **THEN** it SHALL include: slots_total, slots_used, memory_used_mb, cpu_percent

### Requirement: Heartbeat protocol
The Task Manager SHALL send heartbeats to the Job Manager at a configurable interval (default: 5 seconds). The JM considers a TM failed after N missed heartbeats (default: 3).

#### Scenario: Regular heartbeat
- **WHEN** 5 seconds elapse since the last heartbeat
- **THEN** the TM SHALL send a heartbeat to the JM with current resource usage

### Requirement: Local operator execution
The Task Manager SHALL manage the full operator lifecycle locally: create operators, wire channels (local) and Flight connections (remote), handle barriers, and report status to JM.

#### Scenario: Local operator lifecycle
- **WHEN** the JM assigns operators [filter_0, map_0, sink_0] to a TM
- **THEN** the TM SHALL create each operator, wire local channels for FORWARD edges and Flight connections for remote edges, and start processing
