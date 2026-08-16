/**
 * The HTTP layer, tested without a database.
 *
 * The contract test is the one that matters most: it walks every entry in `API_ROUTES`,
 * generates the path the client would call, and asserts a server route matches it with the
 * same verb. The client and the server cannot drift apart without this failing, which is
 * what makes `apiContract.ts` a contract rather than a comment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_ROUTES, type ApiRoute } from '../src/domain/data/apiContract.ts';
import { matchRoute } from './http.ts';
import { MAX_PAGE_SIZE, ROUTES, parseMonsterQuery } from './routes.ts';

/**
 * The paths a client could call for one contract entry.
 *
 * Every `path` in the contract takes zero or one argument, but the argument is not always
 * an id: `monsters.list` and `monsters.count` interpolate a whole query string, which is
 * empty when there is no query. So both are tried — a sample id and nothing — and the entry
 * counts as served if either shape matches. The query itself is stripped, because a query
 * string is not part of a path.
 */
function samplePaths(route: ApiRoute): string[] {
  const build = API_ROUTES[route].path as (value?: string) => string;
  return [...new Set(['SAMPLE', ''].map((value) => build(value).split('?')[0] ?? ''))];
}

interface ContractEntry {
  name: ApiRoute;
  method: string;
  paths: string[];
}

const CONTRACT: ContractEntry[] = (Object.keys(API_ROUTES) as ApiRoute[]).map((name) => ({
  name,
  method: API_ROUTES[name].method,
  paths: samplePaths(name),
}));

test('every route in the API contract is served by the backend, with the same verb', () => {
  const missing = CONTRACT.filter(
    (entry) => !entry.paths.some((path) => matchRoute(ROUTES, entry.method, path)),
  ).map((entry) => `${entry.method} ${entry.paths.join(' | ')} (${entry.name})`);

  assert.deepEqual(missing, [], `contract routes with no server route:\n${missing.join('\n')}`);
});

test('every backend route is one the contract actually names', () => {
  // The other direction: a route nobody calls is dead code that still has to be reviewed.
  const orphans = ROUTES.filter(
    (route) =>
      !CONTRACT.some((entry) =>
        entry.paths.some((path) => matchRoute([route], entry.method, path)),
      ),
  ).map((route) => `${route.method} ${route.pattern}`);

  assert.deepEqual(orphans, []);
});

test('a literal path beats a placeholder, whatever order the table is in', () => {
  const count = matchRoute(ROUTES, 'GET', '/monsters/count');
  assert.equal(count?.route.pattern, '/monsters/count');

  const byId = matchRoute(ROUTES, 'GET', '/monsters/m-goblin');
  assert.equal(byId?.route.pattern, '/monsters/:monsterId');
  assert.equal(byId?.params.monsterId, 'm-goblin');

  // Reversed, the answer has to be identical — the matcher scores rather than first-wins.
  const reversed = matchRoute(ROUTES.toReversed(), 'GET', '/monsters/count');
  assert.equal(reversed?.route.pattern, '/monsters/count');
});

test('the verb is part of the match, not an afterthought', () => {
  assert.equal(matchRoute(ROUTES, 'PUT', '/combats/cb-1')?.route.pattern, '/combats/:combatId');
  assert.equal(matchRoute(ROUTES, 'DELETE', '/combats/cb-1'), null);
  assert.equal(matchRoute(ROUTES, 'GET', '/nothing/here'), null);
});

test('path parameters are decoded, and a longer path is not a partial match', () => {
  const match = matchRoute(ROUTES, 'GET', '/characters/ch%20quill');
  assert.equal(match?.params.characterId, 'ch quill');
  assert.equal(matchRoute(ROUTES, 'GET', '/characters/ch-quill/extra'), null);
});

test('the two contract entries that share a path are told apart by the query, not the route', () => {
  // `characters.listForOwner` and `characters.listUnattached` are the same path in the
  // contract; the server must not invent a second route for the second one.
  const forOwner = matchRoute(ROUTES, 'GET', '/users/u-marta/characters');
  const unattached = matchRoute(ROUTES, 'GET', '/users/u-marta/characters');
  assert.equal(forOwner?.route.pattern, unattached?.route.pattern);
  assert.equal(forOwner?.params.userId, 'u-marta');
});

test('a monster query round-trips from the string the client builds', () => {
  const search = new URLSearchParams(
    'search=goblin&origin=homebrew&sort=name&limit=25&challengeMin=1&challengeMax=5&facet.type=dragon,undead&facet.size=large',
  );
  assert.deepEqual(parseMonsterQuery(search), {
    search: 'goblin',
    origin: 'homebrew',
    sort: 'name',
    limit: 25,
    challengeMin: 1,
    challengeMax: 5,
    facets: { type: ['dragon', 'undead'], size: ['large'] },
  });
});

test('a query string is untrusted, so nonsense is dropped rather than guessed at', () => {
  const parsed = parseMonsterQuery(
    new URLSearchParams(
      'origin=everything&sort=by-vibes&limit=-4&challengeMin=abc&facet.type=&search=%20%20&offset=-1',
    ),
  );
  // Nothing survived except the page ceiling, which is applied whether or not it was asked
  // for — an unpaged list endpoint is one whose cost is decided by whoever calls it.
  assert.deepEqual(parsed, { limit: MAX_PAGE_SIZE });
});

test('a list endpoint is always bounded, and never above its ceiling', () => {
  assert.equal(parseMonsterQuery(new URLSearchParams()).limit, MAX_PAGE_SIZE);
  assert.equal(parseMonsterQuery(new URLSearchParams('limit=10')).limit, 10);
  assert.equal(parseMonsterQuery(new URLSearchParams('limit=100000')).limit, MAX_PAGE_SIZE);

  assert.equal(parseMonsterQuery(new URLSearchParams()).offset, undefined);
  assert.equal(parseMonsterQuery(new URLSearchParams('offset=0')).offset, 0);
  assert.equal(parseMonsterQuery(new URLSearchParams('offset=40')).offset, 40);
  assert.equal(parseMonsterQuery(new URLSearchParams('offset=-1')).offset, undefined);
  assert.equal(parseMonsterQuery(new URLSearchParams('offset=1.5')).offset, undefined);
});

test('challenge bounds accept zero and fractions, which real difficulty ranks are', () => {
  const parsed = parseMonsterQuery(new URLSearchParams('challengeMin=0&challengeMax=0.125'));
  assert.equal(parsed.challengeMin, 0);
  assert.equal(parsed.challengeMax, 0.125);
});
