# Kanban grouping core (P08-b9-a, partial)

Pure helpers describe priority, assignee, due and tag group projections for an already authorized canonical selection. Cards contain only stable visual IDs, canonical task IDs and typed group keys; task bodies are not copied for each tag. A tag can produce multiple visual cards, while unique totals and bulk task IDs remain canonical and deduplicated. Projection IDs hash a framed tuple, so identifiers containing delimiters cannot collide by concatenation.

All-day due dates stay literal. Timed due dates use the explicit view timezone. A due move requires an explicit validated deadline rather than inventing a timestamp or silently clearing it. A move returns only the selected priority/assignee/due/tag field. Tag A→B replaces A, preserves other tags and deduplicates; an All-tags projection requires explicit add/replace. Stale tag membership refuses. Created/modified/overdue and workflow/section intents cannot be used as writable grouping fields.

This module does not query storage, authenticate a caller, enforce WIP or apply a mutation. Its future transaction owner must require current SQL authority, target catalogs, revisions, preview and the canonical writer/WIP checks. Due/tag groups gain no WIP policy implicitly. Input and reference bounds fail closed, without truncation.

Group kinds here are ephemeral helper types. The frozen persisted TaskGroup/ViewConfig formats, migration registrations, startup, routes and UI stay unchanged. In particular, adding tag grouping to persisted views still needs an explicit compatible version/validation boundary and native recovery proof. This helper is preparation for P08/P09; it does not complete grouping transport/preview/apply, workflow completion or the full master plan.
