# ESI coverage ledger

This ledger is generated from the pinned official ESI OpenAPI snapshot. Do not
edit rows manually; run `node scripts/generate-esi-coverage.mjs` after an
explicit compatibility-date review.

- Source: `https://esi.evetech.net/meta/openapi.json`
- Compatibility date: `2026-08-18`
- Bytes: `614466`
- SHA-256: `1d7bf362256bff980f72e4dd0aa7917da9431383b0b29f6fbc44f30b1d1d0b02`
- Operations: `233`
- Accounted coverage: `100%` (`233/233`)
- Allowed execution coverage: `100%` (`233/233`)
- Semantic coverage: `28.76%` (`67/233`)
- Planned operations: `0`

## Coverage by operation class

| Class | Total | Semantic | Bounded | Excluded | Planned | Accounted | Allowed execution |
|---|---:|---:|---:|---:|---:|---:|---:|
| `action` | 26 | 0 | 26 | 0 | 0 | 100% | 100% |
| `read` | 207 | 67 | 140 | 0 | 0 | 100% | 100% |

## Coverage by pack

| Pack | Total | Semantic | Bounded | Excluded | Planned | Accounted | Allowed execution |
|---|---:|---:|---:|---:|---:|---:|---:|
| `character_communication` | 53 | 21 | 32 | 0 | 0 | 100% | 100% |
| `eve_client_ui` | 5 | 0 | 5 | 0 | 0 | 100% | 100% |
| `inventory_economy` | 50 | 25 | 25 | 0 | 0 | 100% | 100% |
| `organizations_operations` | 61 | 6 | 55 | 0 | 0 | 100% | 100% |
| `universe_static` | 41 | 7 | 34 | 0 | 0 | 100% | 100% |
| `warfare_intelligence` | 23 | 8 | 15 | 0 | 0 | 100% | 100% |

## Operation ledger

