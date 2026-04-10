---
trigger: always_on
---

Instruction: When modifying UI, never use hardcoded strings. Every text element must use AppLocalizations.of(context). Requirement: If you add a new key to the English .arb file, you must also add a corresponding (even if machine-translated) entry to the Arabic .arb file to maintain build stability.

