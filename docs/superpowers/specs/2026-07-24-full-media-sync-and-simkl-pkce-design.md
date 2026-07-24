# Design Spec: Full Episode History, Ratings, Simkl PKCE OAuth & Comprehensive ZIP Import

**Date**: 2026-07-24  
**Status**: Approved (Autonomous Execution)  
**Authors**: MediaSync Engine & AI Agent  

---

## 1. Executive Summary & Goals

The goal of this overhaul is to eliminate data loss during import/export, preserve detailed per-episode watch history and user ratings, provide seamless 1-click automatic Simkl sync via PKCE OAuth, and make ZIP export uploads bulletproof with clear user instructions.

---

## 2. Key Architecture Principles & Layer Boundaries

1. **Client-side Pure JS & Serverless (GitHub Pages)**:
   - Everything executes on the browser client without central backend servers.
   - All OAuth operations use Public Client OAuth with PKCE (S256 code challenge).
   - Local state persists atomically in IndexedDB (`MediaSyncDB`) and `localStorage`.

2. **Zero Data Loss Hierarchy**:
   - Media records must never collapse or strip episode coordinates (`season`, `episode`), user ratings (1-10 scale), status (`completed`, `watching`, `plan_to_watch`, `dropped`, `on_hold`), or watched timestamps (`watched_at`, `last_watched_at`).
   - Merging duplicate items across sources must combine episodes (deduplicating by `{season, episode}`) and retain the highest quality rating and metadata.

3. **Simkl API 2-Phase Sync Strategy**:
   - **Phase 1 (Initial Sync)**: Fetch `/sync/shows`, `/sync/movies`, and `/sync/anime` **sequentially** (wait for each request to finish before triggering the next) without `date_from`. Fetch `/sync/activities` to record the initial activity timestamp.
   - **Phase 2 (Delta Sync)**: Subsequent syncs fetch `/sync/all-items/?date_from=SAVED_DATE` to download only the updated delta.

---

## 3. Subsystem Designs

### A. Extended Parsers & ZIP Archive Processor (`app.js`)
- **Trakt CSV/JSON Multi-File Handler**:
  - Recognizes `watched_movies.csv`, `watched_shows.csv`, `ratings_movies.csv`, `ratings_shows.csv`, `ratings_episodes.csv`, `history_movies.csv`, `history_shows.csv`.
  - Maps `season`, `episode`, `watched_at`, `plays`, `rating`, `rated_at`.
- **Simkl CSV/JSON Parser**:
  - Extracts `SIMKL_ID`, `Title`, `Type`, `Year`, `Watchlist`, `LastEpWatched`, `WatchedDate`, `Rating`, `My Rating`, `TVDB`, `TMDB`, `IMDB`.
  - Supports episode count / last episode watched formatting (e.g. `S02E05` or `ep 25`).
- **MyAnimeList XML Parser**:
  - Extracts `<series_title>`, `<series_animedb_id>`, `<series_type>`, `<my_watched_episodes>`, `<my_score>`, `<my_status>`, `<my_start_date>`, `<my_finish_date>`.
- **ZIP File Unpacking**:
  - `JSZip` iterates over all files inside a dropped `.zip`.
  - Pre-groups files by type, parses all history + ratings files, and links episode scrobbles to their parent show record by IMDB/TMDB/TVDB/Trakt ID or title.

### B. Simkl PKCE OAuth & Sync Engine (`app.js`)
- **App Credentials**:
  - Client ID: `3de047451b8c6c8c1e53cd04599a45aa7c694f70bc31916683488ce6ba1a93d8`
  - Redirect URI: `window.location.origin + window.location.pathname`
- **PKCE Authorization Flow**:
  1. `generateCodeVerifier()`: Crypto-random 64-char string.
  2. `generateCodeChallenge(verifier)`: SHA-256 hash -> Base64URL encoding.
  3. Store `code_verifier` in `sessionStorage`.
  4. Redirect user to `https://simkl.com/oauth/authorize?response_type=code&client_id=...&redirect_uri=...&code_challenge=...&code_challenge_method=S256`.
- **Token Exchange**:
  1. Detect `?code=...` parameter in URL on initialization.
  2. Perform `POST https://api.simkl.org/oauth/token` with `{ grant_type: 'authorization_code', code, client_id, code_verifier, redirect_uri }`.
  3. Save `simkl_access_token` in `localStorage`. Clean up query parameters with `history.replaceState`.
- **Sync Execution**:
  1. UI button: `Connect Simkl (PKCE OAuth)` / `Sync from Simkl API`.
  2. Runs Phase 1 (sequential fetch) or Phase 2 (delta fetch with `date_from`).
  3. Updates library & IndexedDB.

### C. Enhanced Media Grid UI & Instructions
- **Media Cards**:
  - Displays user rating badge (`★ 9/10`), watch status badge, watched episode progress (`S01E12` or `12 EPs`), and external ID pills.
- **Export Guide Modal & Hero Instructions**:
  - Step-by-step accordion/modal explaining how to export full data from Trakt, Simkl, MAL, and Nuvio with direct links.

---

## 4. Verification & Test Plan

1. **Python Unit Tests**:
   - `python3 -m unittest discover -s tests -t . -v` MUST pass 100%.
2. **Client-side Verification**:
   - Verify ZIP parsing with sample Trakt, Simkl, MAL exports.
   - Verify PKCE token generation & URL parameter cleanup.
   - Verify episode counts and ratings render on media cards.
   - Verify export payload JSONs retain episode history and ratings.
