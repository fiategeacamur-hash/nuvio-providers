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
  { key: 'uhdmovies', label: 'UHDMovies', provider: loadProvider('UHDMovies', () => require('../../providers/uhdmovies.js')) },
  { key: '4khdhub', label: '4KHDHub', provider: loadProvider('4KHDHub', () => require('../../providers/4khdhub.js')) },
  { key: 'hdhub4u', label: 'HDHub4u', provider: loadProvider('HDHub4u', () => require('../../providers/hdhub4u.js')) },
  { key: 'moviesdrive', label: 'Moviesdrive', provider: loadProvider('Moviesdrive', () => require('../../providers/moviesdrive.js')) }
].filter((source) => Boolean(source.provider));
const SOURCE_TIMEOUT_MS = 8_000;

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
  try {
    const result = await Promise.race([
      source.provider.getStreams(tmdbId, mediaType, season, episode),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => {
          console.log(`[HDMulti] ${source.label} timed out after ${SOURCE_TIMEOUT_MS}ms.`);
          resolve([]);
        }, SOURCE_TIMEOUT_MS);
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
  if (SOURCES.length === 0) {
    console.log('[HDMulti] No sub-providers are available in this runtime.');
    return [];
  }

  const normalizedType = normalizeMediaType(mediaType);

  const results = await Promise.all(
    SOURCES.map((source) => runSource(source, tmdbId, normalizedType, season, episode))
  );

  return results.reduce((streams, sourceStreams) => {
    if (Array.isArray(sourceStreams)) streams.push(...sourceStreams);
    return streams;
  }, []);
}

module.exports = { getStreams };
