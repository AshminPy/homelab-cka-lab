# Spec Delta

## Purpose

Defines how labs and questions are written as files so new drills can be added without code changes, and how every question's grading is proven correct before it is used.

## ADDED Requirements

### Requirement: File-based lab content
The system SHALL load exams, labs and questions from content files, where each question declares its domain, difficulty, task text, scored checks, an environment setup, an optional cleanup, an explained solution and an automated reference solution, and SHALL reject content that is missing required fields or references unknown domains, naming the file and field.

#### Scenario: Invalid question file
- **WHEN** a question omits its checks
- **THEN** the system refuses to load that lab and reports the question file and the missing field

#### Scenario: Add a lab without code changes
- **WHEN** a new lab folder with valid files is added for an exam
- **THEN** the lab appears in that exam's catalog after restart

### Requirement: Target-neutral content
Question text, setup, checks and solutions SHALL refer to cluster nodes through target-provided names, so the same question works on the kind cluster and on the homelab cluster.

#### Scenario: Node names follow the target
- **WHEN** a question mentions the first worker node and the target is the kind cluster `cka`
- **THEN** the question shows `cka-worker`

### Requirement: Proven checks
The project SHALL provide a content test that, for every question on a live target, runs setup, confirms that no check passes yet (no free points), runs the reference solution, and confirms every check passes.

#### Scenario: A check that gives free points
- **WHEN** any of a question's checks passes straight after setup, before any solution
- **THEN** the content test fails for that question and names the check

#### Scenario: A solution that does not satisfy its checks
- **WHEN** a question's reference solution leaves any check failing
- **THEN** the content test fails for that question and names the failing check
