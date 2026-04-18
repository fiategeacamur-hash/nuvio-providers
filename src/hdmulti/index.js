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
  
  { key: '4khdhub', label: '4KHDHub', factory: () => require('../../providers/4khdhub.js') }

];

const SOURCE_TIMEOUT_BY_KEY = {
  uhdmovies: 10_000,   // 20s → 10s
  moviesdrive: 10_000, // 20s → 10s
  hdhub4u: 8_000,      // 12s → 8s
  '4khdhub': 8_000     // 12s → 8s
};

const PROVIDER_CACHE = Object.create(null);
const TOTAL_TIMEOUT_MS = 10_000;      // 18s → 10s (REDUCED)
const TV_TOTAL_TIMEOUT_MS = 8_000;    // 14s → 8s (REDUCED)

function getSourceTimeout(source) {
  if (isTvRuntime()) return 8_000;
  return SOURCE_TIMEOUT_BY_KEY[source.key] || 8_000;
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
    let ua = '';
    
    // CRITICAL FIX: Multiple fallbacks for different TV environments
    if (typeof globalThis !== 'undefined' && globalThis.navigator && globalThis.navigator.userAgent) {
      ua = globalThis.navigator.userAgent;
    } else if (typeof window !== 'undefined' && window.navigator && window.navigator.userAgent) {
      ua = window.navigator.userAgent;
    } else if (typeof navigator !== 'undefined' && navigator.userAgent) {
      ua = navigator.userAgent;
    }
    
    ua = String(ua).toLowerCase();
    console.log(`[HDMulti] UA: ${ua.substring(0, 60)}...`);
    
    // Expanded TV detection patterns
    const isTv = /smart-tv|smarttv|tizen|web0s|webos|bravia|aft|android tv|googletv|hbbtv|viera|aquos|regza/.test(ua);
    console.log(`[HDMulti] TV device: ${isTv}`);
    return isTv;
  } catch (error) {
    // CRITICAL FIX: If detection fails, DEFAULT TO TV MODE
    // Error means likely native TV environment without proper navigator object
    console.log(`[HDMulti] TV detect failed: ${error.message} → using TV mode`);
    return true;  // ← RETURN TRUE NOT FALSE!
  }
}

function getActiveSources() {
  return SOURCES;
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
          console.log(`[HDMulti] ${source.label} timeout (${timeoutMs}ms)`);
          resolve([]);
        }, timeoutMs);
      })
    ]);
    if (!Array.isArray(result)) return [];
    console.log(`[HDMulti] ${source.label}: ${result.length} streams`);
    return result.map((stream) => withSiteLabel(stream, source));
  } catch (error) {
    console.log(`[HDMulti] ${source.label} error: ${error.message}`);
    return [];
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
  const isTv = isTvRuntime();
  const activeSources = getActiveSources();

  if (activeSources.length === 0) {
    console.log('[HDMulti] No sources available.');
    return [];
  }

  const normalizedType = normalizeMediaType(mediaType);
  const streams = [];
  let isCollecting = true;

  console.log(`[HDMulti] Searching ${tmdbId} (${normalizedType}), TV=${isTv}`);

  // CRITICAL FIX: Start all requests immediately
  const sourcePromises = activeSources.map(async (source) => {
    if (!isCollecting) return;  // Don't start if already stopped
    
    try {
      const sourceStreams = await runSource(source, tmdbId, normalizedType, season, episode);
      if (Array.isArray(sourceStreams) && isCollecting) {
        streams.push(...sourceStreams);
        console.log(`[HDMulti] ${source.label}: +${sourceStreams.length} (total: ${streams.length})`);
      }
    } catch (error) {
      console.log(`[HDMulti] ${source.label} exception: ${error.message}`);
    }
  });

  const totalTimeout = isTv ? TV_TOTAL_TIMEOUT_MS : TOTAL_TIMEOUT_MS;

  // CRITICAL FIX: Return EARLY if we get any results
  // Don't wait for all sources if one is fast enough
  await Promise.race([
    Promise.all(sourcePromises),  // Wait for all OR
    new Promise((resolve) => {
      // Check every 500ms for early results
      const checkInterval = setInterval(() => {
        if (streams.length > 0) {
          console.log(`[HDMulti] Got ${streams.length} streams, returning early`);
          clearInterval(checkInterval);
          isCollecting = false;  // Stop accepting new results
          resolve();
        }
      }, 500);  // ← CHECK EVERY 500MS!

      // Absolute timeout fallback
      setTimeout(() => {
        clearInterval(checkInterval);
        isCollecting = false;
        console.log(`[HDMulti] Timeout (${totalTimeout}ms), returning ${streams.length} streams`);
        resolve();
      }, totalTimeout);
    })
  ]);

  console.log(`[HDMulti] Result: ${streams.length} streams`);
  return streams;
}

module.exports = { getStreams };
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
    let ua = '';
    if (typeof globalThis !== 'undefined' && globalThis.navigator && globalThis.navigator.userAgent) {
      ua = globalThis.navigator.userAgent;
    } else if (typeof window !== 'undefined' && window.navigator && window.navigator.userAgent) {
      ua = window.navigator.userAgent;
    } else if (typeof navigator !== 'undefined' && navigator.userAgent) {
      ua = navigator.userAgent;
    }
    ua = String(ua).toLowerCase();
    return /smart-tv|smarttv|tizen|web0s|webos|bravia|aft|android tv|googletv|hbbtv/.test(ua);
  } catch (_) {
    return true;
  }
}

