---
name: eve-wormhole-expedition
description: Maintain a temporary character-scoped wormhole expedition graph in the LLM-managed EVE Guide using current ESI location and explicit pilot jump and bookmark reports. Use when the pilot starts, continues, corrects, routes through, or ends a wormhole expedition; do not use an external mapper or autonomous tracking.
---

# EVE wormhole expedition

Maintain the pilot's temporary wormhole chain as model-managed guide knowledge.
Keep the interaction fast and turn-driven. Use `get_current_location` and the
EVE Guide search, read, and maintenance tools for the workflow; do not use an
external wormhole mapper, a dedicated wormhole database, or background polling.

Reuse an EVE Copilot profile already loaded for this turn. Otherwise call
`get_eve_copilot_profile` with the first independent reads and apply only its
presentation contract. Do not repeat that call during the expedition workflow
or let persona affect graph facts and routing.

## Manage the guide page dynamically

Search the selected character's visible guide knowledge for the active
wormhole expedition. Reuse its current canonical page when found. If the page
is already known from this conversation, read it directly instead of searching
again.

Never assume a fixed page ID, title, filename, or character ID. When a new page
is needed, choose a clear discoverable identity consistent with the existing
guide, use `scope: character`, and let `maintain_eve_guide` bind the selected
character. Preserve the page's established representation when revising it.
Use `expected_revision`; after a revision conflict, read the current page once,
merge the reported fact, and retry once.

Keep the page a dated snapshot with the actual location observation time. Store
compact synthesized facts, not raw tool responses or conversation text.

## Preserve the graph meaning

The representation is model-owned, but it must preserve:

- expedition state, start system, current system, and observation time;
- one node for every ESI-confirmed system visited;
- one edge for every explicitly reported completed wormhole jump;
- the signature used in the origin system;
- the return bookmark created in the destination system;
- active, collapsed, or otherwise corrected connection state.

Every observed jump supplies two directional navigation facts:

```text
origin --departure signature--> destination
destination --return bookmark--> origin
```

The return bookmark belongs to the destination where the pilot created it. Do
not attach it to the origin. Never invent a system, jump, signature, bookmark,
or connection state.

## Start or resume

For “start a wormhole expedition from my location”:

1. Read the current ESI location and search for active expedition knowledge;
   perform these independent reads together when possible.
2. If there is no active expedition, create a character-scoped guide page with
   the current system as both start and current node.
3. If an active expedition clearly represents the same run, resume it. Start a
   replacement only when the pilot asks for a new or restarted expedition, and
   close the previous page through the normal guide lifecycle.
4. Confirm the start system and that the temporary graph is ready.

Do not establish a start node when the current solar system is unavailable.

## Record a completed jump

Treat a pilot statement such as “I entered `A-123` and bookmarked the return as
`HOME`” as authorization to record that completed transition.

1. Read the active expedition page and current ESI location, together when
   possible.
2. Use the page's current node as origin and fresh ESI system as destination.
3. Add or reconcile the destination node and the two directional labels, then
   update the page's current node and observation time.
4. Reply briefly with `origin → destination`, the departure signature, and the
   return bookmark stored at the destination.

Do not record the edge if the report omits either required label, ESI still
shows the origin, or the saved current node cannot be reconciled with the
reported transition. Ask only for the one missing fact or tell the pilot to
retry after ESI reflects the jump.

## Route home

Refresh current ESI location and read the active graph. Find a path from the
current node to the expedition start using only connections whose relevant
direction has a known navigation label and is not marked collapsed. Prefer the
shortest valid path when more than one exists.

Return concise turn-by-turn directions. Distinguish bookmark labels from probe
scanner signatures, for example:

```text
1. In the current system, warp to bookmark `2`; jump to the next system.
2. Warp to bookmark `1`; jump.
3. Warp to bookmark `HOME`; jump to the start system.
```

If the fresh location is absent from the graph or no labeled active path
exists, say exactly which transition is missing or stale instead of guessing.

## Correct the expedition

Apply explicit reports of a collapsed hole, renamed bookmark, wrong signature,
or wrong connection by revising the same graph and preserving useful history.
Exclude collapsed connections from routes.

## End and clean up

Treat a clear imperative such as “end it,” “end the expedition,” or “finish and
clear this expedition” as the pilot's consent to clean up the selected
character's active expedition knowledge. Do not ask for a second confirmation.

1. Resolve and read the same active character-scoped expedition page used by
   this workflow. If its identity is not already known, search before acting.
2. Remove that page with `maintain_eve_guide` and its current
   `expected_revision`. Guide-managed recoverability remains unchanged, but
   the expedition must disappear from ordinary current-page recall.
3. Confirm briefly that the expedition ended and its active graph was removed.

A question, status check, route request, or vague statement that the expedition
may be over is not cleanup consent. If no active expedition exists, say so. If
more than one page could be the active expedition, ask which one instead of
removing multiple pages. Never remove user-scoped knowledge, another
character's page, an unrelated guide page, or historical expeditions. A clear
request to restart or replace the current expedition also authorizes removal
of that resolved active page before creating the replacement.

Cleanup is local guide maintenance only. Do not perform remote map cleanup or
delete any other game, plugin, character, or guide data.

## Stay fast

- Do not call unrelated fitting, market, route, mapper, or discovery tools.
- Reuse the known active page identity within the conversation.
- Parallelize independent location and guide reads when the host permits.
- Keep successful start, jump, correction, routing, and cleanup responses
  operational and short unless the pilot asks for the full graph.
