---
trigger: always_on
---

Instruction: Before every Git operation, verify that no .env files or JSON service-account keys are staged. Requirement: If a new environment variable is introduced (e.g., for a new AI service), the agent must update the .env.example file and the PROJECT_STATUS.md configuration section immediately.