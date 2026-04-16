/**
 * hdmulti - Built from src/hdmulti/
 * Generated: 2026-04-16T18:41:14.296Z
 */
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/hdmulti/index.js
function safeRequire(paths, label) {
  for (const path of paths) {
    try {
      return require(path);
    } catch (error) {
    }
  }
  console.log(`[HDMulti] ${label} unavailable in this runtime.`);
  return null;
}
var SOURCES = [
  {
    key: "uhdmovies",
    label: "UHDMovies",
    provider: safeRequire(["./uhdmovies.js", "../uhdmovies.js", "../../providers/uhdmovies.js"], "UHDMovies")
  },
  {
    key: "4khdhub",
    label: "4KHDHub",
    provider: safeRequire(["./4khdhub.js", "../4khdhub.js", "../../providers/4khdhub.js"], "4KHDHub")
  },
  {
    key: "hdhub4u",
    label: "HDHub4u",
    provider: safeRequire(["./hdhub4u.js", "../hdhub4u.js", "../../providers/hdhub4u.js"], "HDHub4u")
  },
  {
    key: "moviesdrive",
    label: "Moviesdrive",
    provider: safeRequire(["./moviesdrive.js", "../moviesdrive.js", "../../providers/moviesdrive.js"], "Moviesdrive")
  }
].filter((source) => source.provider && typeof source.provider.getStreams === "function");
function normalizeMediaType(mediaType) {
  if (mediaType === "series")
    return "tv";
  if (mediaType === "show")
    return "tv";
  return mediaType || "movie";
}
function withSiteLabel(stream, source) {
  const cloned = Object.assign({}, stream);
  const safeName = (cloned.name || "").trim();
  const safeTitle = (cloned.title || "").trim();
  cloned.name = safeName.includes(source.label) ? safeName : `[${source.label}] ${safeName || "Link"}`;
  cloned.title = safeTitle.includes(`[${source.label}]`) ? safeTitle : `[${source.label}] ${safeTitle || "Direct Link"}`;
  cloned.provider = "hdmulti";
  cloned.sourceSite = source.key;
  return cloned;
}
function runSource(source, tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      const result = yield source.provider.getStreams(tmdbId, mediaType, season, episode);
      if (!Array.isArray(result))
        return [];
      return result.map((stream) => withSiteLabel(stream, source));
    } catch (error) {
      console.log(`[HDMulti] ${source.label} failed: ${error && error.message ? error.message : error}`);
      return [];
    }
  });
}
function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  return __async(this, null, function* () {
    if (SOURCES.length === 0) {
      console.log("[HDMulti] No sub-providers are available in this runtime.");
      return [];
    }
    const normalizedType = normalizeMediaType(mediaType);
    const settled = yield Promise.allSettled(
      SOURCES.map((source) => runSource(source, tmdbId, normalizedType, season, episode))
    );
    const streams = [];
    for (const item of settled) {
      if (item.status === "fulfilled" && Array.isArray(item.value)) {
        streams.push(...item.value);
      }
    }
    return streams;
  });
}
module.exports = { getStreams };
