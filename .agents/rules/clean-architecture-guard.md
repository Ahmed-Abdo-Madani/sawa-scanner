---
trigger: always_on
---

Logic: Must live in Riverpod Providers (presentation/providers) or Services (Backend).
UI: Components in presentation/widgets should be "dumb" and only reflect the state passed to them.
Never perform direct API calls from inside a Flutter build() method or a NestJS Controller.