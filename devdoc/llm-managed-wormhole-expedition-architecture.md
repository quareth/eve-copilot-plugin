# Architectural decision: LLM-managed temporary wormhole expedition graph

Status: accepted direction

Scope: architectural intent only; this is not an implementation specification

## Intent

Give a pilot a fast, conversational way to record a temporary wormhole chain
and later retrace it to the expedition's starting system. The pilot reports
completed jumps and the return bookmark created after each jump. EVE Copilot
uses the selected character's current ESI location to ground those reports and
keeps the resulting temporary knowledge graph in the existing LLM-managed EVE
Guide.

The experience should be lightweight:

- “Start a wormhole expedition from my location” establishes the start node.
- “I entered `A-123` and bookmarked the return as `HOME`” expands the graph
  from the prior location to the current ESI location.
- Later jump reports add further nodes and directional navigation labels.
- “Take me home” reads the graph and returns the ordered in-game bookmarks to
  follow back to the start.
- “End the expedition” supplies consent to remove the active temporary graph
  from ordinary guide recall.

## Decision

Use one small orchestration skill over capabilities that already exist:

- `get_current_location` supplies the authoritative selected-character system.
- The EVE Guide search, read, and maintenance tools hold the temporary graph.
- The model creates and manages the appropriate character-scoped guide page,
  including its identity, title, lifecycle, and revisions.

The skill defines the graph's meaning, not a hardcoded persistence layout.
Guide page IDs, filenames, character identifiers, and serialized page content
remain owned by the existing guide workflow and the model using it. No new
wormhole database, repository, migration, provider profile, or mapper API is
introduced.

The temporary graph contains these semantic facts:

- an expedition start system and current system;
- one node for each ESI-confirmed solar system visited;
- one edge for each explicitly reported completed wormhole jump;
- the signature used on the departure side;
- the bookmark created on the arrival side that returns across that edge;
- observation and lifecycle context needed to distinguish active, collapsed,
  or ended knowledge.

The direction of the navigation labels is essential. If the pilot jumps from
Amarr through `A-123`, arrives in another system, and bookmarks the return hole
as `HOME`, the graph records both meanings:

```text
Amarr --A-123--> destination
destination --HOME--> Amarr
```

This is enough to calculate a path over branching or revisited systems and to
present the bookmark to use from each system on the way home.

## Operating model

The workflow is turn-driven, not continuously running. Starting, expanding,
routing, correcting, and ending the graph happen only in response to the
pilot's messages.

For a reported jump, the prior graph location is the observed origin and the
fresh ESI location is the destination. The report supplies the departure
signature and arrival-side return bookmark. The model revises the active
character-scoped guide knowledge and briefly confirms the new edge.

For a route request, the model refreshes current location, reads the active
expedition knowledge, finds a path to the start node, and returns the ordered
arrival-side bookmarks. The graph represents the pilot's latest observations;
collapsed or changed holes must be reported so the model can revise it.

An explicit request to end, clear, restart, or replace the expedition is the
pilot's consent to remove the resolved active character-scoped expedition page
through the normal guide lifecycle. It does not require a second confirmation.
Ambiguous statements and status questions are not cleanup consent. Cleanup
targets only that active page; unrelated, user-scoped, other-character, and
historical guide knowledge remains untouched. Guide-managed recoverability is
unchanged, and there is no remote map cleanup.

## Architectural boundaries

- WormholeSystems and other external mappers are not part of this design.
- No background process, poller, daemon, or autonomous character tracker is
  required.
- No dedicated wormhole MCP tools or server-side graph engine are required.
- No application database schema is added for expedition state.
- The model never invents a jump, destination, signature, or bookmark. ESI
  grounds location; the pilot supplies completed-jump and bookmark facts.
- EVE Copilot does not create or activate in-game bookmarks. It remembers and
  routes using the names the pilot reports.
- This decision does not redesign the general EVE Guide. Wormhole expeditions
  are one temporary, character-scoped use of its existing LLM-managed model.

## Why this direction

The existing guide already provides private character scope, revisions,
concurrency protection, lifecycle management, and LLM-owned organization.
Reusing it keeps the feature conversational and small. A provider integration
or separate deterministic persistence layer would duplicate those capabilities
and add setup, credentials, synchronization, cleanup, and failure modes that
are unnecessary for the intended solo expedition workflow.

The accepted tradeoff is that this is model-managed observational knowledge,
not a live authoritative mapper. That matches the intent: fast recording and
backtracking for explicitly reported expeditions, without operating another
mapping product.
