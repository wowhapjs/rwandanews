# Newsroom v2 implementation contract

This branch implements the JSRD News newsroom redesign without developing in the production working tree.

## Product modes
- Reader: public, mobile-first news-only experience. Authentication is optional for reading.
- Reporter: authenticated newsroom desk for writing owned articles, Markdown editing, preview, lead/body image upload, drafts and review submission.
- Admin: full operations UI plus a role/view switcher that can enter Reporter or Reader presentation without changing the account's effective authorization.

Authorization and presentation mode are separate concepts. Server APIs must enforce effective roles; hiding UI controls is not authorization.

## Article lifecycle
DRAFT -> IN_REVIEW -> PUBLISHED -> ARCHIVED. Revision history and audit events are retained. Reporter publish permission is policy-controlled.

## Source protocol v2
DISCOVER -> FETCH -> PARSE -> NORMALIZE -> VALIDATE -> DEDUP -> STORE -> POST_PROCESS.
Adapters contain source-specific discovery/parsing only. Shared retry, rate limiting, validation, diagnostics and deduplication live in protocol code. Every adapter should have saved HTML fixtures and parser tests before enablement.

## AI story clustering
Automatic heuristic grouping must not write story-cluster relationships. Admin creates a bounded batch, copies an agent command, pastes JSON results, validates them, previews the proposed mutations, then explicitly applies them. Every apply operation is audited and reversible.

Recovery includes a previewable operation to unlink the latest 150 article-to-cluster associations. The limit refers to associations, not 150 clusters. The operation must retain enough before-state to restore associations.

## Safety and release
Develop -> Verify -> Commit -> staging -> Verify -> merge main -> explicit full-SHA deploy -> local/public health -> record/SYNC.
Staging must not write production DB and must not copy production secrets.