| Operation ID | Method/path | Disposition | Capability IDs | Review reason |
|---|---|---|---|---|
| `DeleteCharactersCharacterIdContacts` | `DELETE /characters/{character_id}/contacts` | `implemented_bounded_low_level` | `esi.delete_characters_character_id_contacts` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `DeleteCharactersCharacterIdFittingsFittingId` | `DELETE /characters/{character_id}/fittings/{fitting_id}` | `implemented_bounded_low_level` | `esi.delete_characters_character_id_fittings_fitting_id` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `DeleteCharactersCharacterIdMailLabelsLabelId` | `DELETE /characters/{character_id}/mail/labels/{label_id}` | `implemented_bounded_low_level` | `esi.delete_characters_character_id_mail_labels_label_id` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `DeleteCharactersCharacterIdMailMailId` | `DELETE /characters/{character_id}/mail/{mail_id}` | `implemented_bounded_low_level` | `esi.delete_characters_character_id_mail_mail_id` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `DeleteFleetsFleetIdMembersMemberId` | `DELETE /fleets/{fleet_id}/members/{member_id}` | `implemented_bounded_low_level` | `esi.delete_fleets_fleet_id_members_member_id` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `DeleteFleetsFleetIdSquadsSquadId` | `DELETE /fleets/{fleet_id}/squads/{squad_id}` | `implemented_bounded_low_level` | `esi.delete_fleets_fleet_id_squads_squad_id` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `DeleteFleetsFleetIdWingsWingId` | `DELETE /fleets/{fleet_id}/wings/{wing_id}` | `implemented_bounded_low_level` | `esi.delete_fleets_fleet_id_wings_wing_id` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `GetAlliances` | `GET /alliances` | `implemented_bounded_low_level` | `esi.get_alliances` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetAlliancesAllianceId` | `GET /alliances/{alliance_id}` | `implemented_bounded_low_level` | `esi.get_alliances_alliance_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetAlliancesAllianceIdContacts` | `GET /alliances/{alliance_id}/contacts` | `implemented_bounded_low_level` | `esi.get_alliances_alliance_id_contacts` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetAlliancesAllianceIdContactsLabels` | `GET /alliances/{alliance_id}/contacts/labels` | `implemented_bounded_low_level` | `esi.get_alliances_alliance_id_contacts_labels` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetAlliancesAllianceIdCorporations` | `GET /alliances/{alliance_id}/corporations` | `implemented_bounded_low_level` | `esi.get_alliances_alliance_id_corporations` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetAlliancesAllianceIdIcons` | `GET /alliances/{alliance_id}/icons` | `implemented_bounded_low_level` | `esi.get_alliances_alliance_id_icons` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersAccessListsDetail` | `GET /characters/{character_id}/access-lists/{access_list_id}` | `implemented_bounded_low_level` | `esi.get_characters_access_lists_detail` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersAccessListsListing` | `GET /characters/{character_id}/access-lists` | `implemented_bounded_low_level` | `esi.get_characters_access_lists_listing` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCharacterIdAgentsResearch` | `GET /characters/{character_id}/agents_research` | `implemented_semantic` | `get_character_activity` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdAssets` | `GET /characters/{character_id}/assets` | `implemented_semantic` | `analyze_fitting_access`, `estimate_character_wealth`, `fittings.analyze_changes`, `list_owned_ships`, `search_assets` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdAttributes` | `GET /characters/{character_id}/attributes` | `implemented_semantic` | `get_character_profile` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdBlueprints` | `GET /characters/{character_id}/blueprints` | `implemented_semantic` | `get_blueprints` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdCalendar` | `GET /characters/{character_id}/calendar` | `implemented_semantic` | `get_calendar` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdCalendarEventId` | `GET /characters/{character_id}/calendar/{event_id}` | `implemented_bounded_low_level` | `esi.get_characters_character_id_calendar_event_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCharacterIdCalendarEventIdAttendees` | `GET /characters/{character_id}/calendar/{event_id}/attendees` | `implemented_bounded_low_level` | `esi.get_characters_character_id_calendar_event_id_attendees` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCharacterIdClones` | `GET /characters/{character_id}/clones` | `implemented_semantic` | `get_clones_and_implants` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdContacts` | `GET /characters/{character_id}/contacts` | `implemented_semantic` | `list_contacts` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdContactsLabels` | `GET /characters/{character_id}/contacts/labels` | `implemented_semantic` | `list_contacts` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdContracts` | `GET /characters/{character_id}/contracts` | `implemented_semantic` | `list_contracts` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdContractsContractIdBids` | `GET /characters/{character_id}/contracts/{contract_id}/bids` | `implemented_bounded_low_level` | `esi.get_characters_character_id_contracts_contract_id_bids` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCharacterIdContractsContractIdItems` | `GET /characters/{character_id}/contracts/{contract_id}/items` | `implemented_bounded_low_level` | `esi.get_characters_character_id_contracts_contract_id_items` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCharacterIdCorporationhistory` | `GET /characters/{character_id}/corporationhistory` | `implemented_semantic` | `get_character_profile` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdFatigue` | `GET /characters/{character_id}/fatigue` | `implemented_semantic` | `get_character_activity` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdFittings` | `GET /characters/{character_id}/fittings` | `implemented_semantic` | `analyze_fitting_access`, `fittings.analyze_changes`, `list_fittings` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdFleet` | `GET /characters/{character_id}/fleet` | `implemented_semantic` | `get_fleet_overview` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdFwStats` | `GET /characters/{character_id}/fw/stats` | `implemented_bounded_low_level` | `esi.get_characters_character_id_fw_stats` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCharacterIdImplants` | `GET /characters/{character_id}/implants` | `implemented_semantic` | `get_clones_and_implants` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdIndustryJobs` | `GET /characters/{character_id}/industry/jobs` | `implemented_semantic` | `list_industry_jobs` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdKillmailsRecent` | `GET /characters/{character_id}/killmails/recent` | `implemented_semantic` | `get_recent_killmails` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdLocation` | `GET /characters/{character_id}/location` | `implemented_semantic` | `character.overview`, `character.current_location` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdLoyaltyPoints` | `GET /characters/{character_id}/loyalty/points` | `implemented_semantic` | `get_loyalty_points` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdMail` | `GET /characters/{character_id}/mail` | `implemented_semantic` | `list_eve_mail` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdMailLabels` | `GET /characters/{character_id}/mail/labels` | `implemented_semantic` | `list_eve_mail` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdMailLists` | `GET /characters/{character_id}/mail/lists` | `implemented_semantic` | `list_eve_mail` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdMailMailId` | `GET /characters/{character_id}/mail/{mail_id}` | `implemented_bounded_low_level` | `esi.get_characters_character_id_mail_mail_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCharacterIdMedals` | `GET /characters/{character_id}/medals` | `implemented_bounded_low_level` | `esi.get_characters_character_id_medals` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCharacterIdMining` | `GET /characters/{character_id}/mining` | `implemented_semantic` | `get_mining_activity` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdNotifications` | `GET /characters/{character_id}/notifications` | `implemented_semantic` | `get_notifications` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdNotificationsContacts` | `GET /characters/{character_id}/notifications/contacts` | `implemented_semantic` | `get_notifications` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdOnline` | `GET /characters/{character_id}/online` | `implemented_semantic` | `get_character_activity` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdOrders` | `GET /characters/{character_id}/orders` | `implemented_semantic` | `list_my_market_orders` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdOrdersHistory` | `GET /characters/{character_id}/orders/history` | `implemented_semantic` | `list_my_market_orders` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdPlanets` | `GET /characters/{character_id}/planets` | `implemented_semantic` | `get_planetary_colonies` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdPlanetsPlanetId` | `GET /characters/{character_id}/planets/{planet_id}` | `implemented_bounded_low_level` | `esi.get_characters_character_id_planets_planet_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCharacterIdPortrait` | `GET /characters/{character_id}/portrait` | `implemented_bounded_low_level` | `esi.get_characters_character_id_portrait` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCharacterIdRoles` | `GET /characters/{character_id}/roles` | `implemented_bounded_low_level` | `esi.get_characters_character_id_roles` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCharacterIdSearch` | `GET /characters/{character_id}/search` | `implemented_bounded_low_level` | `esi.get_characters_character_id_search` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCharacterIdShip` | `GET /characters/{character_id}/ship` | `implemented_semantic` | `character.current_ship`, `character.overview`, `fittings.analyze_changes` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdSkillqueue` | `GET /characters/{character_id}/skillqueue` | `implemented_semantic` | `get_skill_queue` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdSkills` | `GET /characters/{character_id}/skills` | `implemented_semantic` | `analyze_fitting_access`, `check_requirements`, `fittings.analyze_changes`, `get_skills` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdStandings` | `GET /characters/{character_id}/standings` | `implemented_bounded_low_level` | `esi.get_characters_character_id_standings` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCharacterIdTitles` | `GET /characters/{character_id}/titles` | `implemented_bounded_low_level` | `esi.get_characters_character_id_titles` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCharacterIdWallet` | `GET /characters/{character_id}/wallet` | `implemented_semantic` | `estimate_character_wealth`, `get_wallet_summary` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdWalletJournal` | `GET /characters/{character_id}/wallet/journal` | `implemented_semantic` | `get_wallet_activity` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCharacterIdWalletTransactions` | `GET /characters/{character_id}/wallet/transactions` | `implemented_semantic` | `get_wallet_activity` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersCosmeticsSkinr` | `GET /characters/{character_id}/cosmetics/skinr` | `implemented_bounded_low_level` | `esi.get_characters_cosmetics_skinr` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersCosmeticsSkinrComponents` | `GET /characters/{character_id}/cosmetics/skinr/components` | `implemented_bounded_low_level` | `esi.get_characters_cosmetics_skinr_components` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersDetail` | `GET /characters/{character_id}` | `implemented_semantic` | `character.overview`, `get_character_profile` | Reviewed generated descriptor and ESI policy. |
| `GetCharactersFreelanceJobsListing` | `GET /characters/{character_id}/freelance-jobs` | `implemented_bounded_low_level` | `esi.get_characters_freelance_jobs_listing` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersFreelanceJobsParticipation` | `GET /characters/{character_id}/freelance-jobs/{job_id}/participation` | `implemented_bounded_low_level` | `esi.get_characters_freelance_jobs_participation` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersMercenaryTacticalOperationsDetail` | `GET /characters/{character_id}/mercenary-tactical-operations/{operation_id}` | `implemented_bounded_low_level` | `esi.get_characters_mercenary_tactical_operations_detail` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersMercenaryTacticalOperationsListing` | `GET /characters/{character_id}/mercenary-tactical-operations` | `implemented_bounded_low_level` | `esi.get_characters_mercenary_tactical_operations_listing` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersMilitaryCampaignsObjectivesListing` | `GET /characters/{character_id}/military-campaigns/objectives` | `implemented_bounded_low_level` | `esi.get_characters_military_campaigns_objectives_listing` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersMilitaryCampaignsObjectivesParticipation` | `GET /characters/{character_id}/military-campaigns/objectives/{objective_id}` | `implemented_bounded_low_level` | `esi.get_characters_military_campaigns_objectives_participation` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersParagonHubSkinr` | `GET /characters/{character_id}/paragon-hub/skinr` | `implemented_bounded_low_level` | `esi.get_characters_paragon_hub_skinr` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersStructuresMercenaryDensDetail` | `GET /characters/{character_id}/structures/mercenary-dens/{mercenary_den_id}` | `implemented_bounded_low_level` | `esi.get_characters_structures_mercenary_dens_detail` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCharactersStructuresMercenaryDensListing` | `GET /characters/{character_id}/structures/mercenary-dens` | `implemented_bounded_low_level` | `esi.get_characters_structures_mercenary_dens_listing` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetContractsPublicBidsContractId` | `GET /contracts/public/bids/{contract_id}` | `implemented_bounded_low_level` | `esi.get_contracts_public_bids_contract_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetContractsPublicItemsContractId` | `GET /contracts/public/items/{contract_id}` | `implemented_bounded_low_level` | `esi.get_contracts_public_items_contract_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetContractsPublicRegionId` | `GET /contracts/public/{region_id}` | `implemented_bounded_low_level` | `esi.get_contracts_public_region_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationCorporationIdMiningExtractions` | `GET /corporation/{corporation_id}/mining/extractions` | `implemented_bounded_low_level` | `esi.get_corporation_corporation_id_mining_extractions` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationCorporationIdMiningObservers` | `GET /corporation/{corporation_id}/mining/observers` | `implemented_bounded_low_level` | `esi.get_corporation_corporation_id_mining_observers` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationCorporationIdMiningObserversObserverId` | `GET /corporation/{corporation_id}/mining/observers/{observer_id}` | `implemented_bounded_low_level` | `esi.get_corporation_corporation_id_mining_observers_observer_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationId` | `GET /corporations/{corporation_id}` | `implemented_semantic` | `get_corporation_overview` | Reviewed generated descriptor and ESI policy. |
| `GetCorporationsCorporationIdAlliancehistory` | `GET /corporations/{corporation_id}/alliancehistory` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_alliancehistory` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdAssets` | `GET /corporations/{corporation_id}/assets` | `implemented_semantic` | `get_corporation_assets` | Reviewed generated descriptor and ESI policy. |
| `GetCorporationsCorporationIdBlueprints` | `GET /corporations/{corporation_id}/blueprints` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_blueprints` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdContacts` | `GET /corporations/{corporation_id}/contacts` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_contacts` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdContactsLabels` | `GET /corporations/{corporation_id}/contacts/labels` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_contacts_labels` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdContainersLogs` | `GET /corporations/{corporation_id}/containers/logs` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_containers_logs` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdContracts` | `GET /corporations/{corporation_id}/contracts` | `implemented_semantic` | `get_corporation_contracts` | Reviewed generated descriptor and ESI policy. |
| `GetCorporationsCorporationIdContractsContractIdBids` | `GET /corporations/{corporation_id}/contracts/{contract_id}/bids` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_contracts_contract_id_bids` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdContractsContractIdItems` | `GET /corporations/{corporation_id}/contracts/{contract_id}/items` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_contracts_contract_id_items` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdCustomsOffices` | `GET /corporations/{corporation_id}/customs_offices` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_customs_offices` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdDivisions` | `GET /corporations/{corporation_id}/divisions` | `implemented_semantic` | `get_corporation_overview` | Reviewed generated descriptor and ESI policy. |
| `GetCorporationsCorporationIdFacilities` | `GET /corporations/{corporation_id}/facilities` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_facilities` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdFwStats` | `GET /corporations/{corporation_id}/fw/stats` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_fw_stats` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdIcons` | `GET /corporations/{corporation_id}/icons` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_icons` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdIndustryJobs` | `GET /corporations/{corporation_id}/industry/jobs` | `implemented_semantic` | `get_corporation_industry` | Reviewed generated descriptor and ESI policy. |
| `GetCorporationsCorporationIdKillmailsRecent` | `GET /corporations/{corporation_id}/killmails/recent` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_killmails_recent` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdMedals` | `GET /corporations/{corporation_id}/medals` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_medals` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdMedalsIssued` | `GET /corporations/{corporation_id}/medals/issued` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_medals_issued` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdMembers` | `GET /corporations/{corporation_id}/members` | `implemented_semantic` | `get_corporation_membership` | Reviewed generated descriptor and ESI policy. |
| `GetCorporationsCorporationIdMembersLimit` | `GET /corporations/{corporation_id}/members/limit` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_members_limit` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdMembersTitles` | `GET /corporations/{corporation_id}/members/titles` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_members_titles` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdMembertracking` | `GET /corporations/{corporation_id}/membertracking` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_membertracking` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdOrders` | `GET /corporations/{corporation_id}/orders` | `implemented_semantic` | `get_corporation_market_orders` | Reviewed generated descriptor and ESI policy. |
| `GetCorporationsCorporationIdOrdersHistory` | `GET /corporations/{corporation_id}/orders/history` | `implemented_semantic` | `get_corporation_market_orders` | Reviewed generated descriptor and ESI policy. |
| `GetCorporationsCorporationIdRoles` | `GET /corporations/{corporation_id}/roles` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_roles` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdRolesHistory` | `GET /corporations/{corporation_id}/roles/history` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_roles_history` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdShareholders` | `GET /corporations/{corporation_id}/shareholders` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_shareholders` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdStandings` | `GET /corporations/{corporation_id}/standings` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_standings` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdStarbases` | `GET /corporations/{corporation_id}/starbases` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_starbases` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdStarbasesStarbaseId` | `GET /corporations/{corporation_id}/starbases/{starbase_id}` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_starbases_starbase_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdStructures` | `GET /corporations/{corporation_id}/structures` | `implemented_semantic` | `get_corporation_structures` | Reviewed generated descriptor and ESI policy. |
| `GetCorporationsCorporationIdTitles` | `GET /corporations/{corporation_id}/titles` | `implemented_bounded_low_level` | `esi.get_corporations_corporation_id_titles` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsCorporationIdWallets` | `GET /corporations/{corporation_id}/wallets` | `implemented_semantic` | `get_corporation_wallet_activity` | Reviewed generated descriptor and ESI policy. |
| `GetCorporationsCorporationIdWalletsDivisionJournal` | `GET /corporations/{corporation_id}/wallets/{division}/journal` | `implemented_semantic` | `get_corporation_wallet_activity` | Reviewed generated descriptor and ESI policy. |
| `GetCorporationsCorporationIdWalletsDivisionTransactions` | `GET /corporations/{corporation_id}/wallets/{division}/transactions` | `implemented_semantic` | `get_corporation_wallet_activity` | Reviewed generated descriptor and ESI policy. |
| `GetCorporationsFreelanceJobsListing` | `GET /corporations/{corporation_id}/freelance-jobs` | `implemented_bounded_low_level` | `esi.get_corporations_freelance_jobs_listing` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsFreelanceJobsParticipants` | `GET /corporations/{corporation_id}/freelance-jobs/{job_id}/participants` | `implemented_bounded_low_level` | `esi.get_corporations_freelance_jobs_participants` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsNpccorps` | `GET /corporations/npccorps` | `implemented_bounded_low_level` | `esi.get_corporations_npccorps` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsProjectsContribution` | `GET /corporations/{corporation_id}/projects/{project_id}/contribution/{character_id}` | `implemented_bounded_low_level` | `esi.get_corporations_projects_contribution` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsProjectsContributors` | `GET /corporations/{corporation_id}/projects/{project_id}/contributors` | `implemented_bounded_low_level` | `esi.get_corporations_projects_contributors` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsProjectsDetail` | `GET /corporations/{corporation_id}/projects/{project_id}` | `implemented_bounded_low_level` | `esi.get_corporations_projects_detail` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsProjectsListing` | `GET /corporations/{corporation_id}/projects` | `implemented_semantic` | `get_corporation_projects` | Reviewed generated descriptor and ESI policy. |
| `GetCorporationsStructuresSkyhooksDetail` | `GET /corporations/{corporation_id}/structures/skyhooks/{skyhook_id}` | `implemented_bounded_low_level` | `esi.get_corporations_structures_skyhooks_detail` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsStructuresSkyhooksListing` | `GET /corporations/{corporation_id}/structures/skyhooks` | `implemented_bounded_low_level` | `esi.get_corporations_structures_skyhooks_listing` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsStructuresSovereigntyHubsDetail` | `GET /corporations/{corporation_id}/structures/sovereignty-hubs/{sovereignty_hub_id}` | `implemented_bounded_low_level` | `esi.get_corporations_structures_sovereignty_hubs_detail` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCorporationsStructuresSovereigntyHubsListing` | `GET /corporations/{corporation_id}/structures/sovereignty-hubs` | `implemented_bounded_low_level` | `esi.get_corporations_structures_sovereignty_hubs_listing` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetCosmeticsSkinr` | `GET /cosmetics/skinr/{skinr_id}` | `implemented_bounded_low_level` | `esi.get_cosmetics_skinr` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetDogmaAttributes` | `GET /dogma/attributes` | `implemented_bounded_low_level` | `esi.get_dogma_attributes` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetDogmaAttributesAttributeId` | `GET /dogma/attributes/{attribute_id}` | `implemented_bounded_low_level` | `esi.get_dogma_attributes_attribute_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetDogmaDynamicItemsTypeIdItemId` | `GET /dogma/dynamic/items/{type_id}/{item_id}` | `implemented_bounded_low_level` | `esi.get_dogma_dynamic_items_type_id_item_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetDogmaEffects` | `GET /dogma/effects` | `implemented_bounded_low_level` | `esi.get_dogma_effects` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetDogmaEffectsEffectId` | `GET /dogma/effects/{effect_id}` | `implemented_bounded_low_level` | `esi.get_dogma_effects_effect_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetFleetsFleetId` | `GET /fleets/{fleet_id}` | `implemented_bounded_low_level` | `esi.get_fleets_fleet_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetFleetsFleetIdMembers` | `GET /fleets/{fleet_id}/members` | `implemented_bounded_low_level` | `esi.get_fleets_fleet_id_members` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetFleetsFleetIdWings` | `GET /fleets/{fleet_id}/wings` | `implemented_bounded_low_level` | `esi.get_fleets_fleet_id_wings` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetFreelanceJobsDetail` | `GET /freelance-jobs/{job_id}` | `implemented_bounded_low_level` | `esi.get_freelance_jobs_detail` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetFreelanceJobsListing` | `GET /freelance-jobs` | `implemented_bounded_low_level` | `esi.get_freelance_jobs_listing` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetFwLeaderboards` | `GET /fw/leaderboards` | `implemented_bounded_low_level` | `esi.get_fw_leaderboards` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetFwLeaderboardsCharacters` | `GET /fw/leaderboards/characters` | `implemented_bounded_low_level` | `esi.get_fw_leaderboards_characters` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetFwLeaderboardsCorporations` | `GET /fw/leaderboards/corporations` | `implemented_bounded_low_level` | `esi.get_fw_leaderboards_corporations` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetFwStats` | `GET /fw/stats` | `implemented_semantic` | `get_warfare_overview` | Reviewed generated descriptor and ESI policy. |
| `GetFwSystems` | `GET /fw/systems` | `implemented_semantic` | `get_warfare_overview` | Reviewed generated descriptor and ESI policy. |
| `GetFwWars` | `GET /fw/wars` | `implemented_semantic` | `get_warfare_overview` | Reviewed generated descriptor and ESI policy. |
| `GetIncursions` | `GET /incursions` | `implemented_semantic` | `get_public_activity_intelligence`, `get_warfare_overview` | Reviewed generated descriptor and ESI policy. |
| `GetIndustryFacilities` | `GET /industry/facilities` | `implemented_bounded_low_level` | `esi.get_industry_facilities` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetIndustrySystems` | `GET /industry/systems` | `implemented_bounded_low_level` | `esi.get_industry_systems` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetInsurancePrices` | `GET /insurance/prices` | `implemented_bounded_low_level` | `esi.get_insurance_prices` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetKillmailsKillmailIdKillmailHash` | `GET /killmails/{killmail_id}/{killmail_hash}` | `implemented_bounded_low_level` | `esi.get_killmails_killmail_id_killmail_hash` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetLoyaltyStoresCorporationIdOffers` | `GET /loyalty/stores/{corporation_id}/offers` | `implemented_bounded_low_level` | `esi.get_loyalty_stores_corporation_id_offers` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetMarketsGroups` | `GET /markets/groups` | `implemented_bounded_low_level` | `esi.get_markets_groups` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetMarketsGroupsMarketGroupId` | `GET /markets/groups/{market_group_id}` | `implemented_bounded_low_level` | `esi.get_markets_groups_market_group_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetMarketsPrices` | `GET /markets/prices` | `implemented_semantic` | `estimate_character_wealth`, `get_market_price` | Reviewed generated descriptor and ESI policy. |
| `GetMarketsRegionIdHistory` | `GET /markets/{region_id}/history` | `implemented_semantic` | `get_market_history` | Reviewed generated descriptor and ESI policy. |
| `GetMarketsRegionIdOrders` | `GET /markets/{region_id}/orders` | `implemented_semantic` | `compare_market_orders` | Reviewed generated descriptor and ESI policy. |
| `GetMarketsRegionIdTypes` | `GET /markets/{region_id}/types` | `implemented_bounded_low_level` | `esi.get_markets_region_id_types` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetMarketsStructuresStructureId` | `GET /markets/structures/{structure_id}` | `implemented_bounded_low_level` | `esi.get_markets_structures_structure_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetMetaChangelog` | `GET /meta/changelog` | `implemented_bounded_low_level` | `esi.get_meta_changelog` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetMetaCompatibilityDates` | `GET /meta/compatibility-dates` | `implemented_bounded_low_level` | `esi.get_meta_compatibility_dates` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetMetaName` | `GET /meta/name` | `implemented_bounded_low_level` | `esi.get_meta_name` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetMetaStatus` | `GET /meta/status` | `implemented_bounded_low_level` | `esi.get_meta_status` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetMilitaryCampaignsDetail` | `GET /military-campaigns/{campaign_id}` | `implemented_bounded_low_level` | `esi.get_military_campaigns_detail` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetMilitaryCampaignsListing` | `GET /military-campaigns` | `implemented_bounded_low_level` | `esi.get_military_campaigns_listing` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetMilitaryCampaignsObjectivesDetail` | `GET /military-campaigns/{campaign_id}/objectives/{objective_id}` | `implemented_bounded_low_level` | `esi.get_military_campaigns_objectives_detail` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetMilitaryCampaignsObjectivesListing` | `GET /military-campaigns/{campaign_id}/objectives` | `implemented_bounded_low_level` | `esi.get_military_campaigns_objectives_listing` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetParagonHubSkinr` | `GET /paragon-hub/skinr` | `implemented_bounded_low_level` | `esi.get_paragon_hub_skinr` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetParagonHubSkinrAlliances` | `GET /paragon-hub/skinr/alliances/{alliance_id}` | `implemented_bounded_low_level` | `esi.get_paragon_hub_skinr_alliances` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetParagonHubSkinrCharacters` | `GET /paragon-hub/skinr/characters/{character_id}` | `implemented_bounded_low_level` | `esi.get_paragon_hub_skinr_characters` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetParagonHubSkinrCorporations` | `GET /paragon-hub/skinr/corporations/{corporation_id}` | `implemented_bounded_low_level` | `esi.get_paragon_hub_skinr_corporations` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetSkyhooksRaidable` | `GET /skyhooks/raidable` | `implemented_bounded_low_level` | `esi.get_skyhooks_raidable` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetSovereigntyCampaigns` | `GET /sovereignty/campaigns` | `implemented_semantic` | `get_sovereignty_overview` | Reviewed generated descriptor and ESI policy. |
| `GetSovereigntySystems` | `GET /sovereignty/systems` | `implemented_semantic` | `get_sovereignty_overview` | Reviewed generated descriptor and ESI policy. |
| `GetStatus` | `GET /status` | `implemented_semantic` | `get_server_activity` | Reviewed generated descriptor and ESI policy. |
| `GetUniverseAncestries` | `GET /universe/ancestries` | `implemented_bounded_low_level` | `esi.get_universe_ancestries` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseAsteroidBeltsAsteroidBeltId` | `GET /universe/asteroid_belts/{asteroid_belt_id}` | `implemented_bounded_low_level` | `esi.get_universe_asteroid_belts_asteroid_belt_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseBloodlines` | `GET /universe/bloodlines` | `implemented_bounded_low_level` | `esi.get_universe_bloodlines` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseCategories` | `GET /universe/categories` | `implemented_bounded_low_level` | `esi.get_universe_categories` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseCategoriesCategoryId` | `GET /universe/categories/{category_id}` | `implemented_bounded_low_level` | `esi.get_universe_categories_category_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseConstellations` | `GET /universe/constellations` | `implemented_bounded_low_level` | `esi.get_universe_constellations` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseConstellationsConstellationId` | `GET /universe/constellations/{constellation_id}` | `implemented_bounded_low_level` | `esi.get_universe_constellations_constellation_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseFactions` | `GET /universe/factions` | `implemented_bounded_low_level` | `esi.get_universe_factions` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseGraphics` | `GET /universe/graphics` | `implemented_bounded_low_level` | `esi.get_universe_graphics` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseGraphicsGraphicId` | `GET /universe/graphics/{graphic_id}` | `implemented_bounded_low_level` | `esi.get_universe_graphics_graphic_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseGroups` | `GET /universe/groups` | `implemented_bounded_low_level` | `esi.get_universe_groups` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseGroupsGroupId` | `GET /universe/groups/{group_id}` | `implemented_bounded_low_level` | `esi.get_universe_groups_group_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseMoonsMoonId` | `GET /universe/moons/{moon_id}` | `implemented_bounded_low_level` | `esi.get_universe_moons_moon_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniversePlanetsPlanetId` | `GET /universe/planets/{planet_id}` | `implemented_bounded_low_level` | `esi.get_universe_planets_planet_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseRaces` | `GET /universe/races` | `implemented_bounded_low_level` | `esi.get_universe_races` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseRegions` | `GET /universe/regions` | `implemented_bounded_low_level` | `esi.get_universe_regions` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseRegionsRegionId` | `GET /universe/regions/{region_id}` | `implemented_bounded_low_level` | `esi.get_universe_regions_region_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseSchematicsSchematicId` | `GET /universe/schematics/{schematic_id}` | `implemented_bounded_low_level` | `esi.get_universe_schematics_schematic_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseStargatesStargateId` | `GET /universe/stargates/{stargate_id}` | `implemented_bounded_low_level` | `esi.get_universe_stargates_stargate_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseStarsStarId` | `GET /universe/stars/{star_id}` | `implemented_bounded_low_level` | `esi.get_universe_stars_star_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseStationsStationId` | `GET /universe/stations/{station_id}` | `implemented_bounded_low_level` | `esi.get_universe_stations_station_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseStructures` | `GET /universe/structures` | `implemented_bounded_low_level` | `esi.get_universe_structures` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseStructuresStructureId` | `GET /universe/structures/{structure_id}` | `implemented_bounded_low_level` | `esi.get_universe_structures_structure_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseSystemJumps` | `GET /universe/system_jumps` | `implemented_semantic` | `get_public_activity_intelligence`, `get_server_activity` | Reviewed generated descriptor and ESI policy. |
| `GetUniverseSystemKills` | `GET /universe/system_kills` | `implemented_semantic` | `get_public_activity_intelligence`, `get_server_activity` | Reviewed generated descriptor and ESI policy. |
| `GetUniverseSystems` | `GET /universe/systems` | `implemented_bounded_low_level` | `esi.get_universe_systems` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseSystemsSystemId` | `GET /universe/systems/{system_id}` | `implemented_bounded_low_level` | `esi.get_universe_systems_system_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseTypes` | `GET /universe/types` | `implemented_bounded_low_level` | `esi.get_universe_types` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetUniverseTypesTypeId` | `GET /universe/types/{type_id}` | `implemented_semantic` | `check_requirements`, `get_market_price` | Reviewed generated descriptor and ESI policy. |
| `GetWars` | `GET /wars` | `implemented_semantic` | `get_public_activity_intelligence` | Reviewed generated descriptor and ESI policy. |
| `GetWarsWarId` | `GET /wars/{war_id}` | `implemented_bounded_low_level` | `esi.get_wars_war_id` | Available through the strict descriptor-driven execute_eve_read capability. |
| `GetWarsWarIdKillmails` | `GET /wars/{war_id}/killmails` | `implemented_bounded_low_level` | `esi.get_wars_war_id_killmails` | Available through the strict descriptor-driven execute_eve_read capability. |
| `PostCharactersAffiliation` | `POST /characters/affiliation` | `implemented_bounded_low_level` | `esi.post_characters_affiliation` | Available through the strict descriptor-driven execute_eve_read capability. |
| `PostCharactersCharacterIdAssetsLocations` | `POST /characters/{character_id}/assets/locations` | `implemented_semantic` | `list_owned_ships`, `search_assets` | Reviewed generated descriptor and ESI policy. |
| `PostCharactersCharacterIdAssetsNames` | `POST /characters/{character_id}/assets/names` | `implemented_semantic` | `list_owned_ships`, `search_assets` | Reviewed generated descriptor and ESI policy. |
| `PostCharactersCharacterIdContacts` | `POST /characters/{character_id}/contacts` | `implemented_bounded_low_level` | `esi.post_characters_character_id_contacts` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PostCharactersCharacterIdCspa` | `POST /characters/{character_id}/cspa` | `implemented_bounded_low_level` | `esi.post_characters_character_id_cspa` | Available through the strict descriptor-driven execute_eve_read capability. |
| `PostCharactersCharacterIdFittings` | `POST /characters/{character_id}/fittings` | `implemented_bounded_low_level` | `esi.post_characters_character_id_fittings` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PostCharactersCharacterIdMail` | `POST /characters/{character_id}/mail` | `implemented_bounded_low_level` | `esi.post_characters_character_id_mail` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PostCharactersCharacterIdMailLabels` | `POST /characters/{character_id}/mail/labels` | `implemented_bounded_low_level` | `esi.post_characters_character_id_mail_labels` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PostCorporationsCorporationIdAssetsLocations` | `POST /corporations/{corporation_id}/assets/locations` | `implemented_bounded_low_level` | `esi.post_corporations_corporation_id_assets_locations` | Available through the strict descriptor-driven execute_eve_read capability. |
| `PostCorporationsCorporationIdAssetsNames` | `POST /corporations/{corporation_id}/assets/names` | `implemented_bounded_low_level` | `esi.post_corporations_corporation_id_assets_names` | Available through the strict descriptor-driven execute_eve_read capability. |
| `PostFleetsFleetIdMembers` | `POST /fleets/{fleet_id}/members` | `implemented_bounded_low_level` | `esi.post_fleets_fleet_id_members` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PostFleetsFleetIdWings` | `POST /fleets/{fleet_id}/wings` | `implemented_bounded_low_level` | `esi.post_fleets_fleet_id_wings` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PostFleetsFleetIdWingsWingIdSquads` | `POST /fleets/{fleet_id}/wings/{wing_id}/squads` | `implemented_bounded_low_level` | `esi.post_fleets_fleet_id_wings_wing_id_squads` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PostRoute` | `POST /route/{origin_system_id}/{destination_system_id}` | `implemented_semantic` | `calculate_route` | Reviewed generated descriptor and ESI policy. |
| `PostUiAutopilotWaypoint` | `POST /ui/autopilot/waypoint` | `implemented_bounded_low_level` | `esi.post_ui_autopilot_waypoint` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PostUiOpenwindowContract` | `POST /ui/openwindow/contract` | `implemented_bounded_low_level` | `esi.post_ui_openwindow_contract` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PostUiOpenwindowInformation` | `POST /ui/openwindow/information` | `implemented_bounded_low_level` | `esi.post_ui_openwindow_information` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PostUiOpenwindowMarketdetails` | `POST /ui/openwindow/marketdetails` | `implemented_bounded_low_level` | `esi.post_ui_openwindow_marketdetails` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PostUiOpenwindowNewmail` | `POST /ui/openwindow/newmail` | `implemented_bounded_low_level` | `esi.post_ui_openwindow_newmail` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PostUniverseIds` | `POST /universe/ids` | `implemented_semantic` | `search_eve_universe` | Reviewed generated descriptor and ESI policy. |
| `PostUniverseNames` | `POST /universe/names` | `implemented_semantic` | `resolve_eve_entities` | Reviewed generated descriptor and ESI policy. |
| `PutCharactersCharacterIdCalendarEventId` | `PUT /characters/{character_id}/calendar/{event_id}` | `implemented_bounded_low_level` | `esi.put_characters_character_id_calendar_event_id` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PutCharactersCharacterIdContacts` | `PUT /characters/{character_id}/contacts` | `implemented_bounded_low_level` | `esi.put_characters_character_id_contacts` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PutCharactersCharacterIdMailMailId` | `PUT /characters/{character_id}/mail/{mail_id}` | `implemented_bounded_low_level` | `esi.put_characters_character_id_mail_mail_id` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PutFleetsFleetId` | `PUT /fleets/{fleet_id}` | `implemented_bounded_low_level` | `esi.put_fleets_fleet_id` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PutFleetsFleetIdMembersMemberId` | `PUT /fleets/{fleet_id}/members/{member_id}` | `implemented_bounded_low_level` | `esi.put_fleets_fleet_id_members_member_id` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PutFleetsFleetIdSquadsSquadId` | `PUT /fleets/{fleet_id}/squads/{squad_id}` | `implemented_bounded_low_level` | `esi.put_fleets_fleet_id_squads_squad_id` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
| `PutFleetsFleetIdWingsWingId` | `PUT /fleets/{fleet_id}/wings/{wing_id}` | `implemented_bounded_low_level` | `esi.put_fleets_fleet_id_wings_wing_id` | Available through the guarded prepare, confirm, single-use execute, and audit action pipeline. |
