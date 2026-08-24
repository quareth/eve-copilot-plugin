# EVE Copilot examples

[![Main README](https://img.shields.io/badge/project-main_README-374151?style=flat-square)](../../README.md)
[![Exploration](https://img.shields.io/badge/example-exploration-7c3aed?style=flat-square)](#exploration-expedition)
[![Voice chat](https://img.shields.io/badge/example-voice_chat-10a37f?style=flat-square)](#voice-chat-while-playing)
[![Fitting](https://img.shields.io/badge/example-fitting-2563eb?style=flat-square)](#current-ship-and-fitting)
[![Market and routes](https://img.shields.io/badge/example-market_%26_routes-d97757?style=flat-square)](#market-and-route-planning)
[![Mining](https://img.shields.io/badge/example-mining-c69214?style=flat-square)](#mining-preparation)

These examples come from actual EVE Copilot sessions rather than invented
mockups. The exploration animation is rendered from its real transcript; the
remaining images are direct screenshots. Market prices, traffic, routes,
character state, and other live information are snapshots from the time of
each conversation.

## Exploration expedition

The copilot checks the character's location, ship, fitting, and skills; prepares
a low-sec route and extraction plan; answers a site-entry question during the
expedition; and compares the recovered loot's immediate-sale value in Mamet and
Amarr.

<img src="./assets/example.gif"
  alt="A complete exploration session, from expedition preparation to selling the loot"
  width="800">

[![Read the transcript](https://img.shields.io/badge/example-read_the_transcript-7c3aed?style=flat-square)](./exploration-expedition.md)

## Voice chat while playing

Voice chat lets the conversation continue without repeatedly leaving EVE or
typing out the current situation. The first screenshot shows the transcript of
a spoken mining conversation. The second shows ChatGPT voice chat kept open
over the game.

> **ChatGPT Voice limitation:** In this project's experience, ChatGPT's native
> Voice conversation is more lightweight than written chat. It works well for
> quick questions and immediate guidance, but long planning, detailed
> comparisons, and multi-step tool work may be shorter or less thorough. For
> those tasks, switch to written chat or ask Voice to start a separate task.
> This is a limitation of the ChatGPT voice experience rather than EVE Copilot.
> See the official [ChatGPT Voice documentation](https://learn.chatgpt.com/docs/features/voice).

![A voice conversation comparing mining ships, correcting a crystal recommendation, and checking the character's skills](./assets/Eve-Mcp9.png)

*The voice transcript remains conversational, including corrections and
follow-up questions.*

![ChatGPT voice chat open while EVE Online is running](./assets/voice.png)

*Voice chat can remain open alongside EVE while the copilot uses the connected
character context and tools.*

## Current ship and fitting

EVE Copilot can inspect the selected character's current ship and fitting,
identify problems, and validate proposed changes against the character's actual
skills and fitting limits.

![Inspecting the current Anathema and its fitting](./assets/Eve-Mcp1.png)

![Validating fitting changes against the character's current skills, CPU, powergrid, calibration, and capacitor](./assets/Eve-Mcp3.png)

## Market and route planning

The copilot can compare current market orders for a complete fit and combine
route information with practical travel guidance.

![Calculating the price of an exploration fit from Amarr market orders](./assets/Eve-Mcp4.png)

![Finding a nearby low-security system and preparing the entry procedure](./assets/Eve-Mcp5.png)

## Mining preparation

Mining preparation combines the character's current location, nearby resource
possibilities, owned ships, fitting, skills, and travel risk.

![Planning a Kernite trip using the character's current location, Retriever fitting, and available alternatives](./assets/Eve-Mcp7.png)

[![Back to the main README](https://img.shields.io/badge/project-back_to_README-374151?style=flat-square)](../../README.md)
