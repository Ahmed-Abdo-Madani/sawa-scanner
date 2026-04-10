---
trigger: always_on
---

Instruction: You must maintain a living PROJECT_STATUS.md file in the repository root.

When to Trigger:

After completing a significant feature or a development "Phase."
After fixing critical bugs that change logic behavior (e.g., validation rules).
After adding new environment variables or third-party API integrations.
Requirements:

Update Milestones: Mark tasks as completed and add new "Next Steps" as they emerge.
Update File References: If a core logic file is created or moved, update the "Key File References" table.
Handoff Clarity: Summarize current architectural or reliability decisions (e.g., "now using case-insensitive matching") so the next agent doesn't revert them.
Self-Correction: Always read PROJECT_STATUS.md at the start of a session to reconcile your internal context with the actual code status.