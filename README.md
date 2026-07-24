# MediaSync & Nuvio Hub

A 100% client-side tool to merge, deduplicate, and sync media watchlists from Trakt, MyAnimeList, and Simkl directly to Nuvio. 

It runs entirely in the browser. No data leaves your machine unless you explicitly sync to the Nuvio API. 

## How to use

### GitHub Pages (Recommended)
Visit the [GitHub Pages site](https://thisiswinks.github.io/nuvio-watchlist-importer-merger/).
1. Drag and drop your Trakt export `.zip`, MyAnimeList `.xml`, or Simkl `.csv` into the drop zone.
2. The app deduplicates items locally.
3. Use the **Enrichment** tab to cross-reference anime using Otaku-Mappings.
4. Click **Sync Watched to Nuvio API** and paste your Nuvio token to push your history.

### Local use
You don't need a server to run this.
1. Clone or download the repository.
2. Double-click `index.html` to open it in your browser.
3. Drag and drop your files. 

### Self-hosting
Since the app is purely static HTML, CSS, and JS, you can host it anywhere.
1. Copy the repository files to any static web host (S3, Netlify, Vercel, Nginx).
2. Serve the root directory.

## Architecture

This project is fully client-side and serverless.
- **Parsing**: `PapaParse` for CSV, `JSZip` for Trakt archives, native `DOMParser` for XML.
- **Storage**: Caches merged payloads in browser `IndexedDB` so your progress persists across reloads.
- **Design**: Strict Bauhaus Constructivist UI system.

## Contributing

See `AGENTS.md` for our strict guidelines on agent contributions.

All copy and code must adhere to the `no-ai-slop` principles. Keep writing sharp, direct, and human. Remove abstract nouns, empty qualifiers, and AI patterns. If you use words like "delve," "leverage," "foster," or "transformative," your PR will be rejected.
