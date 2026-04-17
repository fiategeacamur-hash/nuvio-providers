function loadProvider(label, factory) {
  try {
    const provider = factory();
    if (!provider || typeof provider.getStreams !== 'function') {
      console.log(`[HDMulti] ${label} is missing getStreams.`);
      return null;
    }
    return provider;
  } catch (error) {
    console.log(`[HDMulti] ${label} unavailable: ${error && error.message ? error.message : error}`);
    return null;
  }
}

const SOURCES = [
  { key: 'uhdmovies', label: 'UHDMovies', factory: () => require('../../providers/uhdmovies.js') },
  { key: '4khdhub', label: '4KHDHub', factory: () => require('../../providers/4khdhub.js') },
  { key: 'hdhub4u', label: 'HDHub4u', factory: () => require('../../providers/hdhub4u.js') },
  { key: 'moviesdrive', label: 'Moviesdrive', factory: () => require('../../providers/moviesdrive.js') }
];
const SOURCE_TIMEOUT_BY_KEY = {
  uhdmovies: 20_000,
  moviesdrive: 20_000,
  hdhub4u: 12_000,
  '4khdhub': 12_000
};
const TV_SOURCE_ALLOWLIST = ['4khdhub'];
const PROVIDER_CACHE = Object.create(null);
const TOTAL_TIMEOUT_MS = 18_000;
const TV_TOTAL_TIMEOUT_MS = 8_000;

function getSourceTimeout(source) {
  if (isTvRuntime()) return 7_000;
  return SOURCE_TIMEOUT_BY_KEY[source.key] || 15_000;
}

function getProvider(source) {
  if (Object.prototype.hasOwnProperty.call(PROVIDER_CACHE, source.key)) {
    return PROVIDER_CACHE[source.key];
  }

  const provider = loadProvider(source.label, source.factory);
  PROVIDER_CACHE[source.key] = provider || null;
  return PROVIDER_CACHE[source.key];
}

function isTvRuntime() {
  try {
    const ua = String(globalThis && globalThis.navigator && globalThis.navigator.userAgent ? globalThis.navigator.userAgent : '').toLowerCase();
    return /smart-tv|smarttv|tizen|web0s|webos|bravia|aft|android tv|googletv/.test(ua);
  } catch (_) {
    return false;
  }
}

function getActiveSources() {
  if (!isTvRuntime()) return SOURCES;
  return SOURCES.filter((source) => TV_SOURCE_ALLOWLIST.includes(source.key));
}

function normalizeMediaType(mediaType) {
  if (mediaType === 'series') return 'tv';
  if (mediaType === 'show') return 'tv';
  return mediaType || 'movie';
}

function withSiteLabel(stream, source) {
  const cloned = Object.assign({}, stream);
  const safeName = (cloned.name || '').trim();
  const safeTitle = (cloned.title || '').trim();

  cloned.name = safeName.includes(source.label) ? safeName : `[${source.label}] ${safeName || 'Link'}`;
  cloned.title = safeTitle.includes(`[${source.label}]`) ? safeTitle : `[${source.label}] ${safeTitle || 'Direct Link'}`;
  cloned.provider = 'hdmulti';
  cloned.sourceSite = source.key;

  return cloned;
}

async function runSource(source, tmdbId, mediaType, season, episode) {
  let timeoutId;
  const timeoutMs = getSourceTimeout(source);
  const provider = getProvider(source);
  if (!provider) return [];

  try {
    const result = await Promise.race([
      provider.getStreams(tmdbId, mediaType, season, episode),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => {
          console.log(`[HDMulti] ${source.label} timed out after ${timeoutMs}ms.`);
          resolve([]);
        }, timeoutMs);
      })
    ]);
    if (!Array.isArray(result)) return [];
    return result.map((stream) => withSiteLabel(stream, source));
  } catch (error) {
    console.log(`[HDMulti] ${source.label} failed: ${error && error.message ? error.message : error}`);
    return [];
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
  const isTv = isTvRuntime();
  const activeSources = getActiveSources();

  if (activeSources.length === 0) {
    console.log('[HDMulti] No sub-providers are available in this runtime.');
    return [];
  }

  const normalizedType = normalizeMediaType(mediaType);
  const streams = [];
  const collectorPromise = Promise.all(
    activeSources.map(async (source) => {
      const sourceStreams = await runSource(source, tmdbId, normalizedType, season, episode);
      if (Array.isArray(sourceStreams)) streams.push(...sourceStreams);
    })
  );

  const totalTimeout = isTv ? TV_TOTAL_TIMEOUT_MS : TOTAL_TIMEOUT_MS;
  await Promise.race([
    collectorPromise,
    new Promise((resolve) => {
      setTimeout(() => {
        console.log(`[HDMulti] Global timeout reached (${totalTimeout}ms). Returning partial results.`);
        resolve();
      }, totalTimeout);
    })
  ]);

  return streams;
}

module.exports = { getStreams };
