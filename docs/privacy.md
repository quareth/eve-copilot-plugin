# Privacy and local data

EVE Copilot is a local plugin with an agent-managed MCP capability server. The server
runs over local stdio, contains no model runtime, sends no data to a model
provider itself, and requires no model-provider API key. The plugin host decides
what tool results enter a conversation.

## Stored locally

- Character identifiers, verified names, selected-character state, granted
  scope names, and authorization generation are stored in SQLite.
- Access and refresh tokens are stored through the operating-system credential
  store. SQLite contains only opaque credential references.
- Validated private ESI cache entries are partitioned by character,
  authorization generation, organization context, and role-policy version.
- Continuations, action plans, and sanitized action audit events are bounded and
  stored locally. Confirmation values are stored only as hashes.
- Installed SDE databases contain public static EVE data and their build number.
- Requirement-closure cache entries contain only public SDE edges and are
  isolated by build and target. Character skill levels are never stored in that
  static cache, and `check_requirements` exposes only closure-relevant levels
  instead of the complete raw character skill document.
- Guide pages and immutable revisions are private Markdown under the
  application data directory. They contain selective advisory synthesis, not
  conversation transcripts or raw ESI responses. Character-scoped pages are
  visible only for the matching selected, connected character.

Logs and MCP responses must not contain tokens, authorization headers, OAuth
state, PKCE verifier values, credential references, raw private cache bodies,
mail/action bodies, confirmation secrets, or guide page content. CI runs a package-content audit
and a targeted repository secret scan.

## Removing a character

`disconnect_character` performs complete character-specific local removal. It removes the
operating-system credential, character record, authorization sessions, refresh
coordination state, private cache entries, continuations, action plans, and
action audit records, and character-scoped guide pages and revisions for that
character. User-scoped guide pages are not published, merged, or removed. If
credential or private guide deletion cannot finish,
the character remains in a removal-pending state and is not usable.

Removing the server's configured private data directory deletes remaining local
SQLite state, installed SDE data, and the complete user guide. Stop all MCP hosts first and retain a
backup only if you intentionally need local audit or configuration history.

## Removing EVE Copilot

The `eve-uninstall` skill distinguishes host-plugin removal from a complete
purge. Removing only the plugin deletes the host's cached agents and skills but
preserves the runtime and private application data. A complete purge first
disconnects every character and removes remaining credentials under the
operating-system service `EVE Copilot MCP`; only then does it delete SQLite,
SDE, guide, configuration, and runtime files. This order prevents protected
credentials from being orphaned after their local references disappear.

The normal GitHub-backed installation uses host-owned plugin cache. A Git
checkout exists only for local development or manual MCP-only installation;
that checkout is user-owned source, is not application data, and requires a
separate, explicit deletion decision.

## External services

Authenticated calls go only to official EVE SSO and ESI origins. The explicit
`sde install` or `sde update` command downloads the official EVE SDE. Ordinary
startup, discovery, diagnostics, and local SDE lookups do not download it.
