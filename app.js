let allItems = [];
let flaggedItems = [];
let filteredItems = [];
let currentTab = 'all';
let currentPage = 1;
const pageSize = 24;

const DEFAULT_NUVIO_APIKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTIxMzQ2LCJleHAiOjE5MzkyMDEzNDZ9.tmQaj682pwzehpqlgCDMnySOqiUvpgRbrE43T4VJpDI";

const SIMKL_CLIENT_ID = "3de047451b8c6c8c1e53cd04599a45aa7c694f70bc31916683488ce6ba1a93d8";
const SIMKL_REDIRECT_URI = window.location.origin + window.location.pathname;

document.addEventListener('DOMContentLoaded', async () => {
  setupTheme();
  setupEventListeners();
  setupDragAndDrop();
  await handleSimklOAuthCallback();
  checkSimklAuthStatus();
  await loadData();
});

function setupTheme() {
  const savedTheme = localStorage.getItem('media_sync_theme') || 'kinetic';
  document.body.dataset.theme = savedTheme;
}

// IndexedDB Helpers
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MediaSyncDB', 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('mediaData')) {
        db.createObjectStore('mediaData');
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function getCachedData(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['mediaData'], 'readonly');
      const store = transaction.objectStore('mediaData');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('IndexedDB read failed:', e);
    return null;
  }
}

async function saveCachedData(key, data) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['mediaData'], 'readwrite');
      const store = transaction.objectStore('mediaData');
      const request = store.put(data, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.warn('IndexedDB write failed:', e);
  }
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  // Limit max visible toasts to 3
  const existing = container.querySelectorAll('.toast');
  if (existing.length >= 3) {
    existing[0].remove();
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;

  const dismiss = document.createElement('button');
  dismiss.className = 'toast-dismiss';
  dismiss.textContent = '\u00d7';
  dismiss.setAttribute('aria-label', 'Dismiss notification');
  dismiss.addEventListener('click', () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  });
  toast.appendChild(dismiss);

  container.appendChild(toast);
  
  // Trigger reflow
  toast.offsetHeight;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

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

  let isDemoData = (combinedUrl === defaultCombinedUrl);

  try {
    const cachedCombined = await getCachedData('combined');
    const cachedFlagged = await getCachedData('flagged');
    if (cachedCombined && cachedCombined.length > 0) {
      allItems = cachedCombined;
      console.log('Loaded combined data from IndexedDB cache');
    } else {
      const resCombined = await fetch(combinedUrl);
      if (resCombined.ok) {
        allItems = await resCombined.json();
        await saveCachedData('combined', allItems);
      }
    }
    
    if (cachedFlagged && cachedFlagged.length > 0) {
      flaggedItems = cachedFlagged;
    } else {
      const resFlagged = await fetch(flaggedUrl);
      if (resFlagged.ok) {
        flaggedItems = await resFlagged.json();
        await saveCachedData('flagged', flaggedItems);
      }
    }
  } catch (e) {
    console.warn("Failed to fetch custom URLs or local fallback:", e);
    if (!isDemoData) {
      alert("⚠️ Error loading custom Data Source URLs. Please check console or reset Data Source.");
    }
  }

  const demoBanner = document.getElementById('demo-banner');
  if (isDemoData && allItems.length > 0 && demoBanner) {
    demoBanner.classList.remove('hidden');
  } else if (demoBanner) {
    demoBanner.classList.add('hidden');
  }

  updateCounters();
  applyFilters();
}

function updateCounters() {
  const animeCount = allItems.filter(i => i.media_type === 'anime').length;
  const enrichCount = allItems.filter(i => i.media_type === 'anime' && (!i.ids || !i.ids.simkl)).length;
  const movieCount = allItems.filter(i => i.media_type === 'movie').length;
  const showCount = allItems.filter(i => i.media_type === 'show').length;

  document.getElementById('stat-total').textContent = allItems.length.toLocaleString();
  document.getElementById('stat-movies').textContent = movieCount.toLocaleString();
  document.getElementById('stat-shows').textContent = showCount.toLocaleString();
  document.getElementById('stat-anime').textContent = animeCount.toLocaleString();

  document.getElementById('count-all').textContent = allItems.length;
  document.getElementById('count-anime').textContent = animeCount;
  document.getElementById('count-movies').textContent = movieCount;
  document.getElementById('count-shows').textContent = showCount;
  document.getElementById('count-flagged').textContent = flaggedItems.length;
  
  const enrichEl = document.getElementById('count-enrich');
  if(enrichEl) enrichEl.textContent = enrichCount;
  
  // Update cloned marquee stats
  document.querySelectorAll('.clone-stat-total').forEach(el => el.textContent = allItems.length.toLocaleString());
  document.querySelectorAll('.clone-stat-movies').forEach(el => el.textContent = movieCount.toLocaleString());
  document.querySelectorAll('.clone-stat-shows').forEach(el => el.textContent = showCount.toLocaleString());
  document.querySelectorAll('.clone-stat-anime').forEach(el => el.textContent = animeCount.toLocaleString());
}

