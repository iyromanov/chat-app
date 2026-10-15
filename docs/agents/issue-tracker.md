# Issue tracker: Local Markdown

Specs and tickets live in the repository as Markdown files.

- Spec: `.scratch/<feature-slug>/spec.md`.
- Tickets: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`.
- Use one file per ticket, numbered from 01, blockers first.
- Each ticket includes What to build, Blocked by, Status,
  acceptance criteria, and a link to the spec.
- Record triage statuses using `triage-labels.md`.
- Append discussion under `## Comments`.

To publish, create the appropriate file.
To fetch, read the referenced file; resolve ambiguous numbers
before proceeding.
Work tickets whose blockers are complete.
Keep these files versioned in Git.
