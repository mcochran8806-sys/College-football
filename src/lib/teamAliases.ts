/**
 * The alias table lives in shared/ so the serverless functions can use it too
 * (favorite-team resolution in /api/plays). This module is the client's entry
 * point to it — edit shared/teamAliases.ts to add a school.
 */
export {
  AMBIGUOUS_TOKENS,
  MIN_ALIAS_LENGTH,
  TEAM_ALIASES,
  aliasesFor,
  normalizeText,
  type AliasEntry,
} from '../../shared/teamAliases';
