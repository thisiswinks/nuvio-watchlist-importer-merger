# Data Source Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make data loading URLs configurable and visually transparent via the UI, and update the github repo metadata.

**Architecture:** Add a UI element for configuring the JSON URLs. Store in `localStorage`. Modify `loadData()` to use them.

**Tech Stack:** HTML/JS, LocalStorage, GitHub CLI

## Global Constraints

None

---

### Task 1: Update GitHub Repository Metadata

**Files:**
- Modify: Remote GitHub settings (via `gh` cli)

**Interfaces:**
- Consumes: `gh` CLI locally

- [ ] **Step 1: Run the `gh repo edit` command**

```bash
gh repo edit thisiswinks/nuvio-watchlist-importer-merger --description "Unified media tracking dashboard and direct Nuvio watched history API importer for Trakt, Simkl, MyAnimeList, and Nuvio." --homepage "https://thisiswinks.github.io/nuvio-watchlist-importer-merger/"
```

### Task 2: UI Implementation in HTML

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

**Interfaces:**
- Consumes: DOM

- [ ] **Step 1: Add a Data Source settings button in the UI toolbar**
In `index.html`, add this button to `.filter-toolbar`:

```html
        <div class="data-source-config">
          <button id="btn-data-source" class="btn btn-secondary btn-sm" style="font-size: 0.8rem; padding: 0.4rem 0.8rem;">
            ⚙️ Data Source
          </button>
        </div>
```

- [ ] **Step 2: Add the Modal HTML structure**
At the bottom of `index.html` (near other modals), add:

```html
  <!-- Modal for Data Source Configuration -->
  <div id="data-source-modal" class="modal-overlay hidden">
    <div class="modal-content glass-card" style="max-width: 500px;">
      <div class="modal-header">
        <h3>⚙️ Data Source Configuration</h3>
        <button id="data-source-modal-close" class="close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size: 0.9rem; margin-bottom: 1rem;">Configure the URLs used to load your media data. Leave blank to use the default local exports.</p>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.25rem;">Combined Data URL:</label>
          <input type="text" id="input-url-combined" class="select-input" style="width: 100%; padding: 0.5rem;" placeholder="data/export/combined_full.json">
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label style="display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.25rem;">Flagged Data URL:</label>
          <input type="text" id="input-url-flagged" class="select-input" style="width: 100%; padding: 0.5rem;" placeholder="data/export/reconciliation_flagged.json">
        </div>

        <button id="btn-save-data-source" class="btn btn-primary btn-block">
          Save & Reload
        </button>
      </div>
    </div>
  </div>
```

### Task 3: JavaScript Logic for Loading and Saving

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: HTML Modal inputs
- Produces: `localStorage` keys

- [ ] **Step 1: Update `loadData()` to use localStorage**
In `app.js`, modify `loadData`:

```javascript
async function loadData() {
  if (window.COMBINED_MEDIA_DATA && Array.isArray(window.COMBINED_MEDIA_DATA)) {
    allItems = window.COMBINED_MEDIA_DATA;
  }
  if (window.FLAGGED_MEDIA_DATA && Array.isArray(window.FLAGGED_MEDIA_DATA)) {
    flaggedItems = window.FLAGGED_MEDIA_DATA;
  }

  const defaultCombinedUrl = 'data/export/combined_full.json';
  const defaultFlaggedUrl = 'data/export/reconciliation_flagged.json';

  const combinedUrl = localStorage.getItem('nuvio_custom_combined_url') || defaultCombinedUrl;
  const flaggedUrl = localStorage.getItem('nuvio_custom_flagged_url') || defaultFlaggedUrl;

  try {
    const resCombined = await fetch(combinedUrl);
    if (resCombined.ok) {
      allItems = await resCombined.json();
    }
    const resFlagged = await fetch(flaggedUrl);
    if (resFlagged.ok) {
      flaggedItems = await resFlagged.json();
    }
  } catch (e) {
    // Local file:// protocol fetch fallback or URL error
    console.warn("Failed to fetch custom URLs or local fallback:", e);
  }

  updateCounters();
  applyFilters();
}
```

- [ ] **Step 2: Add Event Listeners for the Modal**
In `app.js`, inside `setupEventListeners()`:

```javascript
  // Data Source Modal
  const dsModal = document.getElementById('data-source-modal');
  const inputCombined = document.getElementById('input-url-combined');
  const inputFlagged = document.getElementById('input-url-flagged');

  document.getElementById('btn-data-source').addEventListener('click', () => {
    inputCombined.value = localStorage.getItem('nuvio_custom_combined_url') || '';
    inputFlagged.value = localStorage.getItem('nuvio_custom_flagged_url') || '';
    dsModal.classList.remove('hidden');
  });

  document.getElementById('data-source-modal-close').addEventListener('click', () => {
    dsModal.classList.add('hidden');
  });

  document.getElementById('btn-save-data-source').addEventListener('click', () => {
    const comb = inputCombined.value.trim();
    const flag = inputFlagged.value.trim();
    
    if (comb) localStorage.setItem('nuvio_custom_combined_url', comb);
    else localStorage.removeItem('nuvio_custom_combined_url');
    
    if (flag) localStorage.setItem('nuvio_custom_flagged_url', flag);
    else localStorage.removeItem('nuvio_custom_flagged_url');
    
    window.location.reload();
  });
```