function setupEventListeners() {
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const current = document.body.dataset.theme;
      const next = current === 'kinetic' ? 'hand-drawn' : 'kinetic';
      document.body.dataset.theme = next;
      localStorage.setItem('media_sync_theme', next);
    });
  }

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentTab = e.target.getAttribute('data-tab');
      currentPage = 1;
      applyFilters();
    });
  });

  // Search & Filter Inputs
  document.getElementById('search-input').addEventListener('input', () => {
    currentPage = 1;
    applyFilters();
  });

  document.getElementById('source-filter').addEventListener('change', () => {
    currentPage = 1;
    applyFilters();
  });

  document.getElementById('sort-filter').addEventListener('change', () => {
    applyFilters();
  });

  // Pagination
  document.getElementById('btn-prev').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderGrid();
    }
  });

  document.getElementById('btn-next').addEventListener('click', () => {
    const totalPages = Math.ceil(filteredItems.length / pageSize);
    if (currentPage < totalPages) {
      currentPage++;
      renderGrid();
    }
  });

  // Export & Nuvio Modals
  const exportModal = document.getElementById('export-modal');
  document.getElementById('btn-export-all').addEventListener('click', () => {
    exportModal.classList.remove('hidden');
  });

  document.getElementById('modal-close').addEventListener('click', () => {
    exportModal.classList.add('hidden');
  });

  const nuvioModal = document.getElementById('nuvio-modal');
  document.getElementById('btn-quick-nuvio').addEventListener('click', () => {
    nuvioModal.classList.remove('hidden');
  });

  document.getElementById('nuvio-modal-close').addEventListener('click', () => {
    nuvioModal.classList.add('hidden');
  });

  // Copy Raw Watched Payload JSON (p_items)
  document.getElementById('btn-copy-nuvio-json').addEventListener('click', async () => {
    const watchedPayload = generateNuvioWatchedPayload();
    const jsonStr = JSON.stringify(watchedPayload, null, 2);
    try {
      await navigator.clipboard.writeText(jsonStr);
      const btn = document.getElementById('btn-copy-nuvio-json');
      const origText = btn.innerHTML;
      btn.innerHTML = '&#10004; Copied p_items JSON to Clipboard!';
      btn.style.background = 'var(--primary-blue)';
      setTimeout(() => {
        btn.innerHTML = origText;
        btn.style.background = '';
      }, 2500);
    } catch (e) {
      alert('Copied! p_items JSON generated with ' + watchedPayload.p_items.length + ' items.');
    }
  });

  // Direct Sync Watched Items to Nuvio API
  document.getElementById('btn-run-nuvio-sync').addEventListener('click', async () => {
    await runNuvioDirectSync();
  });

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

  // Simkl OAuth Modals & Controls
  const simklModal = document.getElementById('simkl-oauth-modal');
  const btnSimklOAuthHeader = document.getElementById('btn-simkl-oauth');
  if (btnSimklOAuthHeader) {
    btnSimklOAuthHeader.addEventListener('click', () => {
      simklModal.classList.remove('hidden');
    });
  }

  const simklCloseBtn = document.getElementById('simkl-oauth-modal-close');
  if (simklCloseBtn) {
    simklCloseBtn.addEventListener('click', () => {
      simklModal.classList.add('hidden');
    });
  }

  const exportGuideModal = document.getElementById('export-guide-modal');
  const exportGuideCloseBtn = document.getElementById('export-guide-modal-close');
  if (exportGuideCloseBtn) {
    exportGuideCloseBtn.addEventListener('click', () => {
      exportGuideModal.classList.add('hidden');
    });
  }

  const btnSimklLogin = document.getElementById('btn-simkl-login');
  if (btnSimklLogin) {
    btnSimklLogin.addEventListener('click', () => initiateSimklOAuth());
  }

  const btnSimklLogout = document.getElementById('btn-simkl-logout');
  if (btnSimklLogout) {
    btnSimklLogout.addEventListener('click', () => logoutSimkl());
  }

  const btnSimklPull = document.getElementById('btn-simkl-pull');
  if (btnSimklPull) {
    btnSimklPull.addEventListener('click', () => runSimklPullSync());
  }

  const btnSimklPush = document.getElementById('btn-simkl-push');
  if (btnSimklPush) {
    btnSimklPush.addEventListener('click', () => runSimklPushSync());
  }

  // Global Keyboard / Escape Key Listener for Modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(modal => modal.classList.add('hidden'));
    }
  });

  const btnEnrich = document.getElementById('btn-trigger-enrich');
  if (btnEnrich) {
    btnEnrich.addEventListener('click', async () => {
      btnEnrich.disabled = true;
      btnEnrich.textContent = "⏳ Fetching Otaku Mappings...";
      try {
        const response = await fetch('https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json');
        if (!response.ok) throw new Error('Failed to fetch anime mappings');
        const mappings = await response.json();
        
        let enrichCount = 0;
        
        allItems.forEach(item => {
          if (item.media_type === 'anime' && (!item.ids || !item.ids.simkl)) {
            const match = mappings.find(m => {
              if (item.ids) {
                if (item.ids.mal && String(m.mal_id) === String(item.ids.mal)) return true;
                if (item.ids.kitsu && String(m.kitsu_id) === String(item.ids.kitsu)) return true;
                if (item.ids.anilist && String(m.anilist_id) === String(item.ids.anilist)) return true;
                if (item.ids.imdb && String(m.imdb_id) === String(item.ids.imdb)) return true;
                if (item.ids.tvdb && String(m.thetvdb_id) === String(item.ids.tvdb)) return true;
              }
              return false;
            });
            
            if (match && match.simkl_id) {
              if (!item.ids) item.ids = {};
              item.ids.simkl = match.simkl_id;
              item.sources = { ...item.sources, simkl: true };
              enrichCount++;
            }
          }
        });
        
        await saveCachedData('combined', allItems);
        updateCounters();
        applyFilters();
        showToast(`✨ Successfully enriched ${enrichCount} anime items with Simkl mappings!`);
      } catch (err) {
        console.error('Enrichment error:', err);
        showToast('❌ Error running anime enrichment. Check console.');
      } finally {
        btnEnrich.disabled = false;
        btnEnrich.textContent = "✨ Run Anime Enrichment";
      }
    });
  }
}

function parseNuvioAuth(inputStr) {
  let bearerToken = "";
  let apiKey = DEFAULT_NUVIO_APIKEY;

  if (!inputStr) return { bearerToken: "", apiKey };

  // Parse cURL header lines if user pasted full cURL
  const authMatch = inputStr.match(/authorization:\s*Bearer\s+([A-Za-z0-9._\-\+]+)/i) || inputStr.match(/Bearer\s+([A-Za-z0-9._\-\+]+)/i);
  if (authMatch) {
    bearerToken = authMatch[1];
  } else if (inputStr.trim().startsWith("eyJ")) {
    bearerToken = inputStr.trim();
  }

  const apiMatch = inputStr.match(/apikey:\s*([A-Za-z0-9._\-\+]+)/i);
  if (apiMatch) {
    apiKey = apiMatch[1];
  }

  return { bearerToken, apiKey };
}

