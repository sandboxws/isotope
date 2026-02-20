## ADDED Requirements

### Requirement: Session window assigner with gap detection
The SessionWindow assigner SHALL create dynamic windows based on activity gaps. A new session starts when the gap between consecutive events (per key) exceeds the configured `gap` duration.

#### Scenario: Session creation on gap
- **WHEN** events for user_1 arrive at times [10:00, 10:02, 10:04, 10:30, 10:31] with gap=15 minutes
- **THEN** two sessions SHALL be created: [10:00, 10:19) and [10:30, 10:46)

### Requirement: Session window merging
When a late event arrives that falls between two existing sessions (bridging the gap), the two sessions SHALL be merged into one. The merge-on-arrival algorithm SHALL handle cascading merges.

#### Scenario: Late event bridges two sessions
- **WHEN** sessions [10:00, 10:15) and [10:20, 10:35) exist, and a late event at 10:12 arrives
- **THEN** the two sessions SHALL merge into [10:00, 10:35) if the gap between 10:12 and 10:20 is within the gap threshold

### Requirement: Session state cleanup
Session state SHALL be evicted when the watermark advances past `session.end + allowed_lateness + gap`. This accounts for potential late merges.

#### Scenario: Session eviction
- **WHEN** a session [10:00, 10:15) has allowed_lateness=5 min, gap=15 min, and watermark reaches 10:35:01
- **THEN** the session state SHALL be evicted
