# EVE scope bundles

Generated from the pinned ESI contract and reviewed scope-bundle policy.
Initial connection requests only `core_context`. Additional authorization is
additive and explicit for a selected capability. The server requests the exact
operation scope set, which is never broader than the documented bundle. Action
bundles are separate and are never included in read-only setup.

Users who have intentionally assigned every reviewed read scope to their EVE
developer application may call `reauthorize_character` with
`scope_mode: "all_reads"`. This produces one explicit EVE consent page for the
union of all 64 read scopes. It never adds action scopes. The default
`scope_mode: "minimum"` behavior remains incremental and least-privileged.

| Bundle | Kind | Purpose | Capabilities | Scope ceiling |
|---|---|---|---:|---|
| `action.calendar_respond` | `action` | Explicit opt-in to calendar response actions. | 1 | `esi-calendar.respond_calendar_events.v1` |
| `action.contacts_write` | `action` | Explicit opt-in to contact mutation actions. | 3 | `esi-characters.write_contacts.v1` |
| `action.fittings_write` | `action` | Explicit opt-in to saved-fitting mutation actions. | 2 | `esi-fittings.write_fittings.v1` |
| `action.fleet_write` | `action` | Explicit opt-in to fleet mutation actions. | 10 | `esi-fleets.read_fleet.v1`<br>`esi-fleets.write_fleet.v1` |
| `action.mail_organize` | `action` | Explicit opt-in to mail label, deletion, and read-state actions. | 4 | `esi-mail.organize_mail.v1` |
| `action.mail_send` | `action` | Explicit opt-in to sending EVE mail. | 1 | `esi-mail.send_mail.v1` |
| `action.ui_actions` | `action` | Explicit opt-in to EVE client UI actions. | 5 | `esi-ui.open_window.v1`<br>`esi-ui.write_waypoint.v1` |
| `character_profile` | `read` | Skills, clones, implants, roles, standings, loyalty, and character activity. | 35 | `esi-access.read_lists.v1`<br>`esi-characters.read_agents_research.v1`<br>`esi-characters.read_blueprints.v1`<br>`esi-characters.read_contacts.v1`<br>`esi-characters.read_corporation_roles.v1`<br>`esi-characters.read_fatigue.v1`<br>`esi-characters.read_freelance_jobs.v1`<br>`esi-characters.read_fw_stats.v1`<br>`esi-characters.read_medals.v1`<br>`esi-characters.read_notifications.v1`<br>`esi-characters.read_standings.v1`<br>`esi-characters.read_titles.v1`<br>`esi-clones.read_clones.v1`<br>`esi-clones.read_implants.v1`<br>`esi-fleets.read_fleet.v1`<br>`esi-killmails.read_killmails.v1`<br>`esi-location.read_online.v1`<br>`esi-search.search_structures.v1`<br>`esi-skills.read_skillqueue.v1`<br>`esi-skills.read_skills.v1`<br>`esi-structures.read_character.v1`<br>`esi-universe.read_structures.v1`<br>`esi.activity.char:read`<br>`esi.cosmetic.char:read` |
| `communication` | `read` | Calendar, mail reads, contacts, and notifications. | 11 | `esi-activities.read_character.v1`<br>`esi-calendar.read_calendar_events.v1`<br>`esi-characters.read_contacts.v1`<br>`esi-mail.read_mail.v1` |
| `core_context` | `read` | Current location and active ship context. | 2 | `esi-location.read_location.v1`<br>`esi-location.read_ship_type.v1` |
| `corporation_read` | `read` | Corporation and alliance data, still subject to current membership and in-game roles. | 50 | `esi-alliances.read_contacts.v1`<br>`esi-assets.read_corporation_assets.v1`<br>`esi-characters.read_corporation_roles.v1`<br>`esi-contracts.read_corporation_contracts.v1`<br>`esi-corporations.read_blueprints.v1`<br>`esi-corporations.read_contacts.v1`<br>`esi-corporations.read_container_logs.v1`<br>`esi-corporations.read_corporation_membership.v1`<br>`esi-corporations.read_divisions.v1`<br>`esi-corporations.read_facilities.v1`<br>`esi-corporations.read_freelance_jobs.v1`<br>`esi-corporations.read_fw_stats.v1`<br>`esi-corporations.read_medals.v1`<br>`esi-corporations.read_projects.v1`<br>`esi-corporations.read_standings.v1`<br>`esi-corporations.read_starbases.v1`<br>`esi-corporations.read_structures.v1`<br>`esi-corporations.read_titles.v1`<br>`esi-corporations.track_members.v1`<br>`esi-industry.read_corporation_jobs.v1`<br>`esi-industry.read_corporation_mining.v1`<br>`esi-killmails.read_corporation_killmails.v1`<br>`esi-markets.read_corporation_orders.v1`<br>`esi-planets.read_customs_offices.v1`<br>`esi-structures.read_corporation.v1`<br>`esi-wallet.read_corporation_wallets.v1` |
| `economy` | `read` | Wallet, orders, contracts, industry, mining, planetary colonies, and related economy data. | 14 | `esi-characters.read_loyalty.v1`<br>`esi-contracts.read_character_contracts.v1`<br>`esi-industry.read_character_jobs.v1`<br>`esi-industry.read_character_mining.v1`<br>`esi-markets.read_character_orders.v1`<br>`esi-markets.structure_markets.v1`<br>`esi-planets.manage_planets.v1`<br>`esi-wallet.read_character_wallet.v1` |
| `fleet_read` | `read` | Fleet membership and fleet information visible to the selected character. | 3 | `esi-fleets.read_fleet.v1` |
| `inventory` | `read` | Assets, asset resolution, blueprints, and saved fittings. | 4 | `esi-assets.read_assets.v1`<br>`esi-fittings.read_fittings.v1` |

Reauthorization preserves the current working grant until the replacement SSO
flow completes, verifies the intended character, rotates protected credentials,
increments the authorization generation, and invalidates private cached state.
Corporation roles are in-game permissions and cannot be granted by OAuth.