function generateNuvioWatchedPayload() {
  const pItems = [];
  const profileId = parseInt(document.getElementById('nuvio-profile-id').value) || 1;

  allItems.forEach(item => {
    const ids = item.ids || {};
    const contentId = ids.imdb || ids.tmdb || ids.tvdb || ids.trakt || item.title;
    const isSeries = item.media_type === 'show' || item.media_type === 'anime';
    const contentType = isSeries ? 'series' : 'movie';
    const nowMs = Date.now();

    if (contentType === 'series') {
      if (item.episodes && item.episodes.length > 0) {
        item.episodes.forEach(ep => {
          pItems.push({
            content_id: String(contentId),
            content_type: 'series',
            title: item.title,
            season: ep.season || 1,
            episode: ep.episode || 1,
            watched_at: ep.watched_at ? new Date(ep.watched_at).getTime() : nowMs,
            ids: ids
          });
        });
      } else {
        pItems.push({
          content_id: String(contentId),
          content_type: 'series',
          title: item.title,
          season: 1,
          episode: 1,
          watched_at: nowMs,
          ids: ids
        });
      }
    } else {
      pItems.push({
        content_id: String(contentId),
        content_type: 'movie',
        title: item.title,
        season: null,
        episode: null,
        watched_at: nowMs,
        ids: ids
      });
    }

  });

  return {
    p_items: pItems,
    p_profile_id: profileId
  };
}