function getActiveSources() {
  return SOURCES;
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
  
  console.log(`[HDMulti] Starting search for TMDB ${tmdbId} (${normalizedType})`);

  // CRITICAL FIX: Use Promise.allSettled instead of Promise.all
  // This ensures ALL sources complete, even if some fail
  // No timeout cancels the entire operation
  const sourcePromises = activeSources.map(async (source) => {
    try {
      const sourceStreams = await runSource(source, tmdbId, normalizedType, season, episode);
      if (Array.isArray(sourceStreams) && sourceStreams.length > 0) {
        console.log(`[HDMulti] ${source.label} found ${sourceStreams.length} streams`);
        streams.push(...sourceStreams);
      }
    } catch (error) {
      console.log(`[HDMulti] ${source.label} exception: ${error.message}`);
    }
  });

  const totalTimeout = isTv ? TV_TOTAL_TIMEOUT_MS : TOTAL_TIMEOUT_MS;

  // CRITICAL: Wait for ALL sources with timeout
  // This is NOT Promise.race - it's Promise with timeout wrapper
  // The difference: we ALWAYS return streams, not cancel on timeout
  try {
    await Promise.race([
      Promise.allSettled(sourcePromises),  // ← ALL sources must complete or settle
      new Promise((resolve, reject) => {
        setTimeout(() => {
          // Log that timeout occurred, but don't cancel collection
          console.log(`[HDMulti] Global timeout (${totalTimeout}ms) - returning ${streams.length} streams so far`);
          resolve();  // Resolve (don't reject) so we return streams
        }, totalTimeout);
      })
    ]);
  } catch (error) {
    console.log(`[HDMulti] Collection error: ${error.message}`);
  }

  console.log(`[HDMulti] Final result: ${streams.length} streams from ${activeSources.length} sources`);
  return streams;
}

module.exports = { getStreams };
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
    let ua = '';
    
    // CRITICAL FIX: Multiple fallbacks for different TV environments
    if (typeof globalThis !== 'undefined' && globalThis.navigator && globalThis.navigator.userAgent) {
      ua = globalThis.navigator.userAgent;
    } else if (typeof window !== 'undefined' && window.navigator && window.navigator.userAgent) {
      ua = window.navigator.userAgent;
    } else if (typeof navigator !== 'undefined' && navigator.userAgent) {
      ua = navigator.userAgent;
    }
    
    ua = String(ua).toLowerCase();
    console.log(`[HDMulti] UA: ${ua.substring(0, 60)}...`);
    
    // Expanded TV detection patterns
    const isTv = /smart-tv|smarttv|tizen|web0s|webos|bravia|aft|android tv|googletv|hbbtv|viera|aquos|regza/.test(ua);
    console.log(`[HDMulti] TV device: ${isTv}`);
    return isTv;
  } catch (error) {
    // CRITICAL FIX: If detection fails, DEFAULT TO TV MODE
    // Error means likely native TV environment without proper navigator object
    console.log(`[HDMulti] TV detect failed: ${error.message} → using TV mode`);
    return true;  // ← RETURN TRUE NOT FALSE!
  }
}

function getActiveSources() {
  return SOURCES;
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
          console.log(`[HDMulti] ${source.label} timeout (${timeoutMs}ms)`);
          resolve([]);
        }, timeoutMs);
      })
    ]);
    if (!Array.isArray(result)) return [];
    console.log(`[HDMulti] ${source.label}: ${result.length} streams`);
    return result.map((stream) => withSiteLabel(stream, source));
  } catch (error) {
    console.log(`[HDMulti] ${source.label} error: ${error.message}`);
    return [];
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
  const isTv = isTvRuntime();
  const activeSources = getActiveSources();

  if (activeSources.length === 0) {
    console.log('[HDMulti] No sources available.');
    return [];
  }

  const normalizedType = normalizeMediaType(mediaType);
  const streams = [];
  let isCollecting = true;

  console.log(`[HDMulti] Searching ${tmdbId} (${normalizedType}), TV=${isTv}`);

  // CRITICAL FIX: Start all requests immediately
  const sourcePromises = activeSources.map(async (source) => {
    if (!isCollecting) return;  // Don't start if already stopped
    
    try {
      const sourceStreams = await runSource(source, tmdbId, normalizedType, season, episode);
      if (Array.isArray(sourceStreams) && isCollecting) {
        streams.push(...sourceStreams);
        console.log(`[HDMulti] ${source.label}: +${sourceStreams.length} (total: ${streams.length})`);
      }
    } catch (error) {
      console.log(`[HDMulti] ${source.label} exception: ${error.message}`);
    }
  });

  const totalTimeout = isTv ? TV_TOTAL_TIMEOUT_MS : TOTAL_TIMEOUT_MS;

  // CRITICAL FIX: Return EARLY if we get any results
  // Don't wait for all sources if one is fast enough
  await Promise.race([
    Promise.all(sourcePromises),  // Wait for all OR
    new Promise((resolve) => {
      // Check every 500ms for early results
      const checkInterval = setInterval(() => {
        if (streams.length > 0) {
          console.log(`[HDMulti] Got ${streams.length} streams, returning early`);
          clearInterval(checkInterval);
          isCollecting = false;  // Stop accepting new results
          resolve();
        }
      }, 500);  // ← CHECK EVERY 500MS!

      // Absolute timeout fallback
      setTimeout(() => {
        clearInterval(checkInterval);
        isCollecting = false;
        console.log(`[HDMulti] Timeout (${totalTimeout}ms), returning ${streams.length} streams`);
        resolve();
      }, totalTimeout);
    })
  ]);

  console.log(`[HDMulti] Result: ${streams.length} streams`);
  return streams;
}

module.exports = { getStreams };
