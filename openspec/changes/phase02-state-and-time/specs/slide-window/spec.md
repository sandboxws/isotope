## ADDED Requirements

### Requirement: Slide window assigner
The SlideWindow assigner SHALL assign each record to one or more overlapping windows based on `size` and `slide` parameters. Each record belongs to `ceil(size / slide)` windows.

#### Scenario: Record assigned to multiple windows
- **WHEN** window size=10 minutes, slide=5 minutes, and a record has event_time=12:07:00
- **THEN** the record SHALL be assigned to windows [12:00, 12:10) and [12:05, 12:15)

### Requirement: Slide window trigger and eviction
Each slide window SHALL fire independently when the watermark passes its end. State eviction SHALL occur per-window after allowed lateness expires.

#### Scenario: Overlapping windows fire at different times
- **WHEN** watermark advances to 12:10:01
- **THEN** window [12:00, 12:10) SHALL fire, while window [12:05, 12:15) remains open

### Requirement: Memory efficiency for overlapping windows
The runtime SHALL optimize memory usage by sharing record references across overlapping windows where possible, rather than duplicating data.

#### Scenario: Shared records across windows
- **WHEN** a record is assigned to 3 overlapping windows
- **THEN** the record data SHALL be stored once with references from each window, not copied 3 times
