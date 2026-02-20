## ADDED Requirements

### Requirement: Savepoint-triggered rescaling
Rescaling SHALL be triggered via a savepoint: (1) trigger savepoint (consistent snapshot), (2) stop pipeline, (3) redistribute key groups to new parallelism, (4) restore state on new operator instances, (5) resume from redistributed state.

#### Scenario: Scale up from 4 to 8 parallelism
- **WHEN** a rescale from parallelism 4→8 is requested
- **THEN** the system SHALL: savepoint → stop → redistribute 128 key groups across 8 instances → restore → resume

### Requirement: Key-group redistribution algorithm
Key groups SHALL be redistributed by assigning contiguous ranges to instances: instance `i` gets key groups `[i * (max_key_groups / N), (i+1) * (max_key_groups / N))`. This ensures minimal state movement during rescaling.

#### Scenario: Minimal state movement on scale-up
- **WHEN** scaling from 4→8 parallelism with 128 key groups
- **THEN** each old instance's 32 key groups SHALL be split into two groups of 16, with only half the state needing to move

### Requirement: Correct output after rescale
After rescaling, the pipeline SHALL produce identical output as if it had run at the new parallelism from the start. No state SHALL be lost or duplicated.

#### Scenario: Output correctness after rescale
- **WHEN** a windowed aggregate rescales from 4→8 and resumes
- **THEN** the output SHALL contain correct results with no missing or duplicate windows
