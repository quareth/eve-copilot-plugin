---
name: eve-uninstall
description: Safely remove EVE Copilot, its host registrations, runtime, credentials, configuration, static data, database, and private guide. Use when the user asks to uninstall or completely purge EVE Copilot; do not use for disconnecting one character, disabling one feature, or repairing an installation.
---

# EVE Copilot uninstall

Conduct the removal instead of giving the user a generic list of folders. Keep
the order below: protected credentials depend on references in local state, and
the runtime and current plugin instructions are needed until cleanup is done.

Treat these as separate layers:

- host-owned plugin registration and cached agents, skills, manifests, and
  assets;
- the agent-managed `eve-copilot-mcp` runtime under the private application
  data directory, plus any legacy global npm installation;
- EVE Copilot configuration, SQLite state, SDE files, and private guide pages;
- operating-system credentials stored under the exact service name
  `EVE Copilot MCP`;
- an optional user-owned Git checkout, but only when a local-development
  marketplace was used instead of the normal GitHub-backed marketplace.

The normal GitHub installation creates host-owned plugin cache, not a
user-owned source checkout. If a local-development checkout does exist, it is
user-owned source rather than disposable plugin cache. Never delete it merely
because the plugin is being removed.

## Establish scope and inventory

Determine whether the user wants either:

1. **Plugin only** — remove host registrations and cached plugin files while
   preserving the runtime, configuration, character access, SDE, and guide; or
2. **Complete purge** — remove every EVE Copilot layer listed above, with the
   checkout handled as a separately confirmed final choice.

Inspect before changing anything:

- operating system and installed hosts;
- `codex plugin list --json`, `codex plugin marketplace list --json`, and/or
  `claude plugin list --json`, according to what is installed;
- the managed runtime reported by
  `scripts/install-eve-copilot-mcp.mjs status` and any legacy global npm
  installation of `eve-copilot-mcp`;
- the plugin launcher `setup` output and the effective `EVE_COPILOT_*` environment
  overrides;
- configured/default config file, data directory, database, SDE directory, and
  `guide` directory;
- every page from `list_characters` and any known unfinished authorization
  sessions;
- whether the marketplace is GitHub-backed or points to a user-owned local
  checkout; for the latter, inspect its path and whether it contains
  uncommitted or unrelated files.

Do not display configuration secrets, credential values, OAuth material, or
private guide content. Resolve and retain exact absolute cleanup paths before
removing configuration. Custom database or SDE paths may live outside the
default application directory.

Before the first destructive step, summarize exactly what will be removed and
ask for one explicit confirmation. A request to remove only the plugin is not
permission to erase character data or the guide. If the user chose a complete
purge, the confirmation must name character authorizations, local database,
SDE, guide, configuration, runtime, and host registrations.

## Complete-purge order

Skip this section for plugin-only removal.

1. Cancel every known unfinished EVE authorization session. If a callback is
   currently being verified, wait for a terminal result instead of racing it.
2. Page through `list_characters`, call `disconnect_character` for every
   connected or removal-pending character, then list again. Do not continue
   while a character remains or credential/guide cleanup is pending. Repair or
   retry the reported cleanup first.
3. Remove any remaining operating-system credentials whose service is exactly
   `EVE Copilot MCP`, including abandoned PKCE entries and chunk entries. Use
   credential metadata only and never print stored values. Do not delete
   similarly named credentials belonging to another application.
4. Stop only running EVE Copilot MCP processes. Never terminate Node.js,
   ChatGPT, Codex, Claude, or unrelated MCP processes broadly. If the current
   host cannot release the runtime or SQLite files safely, give the user the
   exact remaining command and require the host to be closed before continuing.
5. Delete the resolved EVE Copilot database plus its `-wal` and `-shm` files,
   the resolved SDE directory, the `guide` directory, and the configuration
   file. Remove the dedicated application data directory only after verifying
   it is the resolved EVE Copilot directory and contains no unrelated user
   files. For a custom directory, remove only EVE Copilot-owned paths and leave
   unrelated contents untouched.
6. The managed runtime is inside the dedicated EVE Copilot application data
   directory and is removed with that directory after the safety checks above.
   If a legacy global npm package is actually present, uninstall it only after
   all runtime commands and local-data cleanup are finished with
   `npm uninstall --global eve-copilot-mcp`.

Never recursively delete a filesystem root, the user's home directory, the
global `.codex` or `.claude` directory, a workspace root, or a path derived from
an unresolved variable, glob, or command substitution.

## Remove host registrations last

Remove only registrations proven to belong to EVE Copilot:

- Codex plugin: `codex plugin remove eve-copilot@eve-copilot`;
- Codex marketplace: `codex plugin marketplace remove eve-copilot`;
- Claude plugin: `claude plugin uninstall eve-copilot@eve-copilot` using its
  actual installed scope;
- Claude marketplace: `claude plugin marketplace remove eve-copilot`.

Run only the commands for hosts where the plugin or marketplace is actually
present. Remove the marketplace after its plugin. Do not remove a marketplace
that contains other installed plugins without explaining the impact and
obtaining separate approval.

If a user-owned local-development checkout exists, report its absolute path and
Git status. Offer to retain it or remove it. Treat removal as a separate
destructive decision, especially when it is dirty, contains untracked files,
or serves another project. Prefer a recoverable move to the operating-system
trash when available. Do not apply this step to the normal host-owned GitHub
plugin cache; removing the plugin and marketplace owns that cache cleanup.

## Verify the result

For a plugin-only removal, prove that the target hosts no longer list EVE
Copilot and that its host cache is gone. Explicitly report that preserved
runtime and private data remain.

For a complete purge, verify without recreating state:

- no host lists the plugin or its dedicated marketplace;
- the managed runtime path is absent and any legacy `eve-copilot-mcp` command
  no longer resolves;
- every resolved EVE Copilot config, database, WAL/SHM, SDE, guide, and default
  data path is absent, except unrelated files deliberately preserved from a
  custom directory;
- the operating-system credential store has no entry with service
  `EVE Copilot MCP`;
- any optional local-development checkout outcome matches the user's separate
  choice.

Do not run the installer, launcher, `doctor`, `setup`, or the MCP server after
local data deletion because those commands may recreate the application
directory or database. Finish with a compact removal report listing what was
deleted, what was retained, and anything that still requires the host to be
closed.
