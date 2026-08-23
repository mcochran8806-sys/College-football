/**
 * The alias tables live in shared/leagues/{cfb,nfl}.ts so the serverless
 * functions can use them too (favorite-team resolution in /api/plays). This
 * module is the client's entry point — edit those files to add a team.
 */
export {
  MIN_ALIAS_LENGTH,
  aliasesFor,
  ambiguousTokens,
  escapeRegExp,
  matchableForms,
  normalizeText,
  type AliasEntry,
  type LeagueConfig,
  type LeagueId,
} from '../../shared/teamAliases';
