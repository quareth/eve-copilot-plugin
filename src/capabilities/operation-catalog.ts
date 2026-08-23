import { EsiOperationCatalog } from '../domain/esi-operation-catalog.js';
import { ESI_OPERATION_FACTS } from './generated/esi-operation-facts.js';

export function buildEsiOperationCatalog(): EsiOperationCatalog {
  return new EsiOperationCatalog(ESI_OPERATION_FACTS);
}
