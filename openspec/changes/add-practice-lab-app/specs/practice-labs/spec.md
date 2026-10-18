# Spec Delta

## Purpose

A local, killer.sh-style simulator for the CKA, CKAD and CKS exams: timed lab attempts against a real practice cluster, a built-in terminal, and automatic grading of each task.

## ADDED Requirements

### Requirement: Exam and lab catalog
The system SHALL list the exams CKA, CKAD and CKS, each with its pass mark, and the labs available for each exam with question count, duration, attempt count, best score, and whether an attempt is in progress.

#### Scenario: Browse labs for an exam
- **WHEN** the user opens the app and selects the CKA tab
- **THEN** the system shows every CKA lab with its question count, duration, best score and attempt count, and a Resume action for a lab with an attempt in progress

#### Scenario: Exam with no labs yet
- **WHEN** the user selects an exam that has no labs
- **THEN** the system shows that no labs exist yet instead of an error

### Requirement: Practice target safety
The system SHALL run every terminal session, setup, reset and check against one configured target cluster only, using a dedicated kubeconfig that contains only that target, and SHALL refuse to start an attempt when that cluster is unreachable.

#### Scenario: Target cluster missing
- **WHEN** the configured target cluster does not exist or its API server does not respond
- **THEN** the system shows the target as unavailable with how to create it, and starting an attempt is rejected

#### Scenario: Other kube contexts are unreachable
- **WHEN** the user runs `kubectl config get-contexts` in the built-in terminal
- **THEN** only the target cluster's context is listed

### Requirement: Lab attempts with modes
The system SHALL start a lab attempt in Practice or Exam mode, run each question's environment setup before the attempt opens, persist the attempt so it survives a browser refresh or server restart, and allow only one attempt in progress at a time.

#### Scenario: Start an attempt
- **WHEN** the user starts CKA Lab 1 in Exam mode
- **THEN** the system runs every question's setup, records the start time, and opens the first question with a countdown of the lab's duration

#### Scenario: Resume after refresh
- **WHEN** the user refreshes the browser during an attempt
- **THEN** the attempt reopens with the same remaining time, flags and done marks

#### Scenario: Time runs out
- **WHEN** the countdown reaches zero
- **THEN** the system shows that time is up and still lets the user finish and score the attempt

### Requirement: Question navigation and marks
The system SHALL show each question's domain, difficulty, points, context and tasks, a grid of all questions showing done, flagged and (after checking) passed states, and let the user flag, mark done and move between questions.

#### Scenario: Flag a question
- **WHEN** the user flags question 4
- **THEN** question 4 shows as flagged in the grid and stays flagged after a refresh

### Requirement: Question reset
The system SHALL let the user reset one question's environment to its starting state without affecting other questions.

#### Scenario: Reset a broken question
- **WHEN** the user resets question 5
- **THEN** the system removes question 5's resources, re-runs its setup, and leaves other questions' resources untouched

### Requirement: Built-in terminal
The system SHALL provide an interactive bash terminal in the lab view that matches the exam shell: `k` aliased to kubectl with completion, `$do` set to `--dry-run=client -o yaml`, `$now` set to `--force --grace-period 0`, and a `node-shell <node>` command that opens a shell on a cluster node.

#### Scenario: Exam-style shortcuts
- **WHEN** the user runs `k run x --image=nginx $do` in the terminal
- **THEN** the Pod manifest is printed and nothing is created

#### Scenario: Reach a node
- **WHEN** the user runs `node-shell <worker node name>`
- **THEN** a root shell opens on that node

### Requirement: Automatic grading
The system SHALL grade a question by running each of its checks against the target cluster and files, award a check's points only when it passes, and report pass/fail per check, points per question, total percentage, and pass/fail against the exam's pass mark. In Practice mode a single question can be checked at any time; in Exam mode checks run only when the attempt is finished.

#### Scenario: Check one question in Practice mode
- **WHEN** the user clicks Check on a question in a Practice attempt
- **THEN** the system shows each check's pass/fail and the points earned for that question

#### Scenario: Checks are blocked in Exam mode
- **WHEN** a client asks to check a single question in an Exam attempt before it is finished
- **THEN** the request is rejected

#### Scenario: Finish and score
- **WHEN** the user finishes an attempt
- **THEN** every question is graded and the result shows total %, pass or fail against the exam's pass mark, per-question points and per-domain scores

### Requirement: Solutions unlock after grading
The system SHALL reveal a question's reference solution only after that question has been checked in Practice mode or after the attempt is finished.

#### Scenario: Solution locked before checking
- **WHEN** a client requests a solution for a question that has not been checked in an unfinished attempt
- **THEN** the request is rejected

### Requirement: Local-only access
The system SHALL accept connections only on the loopback interface, reject requests whose Host or Origin is not the app's own local address, and require a per-run session token for the terminal connection.

#### Scenario: Cross-site terminal attempt
- **WHEN** a web page from another origin tries to open the terminal connection
- **THEN** the connection is refused
