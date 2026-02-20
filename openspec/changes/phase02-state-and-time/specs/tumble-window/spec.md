## ADDED Requirements

### Requirement: Tumble window assigner
The TumbleWindow assigner SHALL assign each record to exactly one non-overlapping fixed-size window based on the event-time column. Window boundaries SHALL be aligned to epoch (e.g., 5-minute windows start at :00, :05, :10).

#### Scenario: Record assignment to tumble window
- **WHEN** a record has event_time=12:03:27 and window size is 5 minutes
- **THEN** it SHALL be assigned to window [12:00:00, 12:05:00)

### Requirement: Per-window state accumulation
Each window SHALL accumulate records in per-window state. For DuckDB micro-batch operators, records are buffered as Arrow RecordBatches. For Arrow-native operators, state is managed via Pebble.

#### Scenario: Accumulate records in window
- **WHEN** 500 records are assigned to window [12:00, 12:05)
- **THEN** all 500 records SHALL be available when the window trigger fires

### Requirement: Watermark-driven trigger
The window SHALL fire (emit results) when the watermark advances past `window.end + allowed_lateness`. The EventTimeTrigger SHALL fire exactly once per window unless late data triggers re-emission.

#### Scenario: Window fires on watermark
- **WHEN** the watermark advances to 12:05:01 and window [12:00, 12:05) has accumulated records
- **THEN** the window trigger SHALL fire and emit the window results

### Requirement: State eviction after expiry
Window state SHALL be evicted (deleted from Pebble) after the watermark advances past `window.end + allowed_lateness`. This prevents unbounded state growth.

#### Scenario: State cleanup after lateness
- **WHEN** allowed_lateness=1 minute and watermark advances to 12:06:01
- **THEN** state for window [12:00, 12:05) SHALL be evicted
