# Workflow engine

- Workflow engine v1 (`_shared/muse/workflow/`) is gated per user by `agent_workflow_settings.engine_mode`; in `shadow` it only observes after a turn is persisted and writes solely to `agent_workflow*` tables (guard-tested) — so shadow mode can never block, trigger or charge anything.
