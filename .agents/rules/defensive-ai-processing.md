---
trigger: always_on
---

Instruction: When writing services that consume AI/LLM output, you must implement a "Transformation & Validation" layer. Requirement: Use a DTO (Data Transfer Object) and a validator (like LabelValidationService) to sanitize AI results before they ever touch the database or the UI.