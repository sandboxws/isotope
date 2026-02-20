## ADDED Requirements

### Requirement: Allowed lateness configuration
Each window operator SHALL support an `allowed_lateness` duration. Records arriving after `window.end` but before `window.end + allowed_lateness` SHALL be processed normally (re-triggering the window).

#### Scenario: Late record within allowed lateness
- **WHEN** a window [12:00, 12:05) has fired, allowed_lateness=2 minutes, and a record with event_time=12:04:30 arrives at watermark 12:06:00
- **THEN** the record SHALL be added to the window and the window SHALL re-fire with updated results

### Requirement: Side output for late data
Records arriving after `window.end + allowed_lateness` SHALL be routed to a configurable side output (a separate downstream operator) rather than silently dropped.

#### Scenario: Late record routed to side output
- **WHEN** a record arrives after the window's allowed lateness has expired
- **THEN** the record SHALL be emitted to the side output stream, not the main output

### Requirement: Retraction semantics for updated windows
When a window re-fires due to late data, the operator SHALL emit a retraction for the previous result followed by the updated result. This enables downstream operators to maintain correctness.

#### Scenario: Retraction on window update
- **WHEN** window [12:00, 12:05) first emits count=100, then a late record causes re-fire with count=101
- **THEN** the operator SHALL emit: retract(count=100), then insert(count=101)
