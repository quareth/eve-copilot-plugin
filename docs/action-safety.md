# EVE action safety

EVE-side actions are installed but disabled by default. Reading additional EVE
data does not enable actions, and action OAuth scopes are never part of a read
bundle.

## Enabling an action family

Both the master switch and each intended family must be configured before an
action can be prepared:

```text
EVE_COPILOT_ACTIONS_ENABLED=1
EVE_COPILOT_ACTION_FAMILIES=ui_actions,calendar_respond
```

The equivalent JSON configuration fields are `actions_enabled: true` and
`action_families: ["ui_actions", "calendar_respond"]`. Restart the server after
changing configuration. The selected character must then explicitly grant the
exact capability scopes through `reauthorize_character`.

| Family | Examples | Scope bundle |
|---|---|---|
| `calendar_respond` | Accept, decline, or tentatively respond to an event | `action.calendar_respond` |
| `contacts_write` | Add, update, or delete contacts | `action.contacts_write` |
| `fittings_write` | Save or delete a fitting | `action.fittings_write` |
| `mail_send` | Send EVE mail | `action.mail_send` |
| `mail_organize` | Change mail labels, deletion, and read state | `action.mail_organize` |
| `fleet_write` | Invite, move, rename, or remove fleet entities | `action.fleet_write` |
| `ui_actions` | Set a waypoint or open an EVE client window | `action.ui_actions` |

The broader `mail_write` name is deliberately not accepted: choose `mail_send`,
`mail_organize`, or both so a configuration change never grants more mail
authority implicitly.

## Confirmation lifecycle

1. Find the action capability with `find_eve_capabilities`.
2. Call `prepare_eve_action` with its exact arguments. For common actions, the
   enabled family also exposes a fixed-purpose preparation wrapper:
   `set_autopilot_waypoint`, `respond_to_calendar_event`, `send_eve_mail`,
   `save_fitting`, or `delete_saved_fitting`.
3. Show the user the returned character, effect, targets, scope, expiry, and
   irreversibility indicator.
4. Stop and ask the user to approve or reject that exact prepared action. Do
   not call `execute_eve_action` in the same assistant turn.
5. Only after the user sends a new message explicitly approving that exact
   action, pass the returned plan ID and confirmation value to
   `execute_eve_action`.

The original request to send, save, delete, move, invite, or otherwise change
something is permission to prepare only; it is not permission to execute. Do
not infer approval from enabled configuration, granted scopes, an earlier
confirmation, or a general request. If any action detail changes, prepare a new
plan and ask again.

Preparation never changes EVE state. A plan is stored locally for at most five
minutes, is bound to the selected character and authorization generation, and
contains an argument digest. The confirmation secret is stored only as a hash.
Execution rechecks configuration, character binding, scopes, fleet membership,
fleet-command authority for fleet writes, and applicable authorization context
before atomically marking the plan in progress.

A plan can execute only once. Expired, changed, completed, failed, or uncertain
plans cannot be replayed. Non-idempotent ESI actions are never retried
automatically. If the connection is lost after transmission, the result is
`ACTION_OUTCOME_UNCERTAIN`; use a read-only capability to verify EVE state before
considering another action.

This confirmation is an instruction-level safeguard for the connected
assistant. The server validates the plan and confirmation value, but it cannot
independently prove that a human authored the approval message.

## Local audit and privacy

The local audit records plan ID, capability and operation IDs, character ID,
authorization generation, state transition, a target digest, safe error code,
and timestamp. It does not store access tokens, confirmation secrets, raw action
bodies, mail content, or readable target payloads. Terminal plans and audit
events are bounded to 30 days and 10,000 records during normal action use.
Complete character removal deletes that character's plans and audit events.

The action executor accepts no caller-provided URL, HTTP method, headers, token,
or scope. Only the reviewed operations and families in the generated catalog
can reach ESI.
