## ADDED Requirements

### Requirement: Watermark generation from event-time columns
Source operators SHALL generate watermarks based on the configured watermark column and max delay. The watermark value SHALL be: `max(event_time_seen) - max_delay`.

#### Scenario: Watermark advances with events
- **WHEN** events arrive with timestamps [1000, 1005, 1002, 1010] and max_delay is 5
- **THEN** watermarks SHALL advance as: 995, 1000, 1000, 1005

### Requirement: Watermark propagation through DAG
Watermarks SHALL propagate downstream through operators. Single-input operators pass watermarks through. Multi-input operators (Union, Join) SHALL emit the minimum watermark across all inputs.

#### Scenario: Min-watermark for multi-input operator
- **WHEN** a Join operator has left watermark=1000 and right watermark=800
- **THEN** the output watermark SHALL be 800 (the minimum)

#### Scenario: Watermark propagation through filter
- **WHEN** a Filter operator receives watermark=1000
- **THEN** it SHALL forward watermark=1000 downstream unchanged

### Requirement: Watermark tracking
The runtime SHALL track the current watermark per operator instance. The `ProcessWatermark(wm)` method SHALL be called on each operator when its input watermark advances, enabling time-based triggers.

#### Scenario: Operator receives watermark notification
- **WHEN** the input watermark advances past a new value
- **THEN** `ProcessWatermark` SHALL be called with the new watermark value

### Requirement: Idle source handling
When a source partition produces no events, its watermark SHALL not block global watermark advancement. Idle partitions SHALL be excluded from min-watermark computation after a configurable idle timeout.

#### Scenario: Idle partition excluded from watermark
- **WHEN** partition 0 has watermark=1000, partition 1 has been idle for 30 seconds (idle timeout=10s)
- **THEN** the source watermark SHALL be 1000 (partition 1 excluded)
