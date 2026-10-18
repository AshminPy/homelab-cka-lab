# Spec Delta

## Purpose

Records every lab attempt and turns the results into progress signals — scores over time, accuracy per exam domain, and time left to each exam — so practice can target weak areas.

## ADDED Requirements

### Requirement: Attempt history
The system SHALL store each finished attempt with exam, lab, mode, target, start and end time, per-question and per-check results, total score, percentage and pass/fail, on the local machine, and keep it across restarts.

#### Scenario: History after restart
- **WHEN** the user finishes an attempt and restarts the app
- **THEN** the attempt appears in the history with its score

### Requirement: Progress dashboard
The system SHALL show, per exam: number of attempts, best and last percentage per lab, accuracy per exam domain across all finished attempts, the weakest domains, and days remaining to the exam's target date.

#### Scenario: Weakest domain
- **WHEN** finished attempts show 40% of Troubleshooting points earned and at least 70% in every other CKA domain
- **THEN** the dashboard lists Troubleshooting as the weakest CKA domain

#### Scenario: No attempts yet
- **WHEN** no attempts have been finished for an exam
- **THEN** the dashboard shows that there is no data yet instead of zero scores
