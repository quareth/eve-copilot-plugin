# MCP Inspector setup

MCP Inspector can verify the provider-neutral MCP compatibility path. Install
the packed runtime globally, or run the built CLI from the repository.

Launch the interactive Inspector:

```sh
npx -y @modelcontextprotocol/inspector eve-copilot-mcp serve
```

Headless examples:

```sh
npx -y @modelcontextprotocol/inspector --cli eve-copilot-mcp serve --method tools/list
npx -y @modelcontextprotocol/inspector --cli eve-copilot-mcp serve --method resources/list
npx -y @modelcontextprotocol/inspector --cli eve-copilot-mcp serve --method resources/templates/list
```

For a live public ESI call, pass an identifiable User-Agent after the server
target and before the Inspector method:

```sh
npx -y @modelcontextprotocol/inspector --cli eve-copilot-mcp serve \
  -e EVE_COPILOT_ESI_USER_AGENT=eve-copilot/0.1-contact@example.com \
  --method tools/call --tool-name get_server_activity --tool-args-json '{}'
```

Replace the example contact. This value is sent to ESI for operator
identification and is not a secret.

For a repository build, replace `eve-copilot-mcp` with `node` and place
`dist/cli/main.js serve` before `--method`.

## Current smoke checklist

1. Connect with the stdio transport and list exactly 65 default tools,
   including `get_eve_copilot_profile` and the three user-specific EVE Guide
   tools.
2. Call `get_eve_copilot_profile`, `get_server_status`,
   `get_server_diagnostics`, and `get_eve_capabilities`.
3. Create, read, search, and remove one non-sensitive guide test page; verify
   advisory authority and revision metadata.
4. Call one public semantic tool and verify its structured result matches the
   JSON text result.
5. Search for a reviewed operation with `find_eve_capabilities`, then invoke it
   through `execute_eve_read`.
6. Submit an unknown property, raw URL, HTTP method, operation ID in the wrong
   field, and raw cursor; confirm all are rejected.
7. List and read the three static resources; list the capability-detail
   template and the three SDE templates.
8. Confirm EVE action tools are absent with default configuration.
9. Disconnect and confirm the child process terminates.

The automated official-SDK contract harness verifies the same wire operations.
