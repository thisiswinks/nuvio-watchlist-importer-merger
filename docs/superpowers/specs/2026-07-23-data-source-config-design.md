# Transparent Data Source Configuration

## Goal
Make it completely transparent to users where the frontend web application is pulling its data from, and allow them to configure it directly on the GitHub Pages site.

## Problem Statement
Currently, `app.js` hardcodes the fetch URLs for the data (`data/export/combined_full.json` and `data/export/reconciliation_flagged.json`). There is no visual indication on the page that tells the user where this data comes from, nor is there a way to override it without modifying the code. The user requested this to be "transparent and configurable on the github page".

## Architecture & Components

We will introduce a "Data Source" settings feature to the UI:

1. **Status Pill**: A visual indicator located in the `.filter-toolbar` or header that shows the active data source (e.g., `🟢 Data: Default Local Export`).
2. **Settings Modal**: Clicking the pill opens a modal. The modal will:
   - Explicitly state the two URLs currently being used to fetch the data.
   - Provide text inputs to override these URLs.
   - Have a "Save & Reload" button.
3. **Storage**: The custom URLs will be stored in `localStorage` under keys like `nuvio_custom_combined_url` and `nuvio_custom_flagged_url`.
4. **Data Loader (`app.js`)**: The `loadData()` function will be updated to check `localStorage` first before falling back to the default paths.

## Error Handling
If a custom URL fails to fetch, the `catch` block in `loadData()` will catch it. We should display a toast or `alert()` indicating that the custom URL failed to load, to provide immediate feedback to the user.

## GitHub Repo Metadata
Separately, the GitHub repository's metadata will be updated using the `gh` CLI to set the description and the homepage URL.

- Description: "Unified media tracking dashboard and direct Nuvio watched history API importer for Trakt, Simkl, MyAnimeList, and Nuvio."
- Homepage: `https://thisiswinks.github.io/nuvio-watchlist-importer-merger/`
