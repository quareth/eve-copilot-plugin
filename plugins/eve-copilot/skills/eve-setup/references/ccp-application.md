# CCP application and ESI scope setup

Use this reference only when the user wants private character data or is
repairing EVE SSO authorization.

## Official locations

- Application management: <https://developers.eveonline.com/applications>
- EVE SSO and PKCE: <https://developers.eveonline.com/docs/services/sso/>
- ESI User-Agent guidance:
  <https://developers.eveonline.com/docs/services/esi/best-practices/>

The application page redirects to official EVE login when the user is not
signed in. The user must complete that login directly. Never collect their EVE
password, authenticator code, access token, refresh token, or client secret.

## Registration values

Explain the form in ordinary language and adapt to the current portal labels:

- Name/description: a recognizable local name such as `EVE Copilot Local`.
- Callback/redirect URI: copy `configuration.callback_uri` from
  `eve-copilot-mcp setup`; normally it is exactly
  `http://127.0.0.1:17600/oauth/callback`.
- OAuth flow/application type: choose the option supporting Authorization Code
  with PKCE or a native/desktop public client when the portal distinguishes it.
- Client ID: this is the public application identifier to copy after creation.
- Client secret: not used and never requested by EVE Copilot.

The loopback address means "this computer." The user does not need to host a
website, open an internet-facing port, choose an IP address, or configure a
router. The URI must match exactly because EVE SSO rejects unregistered
redirects.

## Scope choice

EVE SSO allows an application to request only scopes assigned in its developer
registration, and the player must then consent to the requested scopes. Retrieve
the maintained lists from `eve-copilot-mcp setup --show-scopes`; do not copy a
stale hard-coded list into the conversation.

- Minimum connection: assign `initial_character_scopes`. This provides current
  location and active ship type and allows later incremental authorization only
  for other scopes that were also assigned in the portal.
- Full read-only EVE Copilot: assign every `available_read_scopes` value. This
  is the recommended choice when the user wants skills, assets, fittings,
  exploration, combat, mining, markets, industry, fleet, or corporation context
  without returning to application settings later.
- Actions: do not assign write/action scopes during ordinary setup. Add only a
  specifically requested action family's scopes after the user enables that
  family and understands its confirmations.

Corporation information remains limited by the selected character's in-game
roles even when its OAuth scope is assigned. Assigning a scope does not bypass
EVE permissions.

## Browser boundary

Browser assistance may open the portal, inspect the visible form after login,
and fill the values above. The user performs authentication. Before submitting
or saving a new application or changed scope set, summarize the exact name,
callback, and access profile and obtain confirmation. After creation, ask only
for the displayed public Client ID and store it through `eve-copilot-mcp setup
--eve-client-id <id>`.
