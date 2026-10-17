# Nexus AI v3.0 Regression Checklist

Use this checklist after changes that affect chat, layout, Threadline, storage, or the server. Record a result and a short note/date for each check.

## Result convention

- **PASS** — checked and the expected result occurred.
- **FAIL** — checked and the expected result did not occur; record steps and symptoms.
- **BLOCKED** — could not check because a dependency, permission, or setup was unavailable; say why.
- **NOT TESTED** — not checked during this pass.

Do not use PASS for a code review or a previous run. Keep the method label with each result.

## Safe setup

- Use a **disposable browser profile** and clearly labeled test conversations and Threadline records.
- Never inspect, copy, print, or share `.env`, API keys, environment variables, or real browser data.
- Never run destructive storage checks in a normal profile. Seed malformed or quota-failure cases only in disposable test data and preserve the exact test value when checking read-only behavior.
- Keep API checks local and controlled. Do not use a live API or send real conversation content as test data.
- Before a manual browser pass, confirm the backup or other recovery point is current.

## Previously reported checks

These results were **reported by the user in an earlier pass**. They are not independently verified here and do not replace the checks below.

- [x] **Manual browser — previously reported PASS:** normal chat and streaming.
- [x] **Manual browser — previously reported PASS:** Threadline create, edit, and reload persistence.
- [x] **Manual browser, disposable Chrome profile — previously reported PASS:** malformed JSON, unsupported schema version, invalid envelope, and invalid item each showed an error, blocked mutations, and preserved the stored value.
- [x] **Manual browser — previously reported PASS:** post-fix smoke test.

## Chat and history

- [ ] **Manual browser — NOT TESTED:** create a new chat; send with the button and Enter; confirm Shift+Enter inserts a newline.
- [ ] **Manual browser — NOT TESTED:** receive a complete streamed response; confirm it stops at `[DONE]`, the send control re-enables, and the completed messages survive reload.
- [ ] **Manual browser — NOT TESTED:** cause a controlled request failure and an interrupted stream; confirm the loading state clears and a subsequent send can be attempted.
- [ ] **Manual browser — NOT TESTED:** select a saved conversation, rename it, delete one conversation, and clear history; verify the expected chat state after each action.
- [ ] **Manual browser — NOT TESTED:** switch dark/light themes, reload, and confirm the chosen theme persists.
- [ ] **Isolated automated test — NOT TESTED:** verify request mapping sends only `{ role, content }` for messages while frontend message IDs remain in app state.
- [ ] **Isolated automated test — NOT TESTED:** exercise valid, rejected, interrupted, and empty stream cases; assert the completion/error path and loading cleanup.
- [ ] **Source-level check — NOT TESTED:** trace `sendMessage`, `[DONE]` parsing, error handling, `finally` cleanup, and `saveCurrent`/`saveChats` after related edits.

## Layout, controls, and keyboard

- [ ] **Manual browser — NOT TESTED:** on desktop, scroll a long chat and long history; check code blocks scroll horizontally without moving the whole page unexpectedly.
- [ ] **Manual browser — NOT TESTED:** on a narrow/mobile viewport, open and close the sidebar; check backdrop dismissal, navigation, and scroll behavior.
- [ ] **Manual browser — NOT TESTED:** confirm the fixed composer stays visible, long messages remain reachable above it, and a long draft can be edited and sent.
- [ ] **Manual browser — NOT TESTED:** open and dismiss Settings, Threadline, and the Threadline item form by close button, backdrop where provided, and Escape.
- [ ] **Manual browser — NOT TESTED:** use keyboard-only navigation through dialogs and menus; confirm visible focus, focus containment, focus restoration, and sensible tab order.
- [ ] **Manual browser — NOT TESTED:** open a history context menu, use Rename/Delete, dismiss with outside click and Escape, and check its position near viewport edges.
- [ ] **Manual browser — NOT TESTED:** repeat representative checks in dark and light themes and with reduced-motion preference enabled.
- [ ] **Source-level check — NOT TESTED:** inspect bounded scroll owners, flex/grid `min-height: 0`/`min-width: 0`, dynamic viewport sizing, composer stacking, backdrop visibility, and modal/menu z-index after layout edits.

## Threadline and storage safety

- [ ] **Manual browser — NOT TESTED:** create and edit each relevant item type; confirm the saved values and validation messages.
- [ ] **Manual browser — NOT TESTED:** test Active → Deferred → Resume, Active/Deferred → Complete, and Archive → Restore; verify status and timestamps after reload.
- [ ] **Manual browser — NOT TESTED:** save from a user and assistant message; verify source references while the source is available and the unavailable-source label after deleting its chat.
- [ ] **Manual browser, disposable profile — NOT TESTED:** repeat malformed JSON, unsupported version, invalid envelope, and invalid-item cases; confirm mutation controls are blocked and the original value remains unchanged.
- [ ] **Isolated automated test — NOT TESTED:** validate valid and invalid Threadline records, duplicate IDs, unsupported fields/schema, and source-reference shapes without real storage.
- [ ] **Isolated automated test — NOT TESTED:** simulate `localStorage.setItem` failure for create, edit, and status changes; confirm in-memory records roll back and the original persisted value is untouched.
- [ ] **Source-level check — NOT TESTED:** confirm Threadline continues to use only `nexus_threadline_v1`, guards all mutations on load status, and does not couple its persistence to `nexus_chats`.

## Server and security

- [ ] **Isolated automated test — NOT TESTED:** validate allowed and disallowed models, invalid roles/content, empty messages, message-count limit, and per-message length limit using mocked request data.
- [ ] **Isolated automated test — NOT TESTED:** check malformed JSON and oversized-body handling; verify the observable status/connection behavior and that oversized input does not reach the upstream request.
- [ ] **Isolated automated test — NOT TESTED:** exercise the rate-limit threshold and reset with a controlled clock or isolated server instance; do not call a live API.
- [ ] **Source-level check — NOT TESTED:** review `serveStatic` path normalization and ensure the containment check enforces a path boundary, including sibling paths sharing the public root’s textual prefix.
- [ ] **Source-level check — NOT TESTED:** verify the API key remains server-only, response headers remain applied, request validation occurs before upstream forwarding, and logs/errors do not reveal secrets.
- [ ] **Manual browser — NOT TESTED:** check Settings’ backend status against a local controlled server configuration without displaying or copying any secret.

## Run record

- Change/revision:
- Date:
- Tester:
- Browser/OS (if manual):
- Disposable profile used (if browser/storage checks):
- Summary of failures or blockers:
