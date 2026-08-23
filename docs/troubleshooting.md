# Troubleshooting

## User-specific EVE Guide

- `GUIDE_CONFLICT` means another MCP host revised the page first. Read the page
  again and retry maintenance with its latest `revision` as
  `expected_revision`.
- `GUIDE_INVALID` means a manually edited or damaged Markdown page failed the
  strict metadata or safety checks. `get_server_diagnostics` reports
  `storage.guide` and search isolates malformed pages. Inspect the private
  `guide/pages` file locally; do not paste its private content into logs or a
  public issue.
- `GUIDE_UNAVAILABLE` affects only guide recall or maintenance. Direct ESI, SDE,
  and fitting tools remain usable. Verify that `guide` under the application
  data directory is a private directory rather than a file or symbolic link.
- If `disconnect_character` reports that private guide cleanup is pending,
  repair guide directory access and retry the same disconnect. The character
  remains disabled until its character-scoped pages and revisions are removed.

Start with `eve-copilot-mcp setup`, `eve-copilot-mcp doctor`, and
`get_server_diagnostics`. Setup reports the effective config file, exact EVE
callback, public Client ID/User-Agent readiness, and current read-scope count.
Diagnostics
show the pinned ESI digest and coverage totals, installed SDE build, cache
outcomes, read retries, rate-limit groups, recent stable error categories,
enabled action families, action-plan states, and missing scopes per feature
bundle without exposing private values.

| Error or symptom | Meaning | Safe next step |
|---|---|---|
| ESI User-Agent or EVE Client ID is not configured | Public ESI identification or private-character SSO setup is incomplete. | Ask the plugin to set up EVE Copilot, or run `eve-copilot-mcp setup --use-default-user-agent` followed by `eve-copilot-mcp setup`. |
| `CHARACTER_NOT_SELECTED` | No connected character is active. | Use `connect_character`, finish the browser flow, then `select_character`. |
| `MISSING_SCOPE` | The current grant lacks the capability's smallest approved bundle. | Call `reauthorize_character` with the returned capability ID. |
| Repeated read authorization pages | Incremental authorization is the safe default, so each newly used feature can add its smallest scope set. | After assigning all documented read scopes to the same EVE application client ID, call `reauthorize_character` once with `scope_mode: "all_reads"`. Action scopes remain separate. |
| EVE SSO shows `invalid_scope` | The requested scope exists in ESI but is not assigned to this client ID's EVE developer application registration. The authorization page rejects it before the local callback runs. | Add the intended read scope to the application in the EVE Developers Portal, save the registration, then start `reauthorize_character` again. Do not broaden the MCP bundle as a workaround. |
| `INSUFFICIENT_ROLE` | OAuth is present but current membership or an in-game role is absent. | Verify the target corporation/fleet and obtain one listed EVE role; reauthorization cannot grant roles. |
| `SDE_UNAVAILABLE` | A semantic operation needs static names or classification. | Run `eve-copilot-mcp sde install`; use `sde update` when an older importer build is invalid. |
| `SDE_INVALID` | The active requirement graph contains a cycle, self-edge, invalid skill target, or unreadable evidence. | Do not rely on a partial eligibility answer. Run `eve-copilot-mcp sde update`; retain the previous valid build if a new import fails. |
| `INVALID_CONTINUATION` | The opaque token expired, was modified, or belongs to another character/generation/tool. | Restart the read without a continuation. |
| `PAGINATION_SOURCE_CHANGED` warning | ESI's collection changed while continuations were being followed. | Use the bounded result as a changing snapshot; restart the read when a fresh complete traversal matters. |
| `RATE_LIMITED` | ESI requested a delay. | Respect `retry_after_ms`; the local coordinator will slow later calls proactively. |
| `UPSTREAM_CONTRACT_MISMATCH` | ESI or SDE data no longer matches the pinned validated schema. | Do not bypass validation. Update only after reviewing the official contract and regenerating artifacts. |
| `ACTION_REQUIRES_CONFIRMATION` | A state-changing operation was sent through a read path. | Enable only the intended family, then use `prepare_eve_action`. |
| `ACTION_PLAN_EXPIRED` or replay rejection | The short-lived plan is no longer executable. | Prepare a new plan and review its exact target/effect. |
| `ACTION_OUTCOME_UNCERTAIN` | The network failed after action transmission. | Use a read-only capability to verify EVE state before considering another action. |

Actions do not appear in tool discovery unless both the master switch and at
least one reviewed family are enabled. An identifiable ESI User-Agent with an
email address or contact URL is required for ESI calls. The loopback redirect
URI must exactly match the EVE developer application registration.
