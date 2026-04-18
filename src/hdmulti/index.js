 function loadProvider(label, factory) {
  try {
    const provider = factory();
    if (!provider || typeof provider.getStreams !== 'function') {
      console.log(`[HDMulti] ${label} missing getStreams`);
      return null;
    }
    return provider;
  } catch (e) {
    console.log(`[HDMulti] ${label} load error: ${e.message}`);
    return null;
  }
}

const SOURCES = [
  { key: '4khdhub', label: '4KHDHub', factory: () => require('../../providers/4khdhub.js') }
];

const PROVIDER_CACHE = Object.create(null);

const TOTAL_TIMEOUT_MS = 12000;
const TV_TOTAL_TIMEOUT_MS = 15000;

function getProvider(source) {
  if (PROVIDER_CACHE[source.key] !== undefined) {
    return PROVIDER_CACHE[source.key];
  }
  const p = loadProvider(source.label, source.factory);
  PROVIDER_CACHE[source.key] = p || null;
  return PROVIDER_CACHE[source.key];
}

function isTvRuntime() {
  try {
    let ua = '';

    if (typeof globalThis !== 'undefined' && globalThis.navigator?.userAgent) {
      ua = globalThis.navigator.userAgent;
    } else if (typeof navigator !== 'undefined' && navigator.userAgent) {
      ua = navigator.userAgent;
    }

    ua = String(ua).toLowerCase();

    return /smart-tv|smarttv|tizen|webos|android tv|googletv|aft|bravia/.test(ua);
  } catch {
    return true;
  }
}

function normalizeMediaType(mediaType) {
  if (mediaType === 'series' || mediaType === 'show') return 'tv';
  return mediaType || 'movie';
}

function withSiteLabel(stream, source) {
  const s = { ...stream };

  const name = (s.name || '').trim();
  const title = (s.title || '').trim();

  s.name = `[${source.label}] ${name || 'Link'}`;
  s.title = `[${source.label}] ${title || 'Direct Link'}`;
  s.provider = 'hdmulti';
  s.sourceSite = source.key;

  return s;
}

async function runSource(source, tmdbId, mediaType, season, episode) {
  const provider = getProvider(source);
  if (!provider) return [];

  try {
    const result = await provider.getStreams(tmdbId, mediaType, season, episode);

    if (!Array.isArray(result)) return [];

    console.log(`[HDMulti] ${source.label}: ${result.length}`);
    return result.map(s => withSiteLabel(s, source));

  } catch (e) {
    console.log(`[HDMulti] ${source.label} failed: ${e.message}`);
    return [];
  }
}

async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
  const isTv = isTvRuntime();
  const sources = SOURCES;

  if (!sources.length) return [];

  const type = normalizeMediaType(mediaType);
  const streams = [];

  console.log(`[HDMulti] Start ${tmdbId} (${type}) TV=${isTv}`);

  const tasks = sources.map(async (source) => {
    try {
      const res = await runSource(source, tmdbId, type, season, episode);
      if (Array.isArray(res) && res.length > 0) {
        streams.push(...res);
      }
    } catch {}
  });

  const timeout = isTv ? TV_TOTAL_TIMEOUT_MS : TOTAL_TIMEOUT_MS;

  await Promise.race([
    Promise.allSettled(tasks),
    new Promise(resolve => setTimeout(resolve, timeout))
  ]);

  console.log(`[HDMulti] DONE: ${streams.length} streams`);
  return streams;
}

module.exports = { getStreams };
