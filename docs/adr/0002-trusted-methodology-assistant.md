---
status: accepted
---

# PiCM is a trusted methodology assistant, not an execution sandbox

PiCM's purpose is to help people curate and maintain ICM workflows, workspaces, and coding-repository context. Protected scan phases, exact-phrase consent, and proposal-bound write authority have made ordinary authorized work brittle and recovery confusing. We choose a shared conversational behavior model across all `/picm-*` commands, ordinary agent tools, and a thin extension instead of a custom permission engine.

This supersedes [ADR-0001](0001-practical-write-safety.md) as the architectural target. **The current implementation replaces the old gates; installed or already-running older versions may still enforce them. This decision never authorizes bypassing a running version's controls. Disposable interactive QA has exercised the five commands and reminders, not every environment.** The replacement contract and responsibility-level migration map are in [the redesign contract](../redesign-contract.md).

Workspace scope, privacy exclusions, preview-before-change, non-destructive defaults, and honest partial-effect reporting remain important. They become collaborative agent responsibilities rather than a promise that PiCM intercepts every read or mutation. Named external context can be included through ordinary user authorization; permission to read it does not grant permission to modify it. Arbitrary shell and custom tools are not a comprehensive privacy sandbox, and PiCM must not claim otherwise.

Modification commands inspect, present a concise final direction, and wait for conversational user sign-off before editing. Approval belongs to agent instructions, not magic phrases, machine-parsed checkpoint acknowledgments, or repeated permission for individual edits within the agreed direction. Preserve the existing methodology and meaningful stage reviews; broader flow redesign is deferred. Native modals can assist real decisions without becoming mandatory authorization checkpoints. Configuration updates retain ordinary integrity and conflict safeguards. Cancellation stops future work without automatic rollback or a permanent lock on subsequent tasks. Reminders offer work; they do not launch autonomous edits.

## Trade-off

We accept fewer runtime-enforced guarantees in exchange for useful autonomy, predictable task completion, and a much smaller execution surface. We reject both another layer of gate exceptions and a parallel strict mode: either would preserve the competing interaction models and maintenance burden. Migration must update runtime, shipped guidance, generated content, and tests together; documentation of this target is not evidence that it is implemented.
