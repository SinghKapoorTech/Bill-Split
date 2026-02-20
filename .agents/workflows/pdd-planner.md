---
description: Framework for creating new features using PDD
---

# New Feature Workflow

This workflow integrates the **Prompt-Driven Development (PDD)** skill to ensure high-quality, well-planned features.

## Steps

1.  **Initialize PDD**:
    -   Read the PDD instructions: `.agent/skills/pdd/SKILL.md`.
    -   If a `rough_idea` is not provided, ask the user for it.
    -   Follow the PDD process (Requirements -> Research -> Design -> Plan).
    -   Artifacts will be stored in `specs/<feature-name>/`.

2.  **Implementation**:
    -   Upon approval of the PDD `plan.md`, proceed to implementation.
    -   Create a new task in `task.md` for the implementation phase.
    -   Implement the changes, following the generated plan.

3.  **Verification**:
    -   Verify the feature logic and UI.
    -   Ensure it meets the requirements defined in the PDD phase.
