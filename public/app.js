// IMGMETA-SEO Industrial Console - Frontend Application Logic
// Pure Vanilla ESM / JavaScript

(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────
  // STATE MANAGEMENT
  // ──────────────────────────────────────────────────────────
  const state = {
    files: [],
    selectedFileIds: new Set(),
    activeFileId: null,
    filter: 'all',
    searchQuery: '',
    isQueueRunning: false,
    cancelRequested: false,
    stats: {
      totalFiles: 0,
      scanned: 0,
      injected: 0,
      visionTokens: 0,
      seoTokens: 0,
      estCostUsd: 0.0000,
      savedCostUsd: 0.0000
    },
    forbiddenKeywords: ['canon', 'nikon', 'sony', 'apple', 'iphone', 'ipad', 'porsche', 'nike', 'adidas', 'gucci', 'bmw', 'mercedes']
  };

  // ──────────────────────────────────────────────────────────
  // DOM ELEMENT REFERENCES
  // ──────────────────────────────────────────────────────────
  const elements = {
    // Header
    headerQueueCount: document.getElementById('headerQueueCount'),
    headerCostValue: document.getElementById('headerCostValue'),
    btnScanDir: document.getElementById('btnScanDir'),
    btnAnalyzeAll: document.getElementById('btnAnalyzeAll'),
    btnAnalyzeAllLabel: document.getElementById('btnAnalyzeAllLabel'),
    btnCancelQueue: document.getElementById('btnCancelQueue'),
    btnCancelQueueBar: document.getElementById('btnCancelQueueBar'),
    selectConcurrency: document.getElementById('selectConcurrency'),
    btnInjectSelected: document.getElementById('btnInjectSelected'),
    selectedCountBadge: document.getElementById('selectedCountBadge'),
    chkAutoRename: document.getElementById('chkAutoRename'),
    
    // Live Batch Queue Progress Bar
    queueProgressContainer: document.getElementById('queueProgressContainer'),
    queueStatusMsg: document.getElementById('queueStatusMsg'),
    queuePercentage: document.getElementById('queuePercentage'),
    progressBarFill: document.getElementById('progressBarFill'),

    // Sidebar
    sidebarFileCount: document.getElementById('sidebarFileCount'),
    chkSelectAll: document.getElementById('chkSelectAll'),
    selectionSummary: document.getElementById('selectionSummary'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    searchInput: document.getElementById('searchInput'),
    fileListContainer: document.getElementById('fileListContainer'),
    
    // Center Workspace & Error Banner
    errorBannerCard: document.getElementById('errorBannerCard'),
    errorBannerIcon: document.getElementById('errorBannerIcon'),
    errorBannerTitle: document.getElementById('errorBannerTitle'),
    errorBannerMsg: document.getElementById('errorBannerMsg'),
    btnRetryActiveFile: document.getElementById('btnRetryActiveFile'),

    emptyState: document.getElementById('emptyState'),
    mainEditorArea: document.getElementById('mainEditorArea'),
    syncInspector: document.getElementById('syncInspector'),
    activeFileTitle: document.getElementById('activeFileTitle'),
    activeFilePath: document.getElementById('activeFilePath'),
    activeFileActions: document.getElementById('activeFileActions'),
    btnAnalyzeSingle: document.getElementById('btnAnalyzeSingle'),
    btnInjectSingle: document.getElementById('btnInjectSingle'),
    
    // Preview & Tech specs
    previewImage: document.getElementById('previewImage'),
    specFormat: document.getElementById('specFormat'),
    specDimensions: document.getElementById('specDimensions'),
    specFileSize: document.getElementById('specFileSize'),
    specEndian: document.getElementById('specEndian'),
    specHash: document.getElementById('specHash'),
    visionRawText: document.getElementById('visionRawText'),
    
    // Form inputs
    inputTitle: document.getElementById('inputTitle'),
    titleCharCount: document.getElementById('titleCharCount'),
    inputDesc: document.getElementById('inputDesc'),
    descCharCount: document.getElementById('descCharCount'),
    tagInput: document.getElementById('tagInput'),
    btnAddTag: document.getElementById('btnAddTag'),
    tagsChipsBox: document.getElementById('tagsChipsBox'),
    tagsCount: document.getElementById('tagsCount'),
    tagsStatusLabel: document.getElementById('tagsStatusLabel'),
    
    // 3-Layer Sync Inspector values
    iptcTitleVal: document.getElementById('iptcTitleVal'),
    iptcCaptionVal: document.getElementById('iptcCaptionVal'),
    iptcKeywordsVal: document.getElementById('iptcKeywordsVal'),
    exifDescVal: document.getElementById('exifDescVal'),
    exifXPTitleVal: document.getElementById('exifXPTitleVal'),
    exifXPKeywordsVal: document.getElementById('exifXPKeywordsVal'),
    xmpTitleVal: document.getElementById('xmpTitleVal'),
    xmpDescVal: document.getElementById('xmpDescVal'),
    xmpSubjectVal: document.getElementById('xmpSubjectVal'),
    
    // Right panel
    auditVisionTokens: document.getElementById('auditVisionTokens'),
    auditSeoTokens: document.getElementById('auditSeoTokens'),
    auditCacheRate: document.getElementById('auditCacheRate'),
    auditSavedCost: document.getElementById('auditSavedCost'),
    logTerminal: document.getElementById('logTerminal')
  };

  // ──────────────────────────────────────────────────────────
  // INITIALIZATION & EVENT LISTENERS
  // ──────────────────────────────────────────────────────────
  function init() {
    loadFilesFromApi();
    bindEvents();
    startLiveLogStream();
    appendLog('SYS', 'IMGMETA-SEO Web UI initialized. Database SQLite ready.');
  }

  function bindEvents() {
    // Filters
    elements.filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filter = btn.dataset.filter;
        renderFileList();
      });
    });

    // Select All
    elements.chkSelectAll.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const visibleFiles = getFilteredFiles();
      if (isChecked) {
        visibleFiles.forEach(f => state.selectedFileIds.add(f.id));
      } else {
        visibleFiles.forEach(f => state.selectedFileIds.delete(f.id));
      }
      updateSelectionUI();
      renderFileList();
    });

    // Search input
    elements.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.toLowerCase().trim();
      renderFileList();
    });

    // Header buttons
    elements.btnScanDir.addEventListener('click', handleRefreshDirectory);
    elements.btnAnalyzeAll.addEventListener('click', handleAnalyzeQueue);
    if (elements.btnCancelQueue) elements.btnCancelQueue.addEventListener('click', handleCancelQueue);
    if (elements.btnCancelQueueBar) elements.btnCancelQueueBar.addEventListener('click', handleCancelQueue);
    elements.btnInjectSelected.addEventListener('click', handleInjectSelected);

    // Active File Action buttons
    elements.btnAnalyzeSingle.addEventListener('click', handleAnalyzeActiveFile);
    elements.btnInjectSingle.addEventListener('click', handleInjectActiveFile);
    elements.btnRetryActiveFile.addEventListener('click', handleRetryActiveFile);

    // Title input with auto-save to SQLite staging
    elements.inputTitle.addEventListener('input', (e) => {
      const activeFile = getActiveFile();
      if (!activeFile) return;
      activeFile.seo.title = e.target.value;
      updateTitleCounters();
      updateSyncInspector(activeFile);
      debounceSaveStaged(activeFile);
    });

    // Description input with auto-save to SQLite staging
    elements.inputDesc.addEventListener('input', (e) => {
      const activeFile = getActiveFile();
      if (!activeFile) return;
      activeFile.seo.description = e.target.value;
      updateDescCounters();
      updateSyncInspector(activeFile);
      debounceSaveStaged(activeFile);
    });

    // Tag Input
    elements.tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTagFromInput();
      }
    });

    elements.btnAddTag.addEventListener('click', (e) => {
      e.preventDefault();
      addTagFromInput();
    });
  }

  // Debounce helper for auto-saving manual edits to SQLite
  let saveTimeout = null;
  function debounceSaveStaged(file) {
    if (!file) return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        await fetch('/api/staged/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            title: file.seo.title,
            description: file.seo.description,
            keywords: file.seo.keywords
          })
        });
      } catch (e) {}
    }, 600);
  }

  // ──────────────────────────────────────────────────────────
  // DATA FETCHING & API HANDLING
  // ──────────────────────────────────────────────────────────
  async function loadFilesFromApi() {
    try {
      const res = await fetch('/api/files');
      if (res.ok) {
        const data = await res.json();
        state.files = data.files || [];
        appendLog('API', `Loaded ${state.files.length} files from photo/ & SQLite.`);

        // Generate lightweight thumbnails in background for photo/.tmp/
        setTimeout(() => {
          state.files.forEach(f => generateAndCacheThumbnail(f));
        }, 100);
      }
    } catch (err) {
      appendLog('ERR', `Failed to load files from server: ${err.message}`);
    }
    
    updateHeaderStats();
    updateSelectionUI();
    renderFileList();
    if (state.files.length > 0 && !state.activeFileId) {
      selectFile(state.files[0].id);
    }
  }

  function generateAndCacheThumbnail(file) {
    if (file.format === 'svg' || file.format === 'eps') return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const maxDim = 200;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

        fetch(`/api/thumbnail/${encodeURIComponent(file.name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl })
        }).catch(() => {});
      } catch (e) {}
    };
    img.src = file.fullImage || `/api/photo/${encodeURIComponent(file.name)}`;
  }

  function getFilteredFiles() {
    const query = state.searchQuery;
    const filter = state.filter;

    return state.files.filter(file => {
      let matchesFilter = true;
      if (filter === 'pending') matchesFilter = (file.status === 'pending');
      else if (filter === 'scanned') matchesFilter = (file.status === 'scanned' || file.status === 'analyzed' || file.status === 'cached');
      else if (filter === 'injected') matchesFilter = (file.status === 'injected');
      else if (filter === 'errors') matchesFilter = file.status.startsWith('error_');

      const matchesSearch = !query || 
        file.name.toLowerCase().includes(query) || 
        (file.seo?.title && file.seo.title.toLowerCase().includes(query)) ||
        (file.seo?.keywords && file.seo.keywords.some(k => k.toLowerCase().includes(query)));
      
      return matchesFilter && matchesSearch;
    });
  }

  function updateSelectionUI() {
    const count = state.selectedFileIds.size;
    elements.selectedCountBadge.textContent = count;
    elements.selectionSummary.textContent = `${count} dipilih`;

    const visibleFiles = getFilteredFiles();
    if (visibleFiles.length > 0 && visibleFiles.every(f => state.selectedFileIds.has(f.id))) {
      elements.chkSelectAll.checked = true;
    } else {
      elements.chkSelectAll.checked = false;
    }

    // Dynamic Scan Button text depending on checklist selection
    const pendingCount = state.files.filter(f => f.status === 'pending' || f.status.startsWith('error_')).length;
    if (elements.btnAnalyzeAllLabel) {
      if (count > 0) {
        elements.btnAnalyzeAllLabel.textContent = `⚡ Scan Terpilih (${count})`;
        elements.btnAnalyzeAll.title = `Scan AI Vision & SEO untuk ${count} file yang dicentang`;
      } else {
        elements.btnAnalyzeAllLabel.textContent = `⚡ Scan Semua Pending (${pendingCount})`;
        elements.btnAnalyzeAll.title = `Scan visual & SEO untuk ${pendingCount} file pending`;
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // UI RENDERING
  // ──────────────────────────────────────────────────────────
  function getStatusBadgeHtml(file) {
    const s = file.status;
    if (s === 'running_vision') {
      return `<span class="status-badge running-vision"><span class="spinner-icon"></span> 👁️ VISION...</span>`;
    }
    if (s === 'running_seo') {
      return `<span class="status-badge running-seo"><span class="spinner-icon"></span> 🧠 SEO...</span>`;
    }
    if (s === 'running_inject') {
      return `<span class="status-badge running-inject"><span class="spinner-icon"></span> 💾 INJECTING...</span>`;
    }
    if (s === 'queued') {
      return `<span class="status-badge queued">⏳ QUEUED</span>`;
    }
    if (s === 'error_vision') {
      return `<span class="status-badge error-vision" title="${file.errorMessage || 'Vision failed'}">👁️❌ ERR: VISION</span>`;
    }
    if (s === 'error_seo') {
      return `<span class="status-badge error-seo" title="${file.errorMessage || 'SEO failed'}">🧠❌ ERR: SEO</span>`;
    }
    if (s === 'error_rename') {
      return `<span class="status-badge error-rename" title="${file.errorMessage || 'Rename failed'}">💾❌ ERR: RENAME</span>`;
    }
    if (s === 'error_inject' || s === 'error') {
      return `<span class="status-badge error" title="${file.errorMessage || 'Inject failed'}">⚠️ ERR: INJECT</span>`;
    }
    if (s === 'injected') {
      return `<span class="status-badge injected">✓ INJECTED</span>`;
    }
    if (s === 'scanned' || s === 'cached' || s === 'analyzed') {
      return `<span class="status-badge scanned">📋 SCANNED (DB)</span>`;
    }
    return `<span class="status-badge pending">PENDING</span>`;
  }

  function renderFileList() {
    const filtered = getFilteredFiles();
    elements.sidebarFileCount.textContent = `${filtered.length} of ${state.files.length}`;
    elements.fileListContainer.innerHTML = '';

    if (filtered.length === 0) {
      elements.fileListContainer.innerHTML = `
        <li style="padding: 20px 14px; text-align: center; color: var(--text-muted); font-size: 11px;">
          Tidak ada foto yang cocok.
        </li>
      `;
      return;
    }

    filtered.forEach(file => {
      const isSelected = state.selectedFileIds.has(file.id);
      const isActive = file.id === state.activeFileId;

      const li = document.createElement('li');
      li.className = `file-item ${isActive ? 'active' : ''}`;
      li.dataset.id = file.id;
      li.onclick = (e) => {
        if (e.target.tagName !== 'INPUT') {
          selectFile(file.id);
        }
      };

      const badgeHtml = getStatusBadgeHtml(file);

      li.innerHTML = `
        <div style="display: flex; align-items: center; padding-right: 6px;">
          <input type="checkbox" class="file-chk" ${isSelected ? 'checked' : ''} style="cursor: pointer; accent-color: var(--text-primary);">
        </div>
        <div class="file-thumb-mini">
          <img src="${file.thumbnail}" alt="${file.name}" loading="lazy" decoding="async">
        </div>
        <div class="file-info">
          <div class="file-name" title="${file.name}">${file.name}</div>
          <div class="file-meta-row">
            <span class="badge badge-${file.format}">${file.format.toUpperCase()}</span>
            ${badgeHtml}
            <span>${file.size}</span>
          </div>
        </div>
      `;

      const chk = li.querySelector('.file-chk');
      chk.addEventListener('change', (e) => {
        e.stopPropagation();
        if (e.target.checked) {
          state.selectedFileIds.add(file.id);
        } else {
          state.selectedFileIds.delete(file.id);
        }
        updateSelectionUI();
      });

      elements.fileListContainer.appendChild(li);
    });
  }

  function selectFile(fileId) {
    state.activeFileId = fileId;
    const file = getActiveFile();
    if (!file) return;

    // Instant lightweight class update on DOM without heavy innerHTML reset
    const items = elements.fileListContainer.querySelectorAll('.file-item');
    items.forEach(item => {
      if (item.dataset.id === fileId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Show workspace
    elements.emptyState.style.display = 'none';
    elements.mainEditorArea.style.display = 'grid';
    elements.syncInspector.style.display = 'block';
    elements.activeFileActions.style.display = 'flex';

    // Populate Headers & Tech Specs
    elements.activeFileTitle.textContent = file.name;
    elements.activeFilePath.textContent = `photo/${file.name}`;
    elements.previewImage.src = file.fullImage || `/api/photo/${encodeURIComponent(file.name)}`;
    elements.specFormat.textContent = file.format.toUpperCase();
    elements.specDimensions.textContent = file.dimensions || '-';
    elements.specFileSize.textContent = file.size;
    elements.specEndian.textContent = file.endian || 'II (Little-Endian)';
    elements.specHash.textContent = file.hash;

    // Handle Error Banner Display
    if (file.status.startsWith('error_') || file.status === 'error') {
      elements.errorBannerCard.style.display = 'flex';
      elements.errorBannerMsg.textContent = file.errorMessage || 'Terjadi kesalahan saat memproses file ini.';
      if (file.status === 'error_vision') {
        elements.errorBannerIcon.textContent = '👁️❌';
        elements.errorBannerTitle.textContent = 'GAGAL DI TAHAP 1: AI VISION';
      } else if (file.status === 'error_seo') {
        elements.errorBannerIcon.textContent = '🧠❌';
        elements.errorBannerTitle.textContent = 'GAGAL DI TAHAP 2: DEEPSEEK SEO';
      } else if (file.status === 'error_rename') {
        elements.errorBannerIcon.textContent = '💾❌';
        elements.errorBannerTitle.textContent = 'GAGAL MENGUBAH NAMA FILE (RENAME ERROR)';
      } else {
        elements.errorBannerIcon.textContent = '⚠️';
        elements.errorBannerTitle.textContent = 'PROSES GAGAL';
      }
    } else {
      elements.errorBannerCard.style.display = 'none';
    }

    // AI Vision Text (6 Pilar)
    elements.visionRawText.textContent = file.visionRaw || 'Belum diproses melalui AI Vision. Klik "AI Vision + SEO" untuk menganalisa visual gambar ini dan menyimpannya ke database SQLite.';

    // SEO Form
    if (!file.seo) file.seo = { title: '', description: '', keywords: [] };
    elements.inputTitle.value = file.seo.title || '';
    elements.inputDesc.value = file.seo.description || '';
    
    updateTitleCounters();
    updateDescCounters();
    renderTagChips(file.seo.keywords || []);
    updateSyncInspector(file);

    appendLog('SELECT', `Inspecting ${file.name} [Status: ${file.status.toUpperCase()}]`);
  }

  function getActiveFile() {
    return state.files.find(f => f.id === state.activeFileId);
  }

  // ──────────────────────────────────────────────────────────
  // TAGS & KEYWORDS MANAGER
  // ──────────────────────────────────────────────────────────
  function renderTagChips(keywords) {
    elements.tagsChipsBox.innerHTML = '';
    elements.tagsCount.textContent = keywords.length;

    if (keywords.length > 49) {
      elements.tagsStatusLabel.textContent = 'EXCEEDS STOCK LIMIT (MAX 49)';
      elements.tagsStatusLabel.className = 'char-counter limit-warn';
    } else if (keywords.length >= 25) {
      elements.tagsStatusLabel.textContent = 'High-Rank SEO Stock Range (25–45 Tags)';
      elements.tagsStatusLabel.className = 'char-counter';
      elements.tagsStatusLabel.style.color = 'var(--status-success)';
    } else {
      elements.tagsStatusLabel.textContent = 'English Stock Tags (Target: 35–45)';
      elements.tagsStatusLabel.className = 'char-counter';
      elements.tagsStatusLabel.style.color = 'var(--text-muted)';
    }

    keywords.forEach((tag, idx) => {
      const chip = document.createElement('div');
      const isTopPriority = idx < 10;
      chip.className = `tag-chip ${isTopPriority ? 'priority-top' : ''}`;
      chip.innerHTML = `
        <span class="tag-index">[${idx + 1}]</span>
        <span class="tag-text">${tag}</span>
        <span class="tag-remove" title="Hapus tag">&times;</span>
      `;

      chip.querySelector('.tag-remove').onclick = (e) => {
        e.stopPropagation();
        removeTag(idx);
      };

      elements.tagsChipsBox.appendChild(chip);
    });
  }

  function addTagFromInput() {
    const rawVal = elements.tagInput.value.trim();
    if (!rawVal) return;

    const tagsToAdd = rawVal
      .split(',')
      .map(t => t.trim().toLowerCase().replace(/[^a-z0-9\s-]/g, ''))
      .filter(t => t.length > 1);

    const file = getActiveFile();
    if (!file) return;

    if (!file.seo) file.seo = { title: '', description: '', keywords: [] };
    if (!file.seo.keywords) file.seo.keywords = [];

    tagsToAdd.forEach(tag => {
      if (state.forbiddenKeywords.includes(tag)) {
        appendLog('WARN', `Stripped forbidden trademark keyword: "${tag}"`);
        return;
      }

      if (!file.seo.keywords.includes(tag) && file.seo.keywords.length < 49) {
        file.seo.keywords.push(tag);
      }
    });

    elements.tagInput.value = '';
    renderTagChips(file.seo.keywords);
    updateSyncInspector(file);
    debounceSaveStaged(file);
  }

  function removeTag(index) {
    const file = getActiveFile();
    if (!file || !file.seo?.keywords) return;
    file.seo.keywords.splice(index, 1);
    renderTagChips(file.seo.keywords);
    updateSyncInspector(file);
    debounceSaveStaged(file);
  }

  // ──────────────────────────────────────────────────────────
  // COUNTERS & 3-LAYER SYNCHRONIZATION
  // ──────────────────────────────────────────────────────────
  function updateTitleCounters() {
    const len = elements.inputTitle.value.length;
    elements.titleCharCount.textContent = `${len} / 70`;
    if (len > 70) {
      elements.titleCharCount.className = 'char-counter limit-warn';
    } else {
      elements.titleCharCount.className = 'char-counter';
    }
  }

  function updateDescCounters() {
    const len = elements.inputDesc.value.length;
    elements.descCharCount.textContent = `${len} chars`;
  }

  function updateSyncInspector(file) {
    const title = file.seo?.title || '-';
    const desc = file.seo?.description || '-';
    const kwCount = (file.seo?.keywords || []).length;
    const kwSample = (file.seo?.keywords || []).slice(0, 5).join(', ') + (kwCount > 5 ? ` (+${kwCount - 5} more)` : '');

    // Layer 1: IPTC
    elements.iptcTitleVal.textContent = title;
    elements.iptcCaptionVal.textContent = desc;
    elements.iptcKeywordsVal.textContent = kwCount > 0 ? `${kwCount} tags (${kwSample})` : '-';

    // Layer 2: EXIF IFD0
    elements.exifDescVal.textContent = desc;
    elements.exifXPTitleVal.textContent = title;
    elements.exifXPKeywordsVal.textContent = (file.seo?.keywords || []).join(';');

    // Layer 3: Adobe XMP Dublin Core
    elements.xmpTitleVal.textContent = title;
    elements.xmpDescVal.textContent = desc;
    elements.xmpSubjectVal.textContent = kwCount > 0 ? `rdf:Bag (${kwCount} items)` : '-';
  }

  function updateHeaderStats() {
    const total = state.files.length;
    const injected = state.files.filter(f => f.status === 'injected').length;
    const scanned = state.files.filter(f => f.status === 'scanned' || f.status === 'cached' || f.status === 'analyzed').length;

    elements.headerQueueCount.textContent = `${injected} / ${total}`;
    
    let totalCost = 0;
    let totalTokens = 0;
    state.files.forEach(f => {
      totalCost += f.costUsd || 0;
      totalTokens += f.tokensUsed || 0;
    });

    elements.headerCostValue.textContent = `$${totalCost.toFixed(4)}`;
    elements.auditVisionTokens.textContent = Math.round(totalTokens * 0.7).toLocaleString();
    elements.auditSeoTokens.textContent = Math.round(totalTokens * 0.3).toLocaleString();
    elements.auditSavedCost.textContent = `$${(scanned * 0.0018).toFixed(4)}`;
  }

  // ──────────────────────────────────────────────────────────
  // LOG TERMINAL & REAL-TIME STREAMING
  // ──────────────────────────────────────────────────────────
  let lastLogId = 0;

  function startLiveLogStream() {
    setInterval(async () => {
      try {
        const res = await fetch(`/api/logs?since=${lastLogId}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.logs) && data.logs.length > 0) {
            data.logs.forEach(log => {
              if (log.id > lastLogId) {
                lastLogId = log.id;
                renderServerLog(log);
              }
            });
          }
        }
      } catch (e) {
        // Silent catch for log polling
      }
    }, 1200);
  }

  function renderServerLog(log) {
    if (!elements.logTerminal) return;
    const div = document.createElement('div');
    div.className = 'log-line';
    
    let opColorClass = 'log-info';
    if (log.level === 'SUCCESS' || log.level === 'INJECT' || log.level === 'RENAME') opColorClass = 'log-success';
    if (log.level === 'ERROR' || log.level === 'WARN') opColorClass = 'log-error';

    const timeShort = log.timestamp ? log.timestamp.split('T')[1].slice(0, 8) : new Date().toTimeString().split(' ')[0];
    const filePrefix = log.file ? ` [${log.file}] — ` : ' ';

    div.innerHTML = `<span class="log-time">[${timeShort}]</span> <span class="log-op ${opColorClass}">[${log.level}] ${log.category}:</span> <span>${filePrefix}${log.message}</span>`;
    elements.logTerminal.appendChild(div);

    // Limit DOM log lines to 150 items to keep UI fast
    while (elements.logTerminal.children.length > 150) {
      elements.logTerminal.removeChild(elements.logTerminal.firstChild);
    }
    elements.logTerminal.scrollTop = elements.logTerminal.scrollHeight;
  }

  function appendLog(op, msg) {
    const time = new Date().toTimeString().split(' ')[0];
    const div = document.createElement('div');
    div.className = 'log-line';
    
    let opColorClass = 'log-info';
    if (op === 'SUCCESS' || op === 'INJECT') opColorClass = 'log-success';
    if (op === 'ERR' || op === 'WARN') opColorClass = 'log-error';

    div.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-op ${opColorClass}">${op}:</span> <span>${msg}</span>`;
    elements.logTerminal.appendChild(div);
    elements.logTerminal.scrollTop = elements.logTerminal.scrollHeight;
  }

  // ──────────────────────────────────────────────────────────
  // VISUAL PROGRESS BAR CONTROLLER
  // ──────────────────────────────────────────────────────────
  function showQueueProgress(statusText, current, total) {
    elements.queueProgressContainer.style.display = 'block';
    elements.queueStatusMsg.textContent = statusText;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    elements.queuePercentage.textContent = `${percent}%`;
    elements.progressBarFill.style.width = `${percent}%`;
  }

  function hideQueueProgress() {
    elements.progressBarFill.style.width = '100%';
    elements.queuePercentage.textContent = '100%';
    setTimeout(() => {
      elements.queueProgressContainer.style.display = 'none';
      elements.progressBarFill.style.width = '0%';
    }, 800);
  }

  // ──────────────────────────────────────────────────────────
  // ACTIONS HANDLERS (Connected to REST API & SQLite)
  // ──────────────────────────────────────────────────────────
  async function handleRefreshDirectory() {
    appendLog('REFRESH', 'Refreshing directory ./photo and SQLite database...');
    await loadFilesFromApi();
    appendLog('SUCCESS', `Queue refreshed. ${state.files.length} total file(s).`);
  }

  // ──────────────────────────────────────────────────────────
  // DECOUPLED INDIVIDUAL FILE ANALYZER & CONCURRENT QUEUE RUNNER
  // ──────────────────────────────────────────────────────────
  function updateFileItemDom(file) {
    const li = elements.fileListContainer.querySelector(`.file-item[data-id="${file.id}"]`);
    if (li) {
      const metaRow = li.querySelector('.file-meta-row');
      if (metaRow) {
        metaRow.innerHTML = `
          <span class="badge badge-${file.format}">${file.format.toUpperCase()}</span>
          ${getStatusBadgeHtml(file)}
          <span>${file.size}</span>
        `;
      }
      const chk = li.querySelector('.file-chk');
      if (chk) {
        chk.checked = state.selectedFileIds.has(file.id);
      }
    } else {
      renderFileList();
    }
  }

  async function analyzeSingleFile(file) {
    if (!file) return false;

    file.status = 'running_vision';
    updateFileItemDom(file);
    if (state.activeFileId === file.id) {
      selectFile(file.id);
    }

    appendLog('AI_VISION', `Stage 1: AI Vision checking visual pillars for ${file.name}...`);

    // Multi-stage visual state transition
    const timer = setTimeout(() => {
      if (file.status === 'running_vision') {
        file.status = 'running_seo';
        updateFileItemDom(file);
        if (state.activeFileId === file.id) selectFile(file.id);
        appendLog('AI_SEO', `Stage 2: DeepSeek generating SEO for ${file.name}...`);
      }
    }, 1500);

    try {
      const res = await fetch(`/api/analyze/${encodeURIComponent(file.name)}`, {
        method: 'POST'
      });

      clearTimeout(timer);
      const data = await res.json();

      if (res.ok) {
        file.visionRaw = data.visionRaw;
        file.seo = data.seo;
        file.status = 'scanned';
        file.tokensUsed = (data.tokens?.visionTokens || 0) + (data.tokens?.seoTokens || 0);
        file.costUsd = data.estCostUsd || 0.0;
        file.errorMessage = null;

        // Ensure analyzed file is in selection for injection
        state.selectedFileIds.add(file.id);

        updateFileItemDom(file);
        if (state.activeFileId === file.id) {
          selectFile(file.id);
        }
        updateHeaderStats();
        updateSelectionUI();
        appendLog('SUCCESS', `Analysis complete & saved to SQLite: ${file.name}.`);
        return true;
      } else {
        if (data.stage === 'vision' || data.errorType === 'ERROR_VISION') {
          file.status = 'error_vision';
        } else if (data.stage === 'seo' || data.errorType === 'ERROR_SEO') {
          file.status = 'error_seo';
          if (data.visionRaw) file.visionRaw = data.visionRaw;
        } else {
          file.status = 'error';
        }
        file.errorMessage = data.error || 'Terjadi kesalahan saat memproses file.';
        updateFileItemDom(file);
        if (state.activeFileId === file.id) {
          selectFile(file.id);
        }
        appendLog('ERR', `Failed to process ${file.name} [${file.status}]: ${file.errorMessage}`);
        return false;
      }
    } catch (err) {
      clearTimeout(timer);
      file.status = 'error_vision';
      file.errorMessage = err.message;
      updateFileItemDom(file);
      if (state.activeFileId === file.id) {
        selectFile(file.id);
      }
      appendLog('ERR', `Network error analyzing ${file.name}: ${err.message}`);
      return false;
    }
  }

  async function handleAnalyzeActiveFile() {
    const file = getActiveFile();
    if (!file) return;
    return await analyzeSingleFile(file);
  }

  async function handleRetryActiveFile() {
    const file = getActiveFile();
    if (!file) return;

    appendLog('RETRY', `Retrying process for ${file.name}...`);
    if (file.status === 'error_rename' || file.status === 'error_inject') {
      await handleInjectActiveFile();
    } else {
      await analyzeSingleFile(file);
    }
  }

  async function runConcurrentQueue(filesToProcess, concurrency = 2) {
    if (!filesToProcess || filesToProcess.length === 0) return;

    state.isQueueRunning = true;
    state.cancelRequested = false;

    // Switch UI Buttons
    if (elements.btnCancelQueue) elements.btnCancelQueue.style.display = 'inline-flex';
    if (elements.btnAnalyzeAll) elements.btnAnalyzeAll.style.display = 'none';

    // Mark all target files as queued
    filesToProcess.forEach(f => {
      f.status = 'queued';
    });
    renderFileList();

    const total = filesToProcess.length;
    let nextIndex = 0;
    let completedCount = 0;

    const actualConcurrency = Math.min(Math.max(1, concurrency), total);
    showQueueProgress(`Memulai antrean ${total} file (${actualConcurrency}x parallel threads)...`, 0, total);
    appendLog('QUEUE', `Running queue for ${total} files with ${actualConcurrency} parallel worker(s)...`);

    async function worker(workerId) {
      while (nextIndex < total && !state.cancelRequested) {
        const index = nextIndex++;
        const file = filesToProcess[index];
        if (!file) break;

        showQueueProgress(`[W${workerId}] Memproses: ${file.name} (${completedCount}/${total})`, completedCount, total);

        await analyzeSingleFile(file);

        completedCount++;
        showQueueProgress(`Selesai: ${file.name} (${completedCount}/${total})`, completedCount, total);
        updateHeaderStats();
      }
    }

    const workers = [];
    for (let w = 1; w <= actualConcurrency; w++) {
      workers.push(worker(w));
    }

    await Promise.all(workers);

    if (state.cancelRequested) {
      // Revert unfinished queued files to pending
      filesToProcess.forEach(f => {
        if (f.status === 'queued') f.status = 'pending';
      });
      appendLog('WARN', `Antrean dihentikan. ${completedCount} dari ${total} file selesai diproses.`);
    } else {
      appendLog('SUCCESS', `Batch queue selesai! ${completedCount} dari ${total} file berhasil diproses.`);
    }

    showQueueProgress(`Antrean selesai (${completedCount}/${total} file).`, total, total);
    hideQueueProgress();

    state.isQueueRunning = false;
    state.cancelRequested = false;

    if (elements.btnCancelQueue) elements.btnCancelQueue.style.display = 'none';
    if (elements.btnAnalyzeAll) elements.btnAnalyzeAll.style.display = 'inline-flex';

    updateSelectionUI();
    renderFileList();
    updateHeaderStats();
  }

  async function handleAnalyzeQueue() {
    if (state.isQueueRunning) return;

    let filesToProcess = [];
    const isSelectionActive = state.selectedFileIds.size > 0;

    if (isSelectionActive) {
      filesToProcess = state.files.filter(f => state.selectedFileIds.has(f.id));
      if (filesToProcess.length === 0) {
        alert('Pilih minimal 1 file dengan mencentang checkbox untuk memulai antrean.');
        return;
      }
      appendLog('QUEUE', `Memulai antrean untuk ${filesToProcess.length} file yang diceklist...`);
    } else {
      filesToProcess = state.files.filter(f => f.status === 'pending' || f.status.startsWith('error_'));
      if (filesToProcess.length === 0) {
        appendLog('INFO', 'Semua file sudah tersimpan di SQLite / teranalisa.');
        alert('Semua file sudah dianalisa atau tersimpan di SQLite.');
        return;
      }
      appendLog('QUEUE', `Memulai antrean untuk ${filesToProcess.length} file pending...`);
    }

    const concurrency = parseInt(elements.selectConcurrency?.value || '2', 10);
    await runConcurrentQueue(filesToProcess, concurrency);
  }

  function handleCancelQueue() {
    if (!state.isQueueRunning) return;
    state.cancelRequested = true;
    appendLog('WARN', 'Membatalkan antrean... Menunggu worker aktif menyelesaikan request.');
    if (elements.queueStatusMsg) {
      elements.queueStatusMsg.textContent = 'Membatalkan antrean... Menunggu task aktif.';
    }
  }

  async function handleInjectActiveFile() {
    const file = getActiveFile();
    if (!file) return;

    if (!file.seo?.title || file.seo.title.length === 0) {
      appendLog('WARN', `Cannot inject empty title for ${file.name}`);
      alert('Judul (Title) tidak boleh kosong sebelum diinjeksi.');
      return;
    }

    const shouldRename = elements.chkAutoRename.checked;
    file.status = 'running_inject';
    renderFileList();
    selectFile(file.id);

    appendLog('INJECT', `Injecting 3-Layer binary metadata to photo/${file.name}...`);

    try {
      const res = await fetch(`/api/apply/${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...file.seo, rename: shouldRename })
      });

      const data = await res.json();

      if (res.ok) {
        file.status = 'injected';
        file.errorMessage = null;

        if (data.renamed && data.fileName) {
          file.name = data.fileName;
          file.thumbnail = `/api/photo/${encodeURIComponent(data.fileName)}`;
          elements.activeFileTitle.textContent = data.fileName;
          elements.activeFilePath.textContent = `photo/${data.fileName}`;
          appendLog('SUCCESS', `Metadata binary written & file renamed to: ${data.fileName}`);
        } else {
          appendLog('SUCCESS', `Synchronized metadata written to file binary: photo/${file.name}`);
        }

        renderFileList();
        selectFile(file.id);
        updateHeaderStats();
        return true;
      } else {
        if (data.errorType === 'ERROR_RENAME' || data.stage === 'rename') {
          file.status = 'error_rename';
        } else {
          file.status = 'error_inject';
        }
        file.errorMessage = data.error || 'Gagal menulis metadata biner.';
        selectFile(file.id);
        appendLog('ERR', `Error injecting ${file.name} [${file.status}]: ${file.errorMessage}`);
        return false;
      }
    } catch (e) {
      file.status = 'error_inject';
      file.errorMessage = e.message;
      selectFile(file.id);
      appendLog('ERR', `Error injecting ${file.name}: ${e.message}`);
      return false;
    }
  }

  async function handleInjectSelected() {
    const selectedFiles = state.files.filter(f => state.selectedFileIds.has(f.id));
    if (selectedFiles.length === 0) {
      appendLog('WARN', 'Tidak ada file yang dicentang. Silakan centang file terlebih dahulu.');
      alert('Silakan pilih minimal 1 file yang ingin diinjeksi dengan mencentang checkbox.');
      return;
    }

    const shouldRename = elements.chkAutoRename.checked;
    appendLog('BATCH_INJECT', `Injecting metadata to ${selectedFiles.length} selected files...`);

    // Mark selected files as running_inject
    selectedFiles.forEach(f => {
      f.status = 'running_inject';
    });
    renderFileList();

    showQueueProgress(`Menginjeksi ${selectedFiles.length} file terpilih...`, 0, selectedFiles.length);

    const items = selectedFiles.map(f => ({
      fileName: f.name,
      filePath: f.filePath,
      title: f.seo?.title,
      description: f.seo?.description,
      keywords: f.seo?.keywords,
      rename: shouldRename
    }));

    try {
      const res = await fetch('/api/inject-selected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, rename: shouldRename })
      });

      const data = await res.json();

      if (res.ok) {
        appendLog('SUCCESS', `Batch injection complete: ${data.successCount} of ${data.total} files successfully injected!`);
        
        // Update per-item status from backend response
        if (Array.isArray(data.results)) {
          data.results.forEach(r => {
            const targetFile = state.files.find(f => f.name === r.fileName || f.name === r.oldFileName);
            if (targetFile) {
              if (r.success) {
                targetFile.status = 'injected';
                targetFile.errorMessage = null;
                if (r.renamed && r.newFileName) {
                  targetFile.name = r.newFileName;
                  targetFile.thumbnail = `/api/photo/${encodeURIComponent(r.newFileName)}`;
                }
              } else {
                targetFile.status = r.errorType === 'ERROR_RENAME' ? 'error_rename' : 'error_inject';
                targetFile.errorMessage = r.error;
              }
            }
          });
        }

        showQueueProgress(`Selesai injeksi biner: ${data.successCount}/${data.total} file.`, data.total, data.total);
        hideQueueProgress();

        await loadFilesFromApi();
        state.selectedFileIds.clear();
        updateSelectionUI();
      } else {
        throw new Error(data.error || 'Batch injection failed');
      }
    } catch (err) {
      hideQueueProgress();
      appendLog('ERR', `Batch injection error: ${err.message}`);
    }
  }

  // Start on DOM ready
  document.addEventListener('DOMContentLoaded', init);
})();
