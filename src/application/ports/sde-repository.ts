export interface SdeStatus {
  readonly state: 'unavailable' | 'available' | 'invalid';
  readonly buildNumber: number | null;
  readonly releaseDate: string | null;
}

export interface SdeFittingSnapshot {
  readonly buildNumber: number;
  readonly releaseDate: string;
  readonly databasePath: string;
  readonly importerVersion: 3;
  readonly fittingDataContractVersion: 1;
}

export interface ResolvedType {
  readonly id: number;
  readonly name: string;
  readonly groupId: number;
  readonly groupName: string;
  readonly categoryId: number;
  readonly categoryName: string;
  readonly marketGroupId: number | null;
  readonly marketGroupName: string | null;
  readonly published: boolean;
  readonly buildNumber: number;
}

export interface ResolvedSdeName {
  readonly id: number;
  readonly name: string;
  readonly buildNumber: number;
}

export interface SdeTypeRequirement {
  readonly skillTypeId: number;
  readonly skillName: string;
  readonly level: number;
}

export interface SdeRequirementEdge {
  readonly sourceTypeId: number;
  readonly sourceTypeName: string;
  readonly requirementIndex: number;
  readonly skillTypeId: number;
  readonly skillName: string;
  readonly requiredLevel: number;
  readonly depth: number;
  readonly direct: boolean;
}

export interface SdeEffectiveRequirement {
  readonly order: number;
  readonly skillTypeId: number;
  readonly skillName: string;
  readonly requiredLevel: number;
  readonly direct: boolean;
  readonly requiredByTypeIds: readonly number[];
}

export interface SdeTypeRequirementClosure {
  readonly target: ResolvedType;
  readonly directRequirements: readonly SdeRequirementEdge[];
  readonly dependencyEdges: readonly SdeRequirementEdge[];
  readonly requirements: readonly SdeEffectiveRequirement[];
  readonly complete: true;
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly maximumDepth: number;
  readonly buildNumber: number;
}

export interface ResolvedBlueprint {
  readonly blueprintTypeId: number;
  readonly blueprintName: string;
  readonly activities: ReadonlyArray<{
    readonly activity: string;
    readonly timeSeconds: number | null;
    readonly materials: ReadonlyArray<{ readonly typeId: number; readonly name: string; readonly quantity: number }>;
    readonly products: ReadonlyArray<{ readonly typeId: number; readonly name: string; readonly quantity: number }>;
  }>;
  readonly buildNumber: number;
}

export interface ResolvedStargate {
  readonly id: number;
  readonly solarSystemId: number;
  readonly destinationStargateId: number;
  readonly destinationSolarSystemId: number;
  readonly buildNumber: number;
}

export interface ResolvedSolarSystem {
  readonly id: number;
  readonly name: string;
  readonly constellationId: number;
  readonly constellationName: string;
  readonly regionId: number;
  readonly regionName: string;
  readonly buildNumber: number;
}

export interface ResolvedStation {
  readonly id: string;
  readonly name: string;
  readonly solarSystemId: number;
  readonly buildNumber: number;
}

export interface SdeRepository {
  status(): Promise<SdeStatus>;
  fittingSnapshot?(): Promise<SdeFittingSnapshot>;
  resolveType(typeId: number): Promise<ResolvedType | null>;
  resolveTypes(typeIds: readonly number[]): Promise<ReadonlyMap<number, ResolvedType>>;
  typeIdsByCategory(categoryId: number, limit: number): Promise<readonly number[]>;
  searchTypes(name: string, limit: number): Promise<readonly ResolvedType[]>;
  resolveGroup(groupId: number): Promise<ResolvedSdeName | null>;
  resolveCategory(categoryId: number): Promise<ResolvedSdeName | null>;
  resolveMarketGroup(marketGroupId: number): Promise<ResolvedSdeName | null>;
  resolveTypeRequirements(typeId: number): Promise<readonly SdeTypeRequirement[]>;
  resolveTypeRequirementClosure(typeId: number): Promise<SdeTypeRequirementClosure>;
  resolveBlueprint(blueprintTypeId: number): Promise<ResolvedBlueprint | null>;
  resolveSolarSystem(systemId: number): Promise<ResolvedSolarSystem | null>;
  resolveSolarSystems(systemIds: readonly number[]): Promise<ReadonlyMap<number, ResolvedSolarSystem>>;
  searchSolarSystems(name: string, limit: number): Promise<readonly ResolvedSolarSystem[]>;
  resolveStation(stationId: string): Promise<ResolvedStation | null>;
  resolveStargatesFromSystem(systemId: number): Promise<readonly ResolvedStargate[]>;
  resolveNpcCorporation(corporationId: number): Promise<ResolvedSdeName | null>;
  resolveFaction(factionId: number): Promise<ResolvedSdeName | null>;
}
