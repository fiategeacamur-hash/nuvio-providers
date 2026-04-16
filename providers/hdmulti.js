/**
 * HDMulti Provider
 * Combines UHDMovies, 4KHDHub, HDHub4u and Moviesdrive
 * Keeps source label clear on every stream item.
 */
"use strict";

var uhdmovies = require("./uhdmovies");
var fourkhdhub = require("./4khdhub");
var hdhub4u = require("./hdhub4u");
var moviesdrive = require("./moviesdrive");

var SOURCES = [
  { key: "uhdmovies", label: "UHDMovies", provider: uhdmovies },
  { key: "4khdhub", label: "4KHDHub", provider: fourkhdhub },
  { key: "hdhub4u", label: "HDHub4u", provider: hdhub4u },
  { key: "moviesdrive", label: "Moviesdrive", provider: moviesdrive }
];

function withSiteLabel(stream, source) {
  var cloned = Object.assign({}, stream || {});
  var safeName = String(cloned.name || "").trim();
  var safeTitle = String(cloned.title || "").trim();

  cloned.name = safeName.indexOf(source.label) !== -1 ? safeName : "[" + source.label + "] " + (safeName || "Link");
  cloned.title = safeTitle.indexOf("[" + source.label + "]") !== -1 ? safeTitle : "[" + source.label + "] " + (safeTitle || "Direct Link");
  cloned.provider = "hdmulti";
  cloned.sourceSite = source.key;
  return cloned;
}

function runSource(source, tmdbId, mediaType, season, episode) {
  return Promise.resolve()
    .then(function () {
      return source.provider.getStreams(tmdbId, mediaType, season, episode);
    })
    .then(function (result) {
      if (!Array.isArray(result)) return [];
      return result.map(function (stream) {
        return withSiteLabel(stream, source);
      });
    })
    .catch(function (error) {
      console.log("[HDMulti] " + source.label + " failed: " + (error && error.message ? error.message : error));
      return [];
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
  if (mediaType === void 0) mediaType = "movie";
  if (season === void 0) season = null;
  if (episode === void 0) episode = null;

  return Promise.all(
    SOURCES.map(function (source) {
      return runSource(source, tmdbId, mediaType, season, episode);
    })
  ).then(function (results) {
    return results.reduce(function (acc, list) {
      if (Array.isArray(list)) acc.push.apply(acc, list);
      return acc;
    }, []);
  });
}

module.exports = { getStreams: getStreams };