async function runNuvioDirectSync() {
  const tokenInput = document.getElementById('nuvio-token-input').value.trim();
  const { bearerToken, apiKey } = parseNuvioAuth(tokenInput);

  if (!bearerToken) {
    alert("Please paste your Nuvio Authorization Token (eyJ...) or cURL command from your Nuvio session into Step 1.");
    return;
  }

  const payload = generateNuvioWatchedPayload();
  const totalItems = payload.p_items.length;
  const profileId = payload.p_profile_id;
  const batchSize = 100;
  const totalBatches = Math.ceil(totalItems / batchSize);

  const progressContainer = document.getElementById('nuvio-sync-progress');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const syncStatusText = document.getElementById('sync-status-text');

  progressContainer.classList.remove('hidden');
  syncStatusText.style.color = 'var(--primary-blue)';

  const btnSync = document.getElementById('btn-run-nuvio-sync');
  btnSync.disabled = true;

  try {
    for (let b = 0; b < totalBatches; b++) {
      const start = b * batchSize;
      const batchItems = payload.p_items.slice(start, start + batchSize);
      const percent = Math.round(((b + 1) / totalBatches) * 100);

      syncStatusText.textContent = `Syncing items ${start + 1} to ${Math.min(start + batchSize, totalItems)} of ${totalItems} (${percent}%)...`;
      progressBarFill.style.width = `${percent}%`;

      const response = await fetch('https://api.nuvio.tv/rest/v1/rpc/sync_push_watched_items', {
        method: 'POST',
        headers: {
          'accept': '*/*',
          'apikey': apiKey,
          'authorization': `Bearer ${bearerToken}`,
          'content-type': 'application/json',
          'x-client-info': 'NuvioWebsite/1.4.23'
        },
        body: JSON.stringify({
          p_items: batchItems,
          p_profile_id: profileId
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Nuvio API HTTP ${response.status}: ${errText}`);
      }

      // Short delay between batches
      await new Promise(r => setTimeout(r, 200));
    }

    syncStatusText.textContent = `🎉 Success! Imported all ${totalItems} watched items directly to Nuvio!`;
    progressBarFill.style.width = "100%";
  } catch (err) {
    console.error("Nuvio API Sync Error:", err);
    syncStatusText.style.color = 'var(--primary-red)';
    syncStatusText.textContent = `Sync Error: ${err.message}`;
  } finally {
    btnSync.disabled = false;
  }
}

function setupDragAndDrop() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadedFiles(e.dataTransfer.files);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUploadedFiles(e.target.files);
    }
  });
}

async function handleUploadedFiles(files) {
  const dropText = document.querySelector('.drop-text h3');
  dropText.textContent = `Processing ${files.length} file(s)...`;
  
  let newItems = [];
  let traktFiles = { watched_shows: [], watched_movies: [], ratings_shows: [], ratings_movies: [], ratings_episodes: [], history_shows: [], history_movies: [], generic: [] };

  for (let file of files) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.zip')) {
      try {
        const zip = await JSZip.loadAsync(file);
        for (const [filename, zipEntry] of Object.entries(zip.files)) {
          const entryLower = filename.toLowerCase();
          if (!zipEntry.dir && (entryLower.endsWith('.csv') || entryLower.endsWith('.xml') || entryLower.endsWith('.json'))) {
            const content = await zipEntry.async("string");
            classifyAndCollectFile(filename, content, traktFiles, newItems);
          }
        }
      } catch (e) {
        console.error("ZIP parsing error", e);
      }
    } else if (lowerName.endsWith('.csv') || lowerName.endsWith('.xml') || lowerName.endsWith('.json')) {
      const content = await file.text();
      classifyAndCollectFile(file.name, content, traktFiles, newItems);
    }
  }

  // Process gathered Trakt multi-CSV groups if present
  const traktCombined = processTraktMultiFileGroup(traktFiles);
  newItems = newItems.concat(traktCombined);

  if (newItems.length > 0) {
    dropText.textContent = `Extracted ${newItems.length} media items with episode & rating history. Merging...`;
    await mergeNewItems(newItems);
    dropText.textContent = `Successfully merged into library! Total items: ${allItems.length}`;
  } else {
    dropText.textContent = `No valid media items found in uploaded files.`;
  }

  showToast(`Merged ${newItems.length} items with episode logs & ratings intact.`);
}

function classifyAndCollectFile(filename, content, traktFiles, newItems) {
  const lower = filename.toLowerCase();
  if (lower.includes('watched_shows')) {
    traktFiles.watched_shows.push({ filename, content });
  } else if (lower.includes('watched_movies')) {
    traktFiles.watched_movies.push({ filename, content });
  } else if (lower.includes('ratings_shows') || lower.includes('ratings_show')) {
    traktFiles.ratings_shows.push({ filename, content });
  } else if (lower.includes('ratings_movies') || lower.includes('ratings_movie')) {
    traktFiles.ratings_movies.push({ filename, content });
  } else if (lower.includes('ratings_episodes') || lower.includes('ratings_episode')) {
    traktFiles.ratings_episodes.push({ filename, content });
  } else if (lower.includes('history_shows') || lower.includes('history_show')) {
    traktFiles.history_shows.push({ filename, content });
  } else if (lower.includes('history_movies') || lower.includes('history_movie')) {
    traktFiles.history_movies.push({ filename, content });
  } else {
    const parsed = parseFileContent(filename, content);
    if (parsed && parsed.length > 0) {
      newItems.push(...parsed);
    }
  }
}

function processTraktMultiFileGroup(traktFiles) {
  const showMap = new Map();

  // Helper to get or create a show entry
  function getShow(title, year, ids) {
    const key = (ids.imdb || ids.tmdb || ids.tvdb || ids.trakt || title).toString().toLowerCase();
    if (!showMap.has(key)) {
      showMap.set(key, {
        title: title,
        year: year ? parseInt(year) : null,
        media_type: 'show',
        sources: { trakt: true },
        ids: { ...ids },
        user_rating: null,
        aggregated_rating: null,
        episodes: [],
        history: []
      });
    }
    const show = showMap.get(key);
    show.ids = { ...show.ids, ...ids };
    return show;
  }

  // Parse watched shows CSV
  traktFiles.watched_shows.forEach(f => {
    const rows = parseCSVToObjects(f.content);
    rows.forEach(r => {
      const title = r.show_title || r.title || r.Show || r.Title;
      if (!title) return;
      const ids = { imdb: r.imdb_id, tmdb: r.tmdb_id, tvdb: r.tvdb_id, trakt: r.trakt_id };
      const show = getShow(title, r.show_year || r.year, ids);
      const s = parseInt(r.season) || 1;
      const e = parseInt(r.episode || r.number) || 1;
      show.episodes.push({ season: s, episode: e, watched_at: r.watched_at || r.last_watched_at });
    });
  });

  // Parse history shows CSV
  traktFiles.history_shows.forEach(f => {
    const rows = parseCSVToObjects(f.content);
    rows.forEach(r => {
      const title = r.show_title || r.title;
      if (!title) return;
      const ids = { imdb: r.imdb_id, tmdb: r.tmdb_id, tvdb: r.tvdb_id, trakt: r.trakt_id };
      const show = getShow(title, r.show_year || r.year, ids);
      const s = parseInt(r.season) || 1;
      const e = parseInt(r.episode) || 1;
      show.episodes.push({ season: s, episode: e, watched_at: r.watched_at });
    });
  });

  // Parse show ratings CSV
  traktFiles.ratings_shows.forEach(f => {
    const rows = parseCSVToObjects(f.content);
    rows.forEach(r => {
      const title = r.title || r.show_title;
      if (!title) return;
      const ids = { imdb: r.imdb_id, tmdb: r.tmdb_id, tvdb: r.tvdb_id, trakt: r.trakt_id };
      const show = getShow(title, r.year || r.show_year, ids);
      const rating = parseFloat(r.rating || r.user_rating);
      if (rating > 0) {
        show.user_rating = rating;
        show.aggregated_rating = rating;
      }
    });
  });

  const results = Array.from(showMap.values());

  // Parse movie watched CSV
  traktFiles.watched_movies.forEach(f => {
    const rows = parseCSVToObjects(f.content);
    rows.forEach(r => {
      const title = r.title || r.Movie;
      if (!title) return;
      results.push({
        title: title,
        year: parseInt(r.year) || null,
        media_type: 'movie',
        sources: { trakt: true },
        ids: { imdb: r.imdb_id, tmdb: r.tmdb_id, trakt: r.trakt_id },
        watched_at: r.watched_at || r.last_watched_at
      });
    });
  });

  // Parse movie ratings CSV
  traktFiles.ratings_movies.forEach(f => {
    const rows = parseCSVToObjects(f.content);
    rows.forEach(r => {
      const title = r.title || r.Movie;
      if (!title) return;
      const rating = parseFloat(r.rating || r.user_rating);
      results.push({
        title: title,
        year: parseInt(r.year) || null,
        media_type: 'movie',
        sources: { trakt: true },
        ids: { imdb: r.imdb_id, tmdb: r.tmdb_id, trakt: r.trakt_id },
        user_rating: rating > 0 ? rating : null,
        aggregated_rating: rating > 0 ? rating : null
      });
    });
  });

  return results;
}

function parseCSVToObjects(content) {
  if (typeof Papa === 'undefined') return [];
  const res = Papa.parse(content, { header: true, skipEmptyLines: true });
  return res.data || [];
}

function parseFileContent(filename, content) {
  const lowerName = filename.toLowerCase();
  let parsedItems = [];
  
  try {
    if (lowerName.endsWith('.csv')) {
      parsedItems = parseSimklCSV(content);
    } else if (lowerName.endsWith('.xml')) {
      parsedItems = parseMalXML(content);
    } else if (lowerName.endsWith('.json')) {
      parsedItems = parseJson(content);
    }
  } catch(e) {
    console.error(`Error parsing ${filename}:`, e);
  }
  
  return parsedItems;
}

function parseSimklCSV(content) {
  if (typeof Papa === 'undefined') return [];
  const results = Papa.parse(content, { header: true, skipEmptyLines: true });
  return results.data.map(row => {
    let type = 'movie';
    const rawType = strVal(row.Type || row.type || row.Watchlist);
    if (rawType.includes('anime')) type = 'anime';
    else if (rawType.includes('tv') || rawType.includes('show') || rawType.includes('series')) type = 'show';
    
    const userRating = parseRating(row['My Rating'] || row.Rating || row.Score);
    const lastEpStr = strVal(row.LastEpWatched || row['Watched Episodes'] || row['Last Ep Watched']);
    const status = parseStatus(row.Watchlist || row.Status);

    let episodes = [];
    if (lastEpStr) {
      const epMatch = lastEpStr.match(/S(\d+)E(\d+)/i) || lastEpStr.match(/e(\d+)/i);
      if (epMatch) {
        const s = epMatch[2] ? parseInt(epMatch[1]) : 1;
        const e = epMatch[2] ? parseInt(epMatch[2]) : parseInt(epMatch[1]);
        episodes.push({ season: s, episode: e, watched_at: row.WatchedDate || row['Watched Date'] });
      }
    }

    return {
      title: row.Title || row.title,
      year: parseInt(row.Year) || null,
      media_type: type,
      status: status,
      user_rating: userRating,
      aggregated_rating: userRating,
      last_watched_at: row.WatchedDate || row['Watched Date'] || null,
      episodes: episodes,
      sources: { simkl: true },
      ids: {
        imdb: row['IMDB ID'] || row.IMDB || null,
        tmdb: row['TMDB ID'] || row.TMDB || null,
        tvdb: row['TVDB ID'] || row.TVDB || null,
        simkl: row['SIMKL_ID'] || row['Simkl ID'] || null
      }
    };
  });
}

function parseMalXML(content) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(content, "text/xml");
  const animeNodes = xmlDoc.getElementsByTagName("anime");
  const items = [];
  
  for (let i = 0; i < animeNodes.length; i++) {
    const node = animeNodes[i];
    const titleNode = node.getElementsByTagName("series_title")[0];
    const idNode = node.getElementsByTagName("series_animedb_id")[0];
    const scoreNode = node.getElementsByTagName("my_score")[0];
    const statusNode = node.getElementsByTagName("my_status")[0];
    const watchedEpNode = node.getElementsByTagName("my_watched_episodes")[0];
    const finishDateNode = node.getElementsByTagName("my_finish_date")[0];
    
    if (titleNode && idNode) {
      const score = parseRating(scoreNode ? scoreNode.textContent : null);
      const status = parseStatus(statusNode ? statusNode.textContent : null);
      const epCount = parseInt(watchedEpNode ? watchedEpNode.textContent : 0) || 0;
      const finishDate = finishDateNode && finishDateNode.textContent !== '0000-00-00' ? finishDateNode.textContent : null;

      let episodes = [];
      if (epCount > 0) {
        for (let ep = 1; ep <= Math.min(epCount, 100); ep++) {
          episodes.push({ season: 1, episode: ep, watched_at: finishDate });
        }
      }

      items.push({
        title: titleNode.textContent,
        year: null,
        media_type: 'anime',
        status: status,
        user_rating: score,
        aggregated_rating: score,
        last_watched_at: finishDate,
        episodes: episodes,
        sources: { mal: true },
        ids: {
          mal: parseInt(idNode.textContent)
        }
      });
    }
  }
  return items;
}

function parseJson(content) {
  const data = JSON.parse(content);
  const items = [];
  
  if (Array.isArray(data)) {
    data.forEach(entry => {
      let mediaItem = entry.movie || entry.show || entry;
      if (mediaItem && mediaItem.title) {
        let type = entry.movie ? 'movie' : (entry.show ? 'show' : 'movie');
        if (!entry.movie && !entry.show && entry.type) type = entry.type;
        const rating = parseRating(entry.rating || entry.user_rating || mediaItem.rating);

        let episodes = [];
        if (entry.episode) {
          episodes.push({
            season: entry.episode.season || 1,
            episode: entry.episode.number || 1,
            watched_at: entry.watched_at || entry.last_watched_at
          });
        }
        
        items.push({
          title: mediaItem.title,
          year: mediaItem.year,
          media_type: type,
          user_rating: rating,
          aggregated_rating: rating,
          last_watched_at: entry.watched_at || entry.last_watched_at || null,
          episodes: episodes,
          sources: { trakt: true },
          ids: mediaItem.ids || {}
        });
      }
    });
  } else if (data.p_items) {
    data.p_items.forEach(item => {
      let episodes = [];
      if (item.season && item.episode) {
        episodes.push({ season: item.season, episode: item.episode, watched_at: item.watched_at });
      }

      items.push({
        title: item.title,
        year: null,
        media_type: item.content_type === 'series' ? 'show' : 'movie',
        user_rating: item.user_rating || null,
        aggregated_rating: item.user_rating || null,
        episodes: episodes,
        sources: { nuvio: true },
        ids: item.ids || {}
      });
    });
  }
  
  return items;
}

function parseRating(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(val);
  return (num > 0 && num <= 10) ? num : null;
}

function parseStatus(val) {
  if (!val) return 'completed';
  const str = String(val).toLowerCase();
  if (str.includes('watching') || str === '1') return 'watching';
  if (str.includes('plan') || str.includes('plantowatch') || str === '6') return 'plan_to_watch';
  if (str.includes('hold') || str === '3') return 'on_hold';
  if (str.includes('drop') || str === '4') return 'dropped';
  return 'completed';
}

function strVal(val) {
  if (val === null || val === undefined) return '';
  return String(val).toLowerCase();
}

async function mergeNewItems(newItems) {
  newItems.forEach(newItem => {
    let existingItem = null;
    
    for (const item of allItems) {
      const matchFound = ['imdb', 'tmdb', 'tvdb', 'mal', 'simkl', 'trakt'].some(idType => {
        return newItem.ids && newItem.ids[idType] && item.ids && item.ids[idType] && 
               String(newItem.ids[idType]) === String(item.ids[idType]);
      });
      if (matchFound) {
        existingItem = item;
        break;
      }
    }
    
    if (!existingItem && newItem.title) {
      existingItem = allItems.find(item => {
        if (!item.title || item.title.toLowerCase() !== newItem.title.toLowerCase()) return false;
        if (item.media_type !== newItem.media_type) return false;
        if (item.year && newItem.year) return item.year === newItem.year;
        return true;
      });
    }
    
    if (existingItem) {
      existingItem.sources = { ...existingItem.sources, ...newItem.sources };
      existingItem.ids = { ...newItem.ids, ...existingItem.ids };
      if (!existingItem.year && newItem.year) existingItem.year = newItem.year;
      if (newItem.media_type === 'anime' && existingItem.media_type !== 'anime') {
        existingItem.media_type = 'anime';
      }

      // Merge user rating
      if (!existingItem.user_rating && newItem.user_rating) {
        existingItem.user_rating = newItem.user_rating;
        existingItem.aggregated_rating = newItem.user_rating;
      } else if (newItem.user_rating && existingItem.user_rating) {
        existingItem.aggregated_rating = Math.max(existingItem.user_rating, newItem.user_rating);
      }

      // Merge episode watch history
      if (newItem.episodes && newItem.episodes.length > 0) {
        if (!existingItem.episodes) existingItem.episodes = [];
        newItem.episodes.forEach(newEp => {
          const exists = existingItem.episodes.some(e => e.season === newEp.season && e.episode === newEp.episode);
          if (!exists) {
            existingItem.episodes.push(newEp);
          }
        });
      }

      // Merge status & dates
      if (!existingItem.status && newItem.status) existingItem.status = newItem.status;
      if (!existingItem.last_watched_at && newItem.last_watched_at) existingItem.last_watched_at = newItem.last_watched_at;
    } else {
      if (!newItem.episodes) newItem.episodes = [];
      allItems.push(newItem);
    }
  });
  
  await saveCachedData('combined', allItems);
  updateCounters();
  applyFilters();
}

function applyFilters() {
  const searchInput = document.getElementById('search-input');
  const search = searchInput.value ? searchInput.value.toLowerCase().trim() : '';
  const sourceFilter = document.getElementById('source-filter').value;
  const sortFilter = document.getElementById('sort-filter').value;

  const btnEnrich = document.getElementById('btn-trigger-enrich');
  if (btnEnrich) {
    if (currentTab === 'enrich') {
      btnEnrich.classList.remove('hidden');
    } else {
      btnEnrich.classList.add('hidden');
    }
  }

  if (currentTab === 'flagged') {
    filteredItems = flaggedItems.filter(f => {
      if (!search) return true;
      const t1 = (f.item1_title || '').toLowerCase();
      const t2 = (f.item2_title || '').toLowerCase();
      return t1.includes(search) || t2.includes(search);
    });
  } else if (currentTab === 'enrich') {
    filteredItems = allItems.filter(item => {
      if (item.media_type !== 'anime') return false;
      if (item.ids && item.ids.simkl) return false;
      
      if (sourceFilter !== 'all' && !item.sources[sourceFilter]) return false;
      if (search) {
        const titleMatch = (item.title || '').toLowerCase().includes(search) || (item.title_original || '').toLowerCase().includes(search);
        const ids = item.ids || {};
        const idMatch = Object.values(ids).some(val => val && String(val).toLowerCase().includes(search));
        if (!titleMatch && !idMatch) return false;
      }
      return true;
    });
  } else {
    filteredItems = allItems.filter(item => {
      if (currentTab !== 'all' && item.media_type !== currentTab.replace(/s$/, '')) {
        return false;
      }

      if (sourceFilter !== 'all' && !item.sources[sourceFilter]) {
        return false;
      }

      if (search) {
        const titleMatch = (item.title || '').toLowerCase().includes(search) || (item.title_original || '').toLowerCase().includes(search);
        const ids = item.ids || {};
        const idMatch = Object.values(ids).some(val => val && String(val).toLowerCase().includes(search));
        if (!titleMatch && !idMatch) return false;
      }

      return true;
    });

    filteredItems.sort((a, b) => {
      if (sortFilter === 'title-asc') {
        return (a.title || '').localeCompare(b.title || '');
      } else if (sortFilter === 'rating-desc') {
        return (b.aggregated_rating || 0) - (a.aggregated_rating || 0);
      } else if (sortFilter === 'year-desc') {
        return (b.year || 0) - (a.year || 0);
      }
      return 0;
    });
  }

  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById('media-grid');
  grid.innerHTML = '';

  if (allItems.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-muted); border: 2px dashed rgba(255,255,255,0.1); border-radius: var(--radius-lg);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">📦</div>
        <h3 style="font-family: 'Outfit', sans-serif;">No media data loaded</h3>
        <p style="margin-top: 0.5rem;">Drop your export file above or configure a Data Source.</p>
      </div>
    `;
    document.getElementById('pagination-controls').style.display = 'none';
    return;
  }

  if (filteredItems.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-muted);">
        <h3>No media items match your search.</h3>
      </div>
    `;
    document.getElementById('pagination-controls').style.display = 'none';
    return;
  }

  document.getElementById('pagination-controls').style.display = 'flex';
  const totalPages = Math.ceil(filteredItems.length / pageSize);
  document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages || 1}`;

  const startIdx = (currentPage - 1) * pageSize;
  const pageItems = filteredItems.slice(startIdx, startIdx + pageSize);

  pageItems.forEach(item => {
    if (currentTab === 'flagged') {
      const absIndex = flaggedItems.indexOf(item);
      const card = document.createElement('div');
      card.className = 'media-card';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.innerHTML = `
        <div class="card-header">
          <span class="type-badge badge-anime" style="background: var(--primary-yellow); color: #000;">⚠️ Conflict</span>
        </div>
        <div style="flex-grow: 1;">
          <h4 class="media-title" style="font-size: 0.95rem;">${escapeHtml(item.item1_title || 'Item 1')}</h4>
          <p style="font-size: 0.7rem; background: var(--black); color: var(--primary-yellow); margin: 0.25rem 0; font-weight: bold; display: inline-block; padding: 0.1rem 0.5rem;">VS</p>
          <h4 class="media-title" style="font-size: 0.95rem;">${escapeHtml(item.item2_title || 'Item 2')}</h4>
          <p class="media-year" style="margin-top: 0.5rem; font-size: 0.8rem; line-height: 1.2;">Reason: ${escapeHtml(item.reason)}</p>
        </div>
        <div class="reconciliation-actions" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-top: 1rem;">
          <button class="btn btn-secondary" style="padding: 0.4rem; font-size: 0.75rem;" onclick="handleReconciliation('keep1', ${absIndex})">Keep 1</button>
          <button class="btn btn-secondary" style="padding: 0.4rem; font-size: 0.75rem;" onclick="handleReconciliation('keep2', ${absIndex})">Keep 2</button>
          <button class="btn btn-action" style="padding: 0.4rem; font-size: 0.75rem;" onclick="handleReconciliation('merge', ${absIndex})">Merge</button>
          <button class="btn btn-secondary" style="padding: 0.4rem; font-size: 0.75rem; background: rgba(255,255,255,0.05);" onclick="handleReconciliation('skip', ${absIndex})">Skip</button>
        </div>
      `;
      grid.appendChild(card);
    } else {
      const card = document.createElement('div');
      card.className = 'media-card';
      const mtype = escapeHtml(item.media_type || 'movie');
      const badgeClass = (item.media_type || 'movie') === 'anime' ? 'badge-anime' : ((item.media_type || 'movie') === 'show' ? 'badge-show' : 'badge-movie');
      const ratingText = item.aggregated_rating ? `★ ${escapeHtml(String(item.aggregated_rating))}/10` : (item.user_rating ? `★ ${escapeHtml(String(item.user_rating))}/10` : 'Unrated');
      const statusText = item.status ? escapeHtml(String(item.status).replace(/_/g, ' ')) : 'completed';
      const statusClass = `status-${escapeHtml(String(item.status || 'completed').toLowerCase().replace(/ /g, '_'))}`;
      const ids = item.ids || {};

      let epCountText = '';
      if (item.episodes && item.episodes.length > 0) {
        epCountText = `<span class="episode-progress">📺 ${item.episodes.length} EP${item.episodes.length > 1 ? 's' : ''} Watched</span>`;
      }

      card.innerHTML = `
        <div>
          <div class="card-header">
            <span class="type-badge ${badgeClass}">${mtype}</span>
            <span class="badge-status ${statusClass}">${statusText}</span>
            <span class="badge-rating">${ratingText}</span>
          </div>
          <h3 class="media-title" style="margin-top: 0.75rem;">${escapeHtml(item.title)}</h3>
          ${item.year ? `<p class="media-year">${item.year}</p>` : ''}
          ${epCountText}
        </div>

        <div class="id-pills" style="margin-top: 0.75rem;">
          ${ids.imdb ? `<span class="id-pill has-val">IMDB: ${escapeHtml(String(ids.imdb))}</span>` : ''}
          ${ids.tmdb ? `<span class="id-pill has-val">TMDB: ${escapeHtml(String(ids.tmdb))}</span>` : ''}
          ${ids.tvdb ? `<span class="id-pill has-val">TVDB: ${escapeHtml(String(ids.tvdb))}</span>` : ''}
          ${ids.mal ? `<span class="id-pill has-val">MAL: ${escapeHtml(String(ids.mal))}</span>` : ''}
          ${ids.kitsu ? `<span class="id-pill has-val">Kitsu: ${escapeHtml(String(ids.kitsu))}</span>` : ''}
          ${ids.simkl ? `<span class="id-pill has-val">Simkl: ${escapeHtml(String(ids.simkl))}</span>` : ''}
        </div>
      `;
      grid.appendChild(card);
    }
  });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.handleReconciliation = function(action, index) {
  const item = flaggedItems[index];
  console.log(`Reconciliation action: ${action} on item`, item);
  
  flaggedItems.splice(index, 1);
  applyFilters();
  updateCounters();
};

/* ==========================================================================
   SIMKL PKCE OAUTH & 2-PHASE SYNC ENGINE
   ========================================================================== */

function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function initiateSimklOAuth() {
  try {
    const codeVerifier = generateRandomString(64);
    sessionStorage.setItem('simkl_code_verifier', codeVerifier);

    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const redirectUri = encodeURIComponent(SIMKL_REDIRECT_URI);
    
    const authUrl = `https://simkl.com/oauth/authorize?response_type=code&client_id=${SIMKL_CLIENT_ID}&redirect_uri=${redirectUri}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
    
    showToast("🔑 Redirecting to Simkl for PKCE OAuth...");
    window.location.href = authUrl;
  } catch (err) {
    console.error("Simkl OAuth Error:", err);
    alert("OAuth Error: " + err.message);
  }
}

async function handleSimklOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  if (!code) return;

  const codeVerifier = sessionStorage.getItem('simkl_code_verifier');
  if (!codeVerifier) {
    console.warn("Simkl OAuth callback missing code_verifier");
    return;
  }

  showToast("⏳ Exchanging Simkl Authorization Code...");

  try {
    const response = await fetch('https://api.simkl.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        client_id: SIMKL_CLIENT_ID,
        code_verifier: codeVerifier,
        redirect_uri: SIMKL_REDIRECT_URI
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Token endpoint HTTP ${response.status}: ${err}`);
    }

    const data = await response.json();
    if (data.access_token) {
      localStorage.setItem('simkl_access_token', data.access_token);
      sessionStorage.removeItem('simkl_code_verifier');
      
      // Clean query parameters from URL cleanly
      const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({ path: cleanUrl }, '', cleanUrl);

      showToast("🎉 Simkl Account Connected via PKCE OAuth!");
      checkSimklAuthStatus();
      
      // Trigger initial pull sync automatically
      await runSimklPullSync();
    }
  } catch (err) {
    console.error("Simkl Token Exchange Error:", err);
    showToast("❌ Simkl OAuth Error: " + err.message);
  }
}

function checkSimklAuthStatus() {
  const token = localStorage.getItem('simkl_access_token');
  const badge = document.getElementById('simkl-status-badge');
  const desc = document.getElementById('simkl-status-desc');
  const btnLogin = document.getElementById('btn-simkl-login');
  const btnLogout = document.getElementById('btn-simkl-logout');
  const syncOpts = document.getElementById('simkl-sync-options');
  const headerBtn = document.getElementById('btn-simkl-oauth');

  if (token) {
    if (badge) {
      badge.textContent = "Connected ✔";
      badge.style.background = "#10B981";
      badge.style.color = "#fff";
    }
    if (desc) desc.textContent = "Authenticated with Simkl. Ready to sync history & ratings.";
    if (btnLogin) btnLogin.classList.add('hidden');
    if (btnLogout) btnLogout.classList.remove('hidden');
    if (syncOpts) syncOpts.classList.remove('hidden');
    if (headerBtn) {
      headerBtn.innerHTML = "⚡ Simkl Connected ✔";
      headerBtn.style.background = "#10B981";
      headerBtn.style.color = "#fff";
    }
  } else {
    if (badge) {
      badge.textContent = "Not Connected";
      badge.style.background = "var(--black)";
      badge.style.color = "var(--white)";
    }
    if (desc) desc.textContent = "Authenticate with Simkl via secure 1-click OAuth PKCE.";
    if (btnLogin) btnLogin.classList.remove('hidden');
    if (btnLogout) btnLogout.classList.add('hidden');
    if (syncOpts) syncOpts.classList.add('hidden');
    if (headerBtn) {
      headerBtn.innerHTML = "⚡ Connect Simkl (PKCE)";
      headerBtn.style.background = "var(--primary-yellow)";
      headerBtn.style.color = "var(--black)";
    }
  }
}

function logoutSimkl() {
  localStorage.removeItem('simkl_access_token');
  localStorage.removeItem('simkl_last_activity_date');
  checkSimklAuthStatus();
  showToast("Simkl account disconnected.");
}

async function runSimklPullSync() {
  const token = localStorage.getItem('simkl_access_token');
  if (!token) {
    alert("Please login with Simkl first.");
    return;
  }

  const progressContainer = document.getElementById('simkl-sync-progress');
  const fill = document.getElementById('simkl-progress-fill');
  const statusText = document.getElementById('simkl-sync-status-text');

  if (progressContainer) progressContainer.classList.remove('hidden');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'simkl-api-key': SIMKL_CLIENT_ID,
    'Content-Type': 'application/json'
  };

  const lastActivityDate = localStorage.getItem('simkl_last_activity_date');
  let pulledItems = [];

  try {
    if (lastActivityDate) {
      // Phase 2: Delta Sync
      statusText.textContent = `Fetching Simkl updates since ${lastActivityDate} (Phase 2 Delta)...`;
      fill.style.width = "40%";

      const res = await fetch(`https://api.simkl.com/sync/all-items/?date_from=${encodeURIComponent(lastActivityDate)}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      pulledItems = processSimklApiResponse(data);
      fill.style.width = "80%";
    } else {
      // Phase 1: Sequential Sync (shows -> movies -> anime)
      statusText.textContent = "Phase 1 Initial Sync: Fetching Simkl Shows...";
      fill.style.width = "20%";

      const resShows = await fetch('https://api.simkl.com/sync/shows', { headers });
      const showsData = resShows.ok ? await resShows.json() : {};
      await new Promise(r => setTimeout(r, 400)); // Delay between requests per guidelines

      statusText.textContent = "Phase 1 Initial Sync: Fetching Simkl Movies...";
      fill.style.width = "50%";
      const resMovies = await fetch('https://api.simkl.com/sync/movies', { headers });
      const moviesData = resMovies.ok ? await resMovies.json() : {};
      await new Promise(r => setTimeout(r, 400));

      statusText.textContent = "Phase 1 Initial Sync: Fetching Simkl Anime...";
      fill.style.width = "80%";
      const resAnime = await fetch('https://api.simkl.com/sync/anime', { headers });
      const animeData = resAnime.ok ? await resAnime.json() : {};

      pulledItems = processSimklApiResponse({ shows: showsData.shows || showsData, movies: moviesData.movies || moviesData, anime: animeData.anime || animeData });
    }

    // Fetch activities to record latest date
    const resAct = await fetch('https://api.simkl.com/sync/activities', { headers });
    if (resAct.ok) {
      const actData = await resAct.json();
      const latest = actData.all || actData.shows || actData.movies;
      if (latest) {
        localStorage.setItem('simkl_last_activity_date', latest);
      }
    }

    statusText.textContent = `Merging ${pulledItems.length} items from Simkl API...`;
    fill.style.width = "95%";

    if (pulledItems.length > 0) {
      await mergeNewItems(pulledItems);
    }

    fill.style.width = "100%";
    statusText.textContent = `🎉 Success! Simkl sync complete (${pulledItems.length} items).`;
    showToast(`Pulled ${pulledItems.length} items from Simkl API.`);
  } catch (err) {
    console.error("Simkl Pull Sync Error:", err);
    statusText.textContent = "Error: " + err.message;
    statusText.style.color = "var(--primary-red)";
  }
}

function processSimklApiResponse(data) {
  const items = [];

  function processCategory(list, defaultType) {
    if (!Array.isArray(list)) return;
    list.forEach(entry => {
      const media = entry.show || entry.movie || entry.anime || entry;
      const title = media.title || media.name;
      if (!title) return;

      const type = entry.show ? 'show' : (entry.anime ? 'anime' : defaultType);
      const rating = parseRating(entry.user_rating || entry.rating);

      let episodes = [];
      if (entry.episodes && Array.isArray(entry.episodes)) {
        entry.episodes.forEach(ep => {
          episodes.push({ season: ep.season || 1, episode: ep.number || 1, watched_at: ep.watched_at });
        });
      } else if (entry.last_watched_at) {
        episodes.push({ season: 1, episode: 1, watched_at: entry.last_watched_at });
      }

      items.push({
        title: title,
        year: media.year || null,
        media_type: type,
        status: parseStatus(entry.status),
        user_rating: rating,
        aggregated_rating: rating,
        last_watched_at: entry.last_watched_at || null,
        episodes: episodes,
        sources: { simkl: true },
        ids: {
          simkl: media.ids ? media.ids.simkl : null,
          imdb: media.ids ? media.ids.imdb : null,
          tmdb: media.ids ? media.ids.tmdb : null,
          tvdb: media.ids ? media.ids.tvdb : null,
          mal: media.ids ? media.ids.mal : null
        }
      });
    });
  }

  if (data.shows) processCategory(data.shows, 'show');
  if (data.movies) processCategory(data.movies, 'movie');
  if (data.anime) processCategory(data.anime, 'anime');

  return items;
}

async function runSimklPushSync() {
  const token = localStorage.getItem('simkl_access_token');
  if (!token) {
    alert("Please connect your Simkl account first.");
    return;
  }

  const progressContainer = document.getElementById('simkl-sync-progress');
  const fill = document.getElementById('simkl-progress-fill');
  const statusText = document.getElementById('simkl-sync-status-text');

  if (progressContainer) progressContainer.classList.remove('hidden');

  statusText.textContent = "Formatting library items for Simkl History API...";
  fill.style.width = "30%";

  const payload = {
    movies: [],
    shows: []
  };

  allItems.forEach(item => {
    const ids = item.ids || {};
    const simklIds = {};
    if (ids.simkl) simklIds.simkl = ids.simkl;
    if (ids.imdb) simklIds.imdb = ids.imdb;
    if (ids.tmdb) simklIds.tmdb = ids.tmdb;
    if (ids.tvdb) simklIds.tvdb = ids.tvdb;

    if (item.media_type === 'movie') {
      payload.movies.push({
        title: item.title,
        year: item.year,
        ids: simklIds
      });
    } else {
      payload.shows.push({
        title: item.title,
        year: item.year,
        ids: simklIds,
        seasons: [{ number: 1, episodes: item.episodes ? item.episodes.map(e => ({ number: e.episode })) : [{ number: 1 }] }]
      });
    }
  });

  statusText.textContent = `Pushing ${payload.movies.length} movies and ${payload.shows.length} shows to Simkl...`;
  fill.style.width = "70%";

  try {
    const res = await fetch('https://api.simkl.com/sync/history', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'simkl-api-key': SIMKL_CLIENT_ID,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err}`);
    }

    fill.style.width = "100%";
    statusText.textContent = "🎉 Successfully pushed library to Simkl API!";
    showToast("Pushed library to Simkl API.");
  } catch (err) {
    console.error("Simkl Push Error:", err);
    statusText.textContent = "Push Error: " + err.message;
    statusText.style.color = "var(--primary-red)";
  }
}

