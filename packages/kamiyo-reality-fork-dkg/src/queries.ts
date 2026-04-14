// SPARQL query templates for Reality Fork Knowledge Assets
//
// DKG stores JSON-LD with @context "https://schema.org/" but the RDF
// triples use the http://schema.org/ namespace. JSON-LD @id values
// become direct IRIs (not schema:@id properties).

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/** Escape a string for safe use inside SPARQL literals */
export function escapeSparql(str: string): string {
  if (typeof str !== 'string') return '';
  const clean = str.replace(/\0/g, '');
  return (
    clean
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[<>{}|^`]/g, '')
      .slice(0, 256)
  );
}

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

function applyPagination(params?: PaginationParams): string {
  const limit = Math.max(1, Math.min(MAX_LIMIT, params?.limit ?? DEFAULT_LIMIT));
  const offset = Math.max(0, Math.min(100000, params?.offset ?? 0));
  return offset > 0 ? `LIMIT ${limit} OFFSET ${offset}` : `LIMIT ${limit}`;
}

/**
 * Find all Reality Fork reports for a given project.
 */
export function queryReportsByProject(projectId: string): string {
  const safe = escapeSparql(projectId);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?report ?projectName ?description ?probability ?impactScore
           ?winnerHypothesisId ?hypothesisCount ?laneCount ?simulationRounds
           ?evidenceCount ?reportHash ?createdAt
    WHERE {
      ?report a schema:Report ;
              schema:name "RealityForkReport" ;
              schema:dateCreated ?createdAt ;
              schema:description ?description ;
              schema:additionalProperty ?projProp, ?projNameProp, ?probProp,
                                        ?impactProp, ?winnerProp, ?hCountProp,
                                        ?lCountProp, ?simRoundsProp, ?evCountProp,
                                        ?hashProp .
      ?projProp schema:name "projectId" ; schema:value "${safe}" .
      ?projNameProp schema:name "projectName" ; schema:value ?projectName .
      ?probProp schema:name "probability" ; schema:value ?probability .
      ?impactProp schema:name "impactScore" ; schema:value ?impactScore .
      ?winnerProp schema:name "winnerHypothesisId" ; schema:value ?winnerHypothesisId .
      ?hCountProp schema:name "hypothesisCount" ; schema:value ?hypothesisCount .
      ?lCountProp schema:name "laneCount" ; schema:value ?laneCount .
      ?simRoundsProp schema:name "simulationRounds" ; schema:value ?simulationRounds .
      ?evCountProp schema:name "evidenceCount" ; schema:value ?evidenceCount .
      ?hashProp schema:name "reportHash" ; schema:value ?reportHash .
    }
    ORDER BY DESC(?createdAt)
  `;
}

/**
 * Paginated listing of all Reality Fork reports.
 */
export function queryAllReports(pagination?: PaginationParams): string {
  const sql = applyPagination(pagination);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?report ?projectId ?projectName ?probability ?impactScore
           ?winnerHypothesisId ?createdAt
    WHERE {
      ?report a schema:Report ;
              schema:name "RealityForkReport" ;
              schema:dateCreated ?createdAt ;
              schema:additionalProperty ?projProp, ?projNameProp, ?probProp,
                                        ?impactProp, ?winnerProp .
      ?projProp schema:name "projectId" ; schema:value ?projectId .
      ?projNameProp schema:name "projectName" ; schema:value ?projectName .
      ?probProp schema:name "probability" ; schema:value ?probability .
      ?impactProp schema:name "impactScore" ; schema:value ?impactScore .
      ?winnerProp schema:name "winnerHypothesisId" ; schema:value ?winnerHypothesisId .
    }
    ORDER BY DESC(?createdAt)
    ${sql}
  `;
}

/**
 * Find all entities associated with a project.
 */
export function queryEntitiesByProject(projectId: string, pagination?: PaginationParams): string {
  const safe = escapeSparql(projectId);
  const sql = applyPagination(pagination);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?entity ?entityId ?entityName ?entityType ?hypothesisId ?laneId
           ?probability ?impactScore ?evidenceHash ?createdAt
    WHERE {
      ?entity a schema:Thing ;
              schema:name ?entityName ;
              schema:dateCreated ?createdAt ;
              schema:additionalType ?entityType ;
              schema:additionalProperty ?projProp, ?eidProp, ?hypProp, ?laneProp,
                                        ?probProp, ?impactProp, ?hashProp .
      ?projProp schema:name "projectId" ; schema:value "${safe}" .
      ?eidProp schema:name "entityId" ; schema:value ?entityId .
      ?hypProp schema:name "hypothesisId" ; schema:value ?hypothesisId .
      ?laneProp schema:name "laneId" ; schema:value ?laneId .
      ?probProp schema:name "probability" ; schema:value ?probability .
      ?impactProp schema:name "impactScore" ; schema:value ?impactScore .
      ?hashProp schema:name "evidenceHash" ; schema:value ?evidenceHash .
    }
    ORDER BY DESC(?createdAt)
    ${sql}
  `;
}

/**
 * Search simulations across all projects for a specific hypothesis.
 */
export function querySimulationsByHypothesis(
  hypothesisId: string,
  pagination?: PaginationParams
): string {
  const safe = escapeSparql(hypothesisId);
  const sql = applyPagination(pagination);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?simulation ?simulationId ?projectId ?laneId ?simulationRounds
           ?probability ?impactScore ?evidenceHash ?createdAt
    WHERE {
      ?simulation a schema:Dataset ;
                  schema:dateCreated ?createdAt ;
                  schema:additionalProperty ?hypProp, ?projProp, ?simIdProp,
                                            ?laneProp, ?roundsProp, ?probProp,
                                            ?impactProp, ?hashProp .
      ?hypProp schema:name "hypothesisId" ; schema:value "${safe}" .
      ?projProp schema:name "projectId" ; schema:value ?projectId .
      ?simIdProp schema:name "simulationId" ; schema:value ?simulationId .
      ?laneProp schema:name "laneId" ; schema:value ?laneId .
      ?roundsProp schema:name "simulationRounds" ; schema:value ?simulationRounds .
      ?probProp schema:name "probability" ; schema:value ?probability .
      ?impactProp schema:name "impactScore" ; schema:value ?impactScore .
      ?hashProp schema:name "evidenceHash" ; schema:value ?evidenceHash .
    }
    ORDER BY DESC(?createdAt)
    ${sql}
  `;
}

/**
 * Look up a single report by its DKG UAL (used as the @id after resolution).
 */
export function queryReportByUAL(ual: string): string {
  const safe = escapeSparql(ual);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?projectId ?projectName ?description ?probability ?impactScore
           ?winnerHypothesisId ?hypothesisCount ?laneCount ?simulationRounds
           ?evidenceCount ?reportHash ?createdAt
    WHERE {
      <${safe}> a schema:Report ;
                schema:name "RealityForkReport" ;
                schema:dateCreated ?createdAt ;
                schema:description ?description ;
                schema:additionalProperty ?projProp, ?projNameProp, ?probProp,
                                          ?impactProp, ?winnerProp, ?hCountProp,
                                          ?lCountProp, ?simRoundsProp, ?evCountProp,
                                          ?hashProp .
      ?projProp schema:name "projectId" ; schema:value ?projectId .
      ?projNameProp schema:name "projectName" ; schema:value ?projectName .
      ?probProp schema:name "probability" ; schema:value ?probability .
      ?impactProp schema:name "impactScore" ; schema:value ?impactScore .
      ?winnerProp schema:name "winnerHypothesisId" ; schema:value ?winnerHypothesisId .
      ?hCountProp schema:name "hypothesisCount" ; schema:value ?hypothesisCount .
      ?lCountProp schema:name "laneCount" ; schema:value ?laneCount .
      ?simRoundsProp schema:name "simulationRounds" ; schema:value ?simulationRounds .
      ?evCountProp schema:name "evidenceCount" ; schema:value ?evidenceCount .
      ?hashProp schema:name "reportHash" ; schema:value ?reportHash .
    }
    LIMIT 1
  `;
}

/**
 * Find simulations belonging to a specific project.
 */
export function querySimulationsByProject(
  projectId: string,
  pagination?: PaginationParams
): string {
  const safe = escapeSparql(projectId);
  const sql = applyPagination(pagination);
  return `
    PREFIX schema: <http://schema.org/>
    SELECT ?simulation ?simulationId ?hypothesisId ?laneId ?simulationRounds
           ?probability ?impactScore ?evidenceHash ?createdAt
    WHERE {
      ?simulation a schema:Dataset ;
                  schema:dateCreated ?createdAt ;
                  schema:additionalProperty ?projProp, ?simIdProp, ?hypProp,
                                            ?laneProp, ?roundsProp, ?probProp,
                                            ?impactProp, ?hashProp .
      ?projProp schema:name "projectId" ; schema:value "${safe}" .
      ?simIdProp schema:name "simulationId" ; schema:value ?simulationId .
      ?hypProp schema:name "hypothesisId" ; schema:value ?hypothesisId .
      ?laneProp schema:name "laneId" ; schema:value ?laneId .
      ?roundsProp schema:name "simulationRounds" ; schema:value ?simulationRounds .
      ?probProp schema:name "probability" ; schema:value ?probability .
      ?impactProp schema:name "impactScore" ; schema:value ?impactScore .
      ?hashProp schema:name "evidenceHash" ; schema:value ?evidenceHash .
    }
    ORDER BY DESC(?createdAt)
    ${sql}
  `;
}
