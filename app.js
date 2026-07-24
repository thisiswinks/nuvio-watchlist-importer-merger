let allItems = [];
let flaggedItems = [];
let filteredItems = [];
let currentTab = 'all';
let currentPage = 1;
const pageSize = 24;

const DEFAULT_NUVIO_APIKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTIxMzQ2LCJleHAiOjE5MzkyMDEzNDZ9.tmQaj682pwzehpqlgCDMnySOqiUvpgRbrE43T4VJpDI";

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupDragAndDrop();
  await loadData();
});

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
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
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
}

function setupEventListeners() {
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
      btn.innerHTML = '✅ Copied p_items JSON to Clipboard!';
      btn.style.background = '#059669';
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
                if (item.ids.mal && m.mal_id === item.ids.mal) return true;
                if (item.ids.kitsu && m.kitsu_id === item.ids.kitsu) return true;
                if (item.ids.anilist && m.anilist_id === item.ids.anilist) return true;
                if (item.ids.imdb && m.imdb_id === item.ids.imdb) return true;
                if (item.ids.tvdb && m.thetvdb_id === item.ids.tvdb) return true;
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
  syncStatusText.style.color = "#10b981";

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
    syncStatusText.style.color = "#f43f5e";
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

  for (let file of files) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.zip')) {
      try {
        const zip = await JSZip.loadAsync(file);
        for (const [filename, zipEntry] of Object.entries(zip.files)) {
          const entryLower = filename.toLowerCase();
          if (!zipEntry.dir && (entryLower.endsWith('.csv') || entryLower.endsWith('.xml') || entryLower.endsWith('.json'))) {
            const content = await zipEntry.async("string");
            const parsed = await parseFileContent(filename, content);
            newItems = newItems.concat(parsed);
          }
        }
      } catch (e) {
        console.error("ZIP parsing error", e);
      }
    } else if (lowerName.endsWith('.csv') || lowerName.endsWith('.xml') || lowerName.endsWith('.json')) {
      const content = await file.text();
      const parsed = await parseFileContent(file.name, content);
      newItems = newItems.concat(parsed);
    }
  }

  if (newItems.length > 0) {
    dropText.textContent = `Extracted ${newItems.length} raw items. Merging...`;
    mergeNewItems(newItems);
    dropText.textContent = `Successfully merged into library! Total items: ${allItems.length}`;
  } else {
    dropText.textContent = `No valid media items found in uploaded files.`;
  }

  setTimeout(() => {
    document.getElementById('nuvio-modal').classList.remove('hidden');
  }, 1500);
}

async function parseFileContent(filename, content) {
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
    if (row.Type) {
      if (row.Type.toLowerCase().includes('anime')) type = 'anime';
      else if (row.Type.toLowerCase().includes('tv') || row.Type.toLowerCase().includes('show')) type = 'show';
    }
    
    return {
      title: row.Title,
      year: parseInt(row.Year) || null,
      media_type: type,
      sources: { simkl: true },
      ids: {
        imdb: row['IMDB ID'] || null,
        simkl: row['Simkl ID'] || null
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
    
    if (titleNode && idNode) {
      items.push({
        title: titleNode.textContent,
        year: null,
        media_type: 'anime',
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
        
        items.push({
          title: mediaItem.title,
          year: mediaItem.year,
          media_type: type,
          sources: { trakt: true },
          ids: mediaItem.ids || {}
        });
      }
    });
  } else if (data.p_items) {
    data.p_items.forEach(item => {
      items.push({
        title: item.title,
        year: null,
        media_type: item.content_type === 'series' ? 'show' : 'movie',
        sources: { nuvio: true },
        ids: item.ids || {}
      });
    });
  }
  
  return items;
}

function mergeNewItems(newItems) {
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
        return true; // Match if titles & media types match and at least one is missing year
      });
    }
    
    if (existingItem) {
      existingItem.sources = { ...existingItem.sources, ...newItem.sources };
      existingItem.ids = { ...newItem.ids, ...existingItem.ids };
      if (!existingItem.year && newItem.year) existingItem.year = newItem.year;
      if (newItem.media_type === 'anime' && existingItem.media_type !== 'anime') {
        existingItem.media_type = 'anime';
      }
    } else {
      allItems.push(newItem);
    }
  });
  
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
      if (currentTab !== 'all' && item.media_type !== currentTab) {
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
          <p style="font-size: 0.7rem; color: var(--primary-yellow); margin: 0.25rem 0; font-weight: bold;">VS</p>
          <h4 class="media-title" style="font-size: 0.95rem;">${escapeHtml(item.item2_title || 'Item 2')}</h4>
          <p class="media-year" style="margin-top: 0.5rem; font-size: 0.8rem; line-height: 1.2;">Reason: ${escapeHtml(item.reason)}</p>
        </div>
        <div class="reconciliation-actions" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin-top: 1rem;">
          <button class="btn btn-secondary" style="padding: 0.4rem; font-size: 0.75rem;" onclick="handleReconciliation('keep1', ${absIndex})">Keep 1</button>
          <button class="btn btn-secondary" style="padding: 0.4rem; font-size: 0.75rem;" onclick="handleReconciliation('keep2', ${absIndex})">Keep 2</button>
          <button class="btn btn-emerald" style="padding: 0.4rem; font-size: 0.75rem;" onclick="handleReconciliation('merge', ${absIndex})">Merge</button>
          <button class="btn btn-secondary" style="padding: 0.4rem; font-size: 0.75rem; background: rgba(255,255,255,0.05);" onclick="handleReconciliation('skip', ${absIndex})">Skip</button>
        </div>
      `;
      grid.appendChild(card);
    } else {
      const card = document.createElement('div');
      card.className = 'media-card';
      const mtype = item.media_type || 'movie';
      const badgeClass = mtype === 'anime' ? 'badge-anime' : (mtype === 'show' ? 'badge-show' : 'badge-movie');
      const ratingText = item.aggregated_rating ? `★ ${item.aggregated_rating}` : 'Unrated';
      const ids = item.ids || {};

      card.innerHTML = `
        <div>
          <div class="card-header">
            <span class="type-badge ${badgeClass}">${mtype}</span>
            <span class="rating-tag">${ratingText}</span>
          </div>
          <h3 class="media-title" style="margin-top: 0.75rem;">${escapeHtml(item.title)}</h3>
          ${item.year ? `<p class="media-year">${item.year}</p>` : ''}
        </div>

        <div class="id-pills">
          ${ids.imdb ? `<span class="id-pill has-val">IMDB: ${ids.imdb}</span>` : ''}
          ${ids.tmdb ? `<span class="id-pill has-val">TMDB: ${ids.tmdb}</span>` : ''}
          ${ids.tvdb ? `<span class="id-pill has-val">TVDB: ${ids.tvdb}</span>` : ''}
          ${ids.mal ? `<span class="id-pill has-val">MAL: ${ids.mal}</span>` : ''}
          ${ids.kitsu ? `<span class="id-pill has-val">Kitsu: ${ids.kitsu}</span>` : ''}
          ${ids.simkl ? `<span class="id-pill has-val">Simkl: ${ids.simkl}</span>` : ''}
        </div>
      `;
      grid.appendChild(card);
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.handleReconciliation = function(action, index) {
  const item = flaggedItems[index];
  console.log(`Reconciliation action: ${action} on item`, item);
  
  // For now, regardless of the action chosen, we resolve the conflict by removing it from the flagged list
  flaggedItems.splice(index, 1);
  
  // Re-apply filters and render to update the UI
  applyFilters();
  
  // Update counters to reflect the new flagged count
  updateCounters();
};
