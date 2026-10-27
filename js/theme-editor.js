/* ============================================================
   theme-editor.js
   Erstellen und Bearbeiten von Custom Themes
   Erwartet window.MemoryApp mit geteilten Helfern/Funktionen.
   ============================================================ */
(function () {
  'use strict';

  const {
    getCustomThemes,
    saveCustomThemes,
    getThemeImages,
    storeThemeImages,
    deleteThemeImages,
    THEMES,
    populateThemeSelect,
    validateThemeAndGame,
    updateHighscoreDisplay,
    renderResults,
    renderThemePreview,
    getAppState,
    setAppThemeKey,
    GAMES,
  } = window.MemoryApp;

  // ---------- DOM-Referenzen ----------
  const createModal          = document.getElementById('createThemeModal');
  const themeNameInput       = document.getElementById('themeNameInput');
  const themeFilesInput      = document.getElementById('themeFilesInput');
  const uploadErrors         = document.getElementById('uploadErrors');
  const saveThemeBtn         = document.getElementById('saveThemeBtn');
  const closeModalBtn        = document.getElementById('closeModalBtn');
  const openCreateThemeBtn   = document.getElementById('openCreateThemeBtn');
  const editThemeBtn         = document.getElementById('editThemeBtn');
  const deleteThemeBtnInModal= document.getElementById('deleteThemeBtn');
  const exportThemeBtn       = document.getElementById('exportThemeBtn');
  const themeModalTitle      = document.getElementById('themeModalTitle');
  const themeEditorGrid      = document.getElementById('themeEditorGrid');
  const themeEditorCount     = document.getElementById('themeEditorCount');
  const addImagesBtn         = document.getElementById('addImagesBtn');
  const pasteImagesBtn       = document.getElementById('pasteImagesBtn');
  const themeSelect          = document.getElementById('themeSelect');

  // NEU: Ladekreisel
  const editorLoading        = document.getElementById('editorLoading');
  const editorLoadingText    = document.getElementById('editorLoadingText');

  // ---------- Editor-State ----------
  const editorState = {
    mode: 'create',
    editThemeKey: null,
    images: [],
    existingImages: [],
  };

  const MAX_IMAGES       = 72;
  const THUMB_MAX_WIDTH  = 250;
  const VALID_TYPES      = [
    'image/webp',
    'image/png',
    'image/jpeg',
    'image/bmp',
    'image/x-ms-bmp',
    'image/gif',
  ];
  const VALID_EXT_REGEX  = /\.(webp|png|jpe?g|bmp|gif)$/i;
  const MAX_FILE_SIZE    = 15 * 1024 * 1024; // 15 MB pro Bild

  // ---------- Hilfsfunktionen ----------
  function isZipFile(file) {
    return file.type === 'application/zip'
        || file.type === 'application/x-zip-compressed'
        || /\.zip$/i.test(file.name);
  }

  function dataURLMime(dataURL) {
    const m = /^data:([^;,]+)/.exec(dataURL || '');
    return m ? m[1] : 'image/png';
  }

  function mimeToExt(mime) {
    if (/jpe?g/i.test(mime)) return 'jpg';
    if (/webp/i.test(mime))  return 'webp';
    if (/png/i.test(mime))   return 'png';
    if (/bmp/i.test(mime))   return 'bmp';
    if (/gif/i.test(mime))   return 'gif';
    return 'png';
  }

  function sanitizeFileName(name) {
    return (name || 'theme')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/^\.+/, '')
      .trim() || 'theme';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // Wandelt ein Bild in einen webp-Thumb mit max. 250 px Breite um.
  function makeThumbDataURL(dataURL) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth <= THUMB_MAX_WIDTH) {
          resolve(dataURL);
          return;
        }
        const scale = THUMB_MAX_WIDTH / img.naturalWidth;
        const w = THUMB_MAX_WIDTH;
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        try {
          const out = canvas.toDataURL('image/webp', 0.85);
          if (!out.startsWith('data:image/webp')) {
            resolve(dataURL);
          } else {
            resolve(out);
          }
        } catch (_) {
          resolve(dataURL);
        }
      };
      img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
      img.src = dataURL;
    });
  }

  // NEU: Skip-Listen lesbar formatieren
  function formatList(arr, max = 3) {
    if (arr.length <= max) return arr.join(', ');
    return arr.slice(0, max).join(', ') + ` … (+${arr.length - max})`;
  }

  // NEU: Übersprungene Dateien gesammelt melden
  function reportSkips(skipped) {
    const parts = [];
    if (skipped.format.length) {
      parts.push(
        `${skipped.format.length} ungültige(s)/fehlerhafte(s) Format(e) übersprungen: ${formatList(skipped.format)}`
      );
    }
    if (skipped.size.length) {
      parts.push(
        `${skipped.size.length} zu große Datei(en) übersprungen: ${formatList(skipped.size)}`
      );
    }
    if (skipped.zip.length) {
      parts.push(`ZIP: ${formatList(skipped.zip)}`);
    }
    if (skipped.overflow.length) {
      parts.push(`Maximum erreicht – ${formatList(skipped.overflow)} übersprungen`);
    }
    uploadErrors.textContent = parts.join(' · ');
  }

  // ---------- ZIP einlesen (erweitert um bmp/gif) ----------
  async function extractFromZip(file) {
    const zip = await JSZip.loadAsync(file);
    const images = [];
    let metaLabel = null;
    const tasks = [];

    zip.forEach((path, entry) => {
      if (entry.dir) return;
      if (path.startsWith('__MACOSX/')) return;
      const baseName = path.split('/').pop() || '';
      if (!baseName || baseName.startsWith('._')) return;

      if (baseName.toLowerCase() === 'theme.json') {
        tasks.push(entry.async('string').then(txt => {
          try {
            const obj = JSON.parse(txt);
            if (obj && typeof obj.label === 'string') metaLabel = obj.label;
          } catch (_) {}
        }));
        return;
      }

      // NEU: bmp und gif zusätzlich akzeptieren
      if (!VALID_EXT_REGEX.test(baseName)) return;

      tasks.push(entry.async('blob').then(blob => {
        const ext = baseName.split('.').pop().toLowerCase();
        const mime =
          (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' :
          (ext === 'bmp')  ? 'image/bmp'  :
          (ext === 'gif')  ? 'image/gif'  :
          `image/${ext}`;
        images.push(new File([blob], baseName, { type: mime }));
      }));
    });

    await Promise.all(tasks);
    images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { images, metaLabel };
  }

  // ---------- Bilder aus Dateien hinzufügen ----------
  // NEU: Ladekreisel bei >1 Bild, Überspringen statt Abbrechen,
  //      Limit-Erkennung mit Skip-Rest.
  async function addImagesFromFiles(files) {
    uploadErrors.textContent = '';
    if (!files || files.length === 0) return;

    const expanded = [];
    let zipMetaLabel = null;
    const skipped = { format: [], size: [], zip: [], overflow: [] };

    // ---- Phase 1: ZIPs entpacken, fehlerhafte ZIPs überspringen ----
    for (const file of files) {
      if (isZipFile(file)) {
        if (file.size > 200 * 1024 * 1024) {
          skipped.zip.push(`${file.name} (zu groß)`);
          continue;
        }
        try {
          const { images, metaLabel } = await extractFromZip(file);
          if (images.length === 0) {
            skipped.zip.push(`${file.name} (keine Bilder)`);
            continue;
          }
          if (metaLabel) zipMetaLabel = metaLabel;
          expanded.push(...images);
        } catch (err) {
          skipped.zip.push(`${file.name} (${err.message || err})`);
        }
      } else {
        expanded.push(file);
      }
    }

    // ---- Phase 2: Format/Größe prüfen, ungültige überspringen ----
    const valid = [];
    for (const file of expanded) {
      const hasValidType = VALID_TYPES.includes(file.type);
      const hasValidExt  = VALID_EXT_REGEX.test(file.name);
      if (!hasValidType && !hasValidExt) {
        skipped.format.push(file.name);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        skipped.size.push(file.name);
        continue;
      }
      valid.push(file);
    }

    // ---- Phase 3: Auf verbleibende Slots begrenzen ----
    const remaining = MAX_IMAGES - editorState.images.length;
    let toProcess = [];
    if (remaining <= 0) {
      if (valid.length > 0) {
        skipped.overflow.push(`${valid.length} Datei(en)`);
      }
    } else if (valid.length > remaining) {
      toProcess = valid.slice(0, remaining);
      skipped.overflow.push(`${valid.length - remaining} Datei(en)`);
    } else {
      toProcess = valid;
    }

    if (toProcess.length === 0) {
      reportSkips(skipped);
      return;
    }

    // ---- Phase 4: Verarbeiten (Ladekreisel bei >1 Datei) ----
    const showSpinner = toProcess.length > 1 && editorLoading;

    if (showSpinner) {
      if (editorLoadingText) {
        editorLoadingText.textContent = `Verarbeite 0 / ${toProcess.length}…`;
      }
      editorLoading.classList.remove('hidden');
    }

    try {
      for (let i = 0; i < toProcess.length; i++) {
        const file = toProcess[i];

        if (showSpinner && editorLoadingText) {
          editorLoadingText.textContent = `Verarbeite ${i + 1} / ${toProcess.length}…`;
        }

        try {
          const dataURL = await readFileAsDataURL(file);
          const thumb   = await makeThumbDataURL(dataURL);
          editorState.images.push({
            name: String(editorState.images.length + 1),
            data: thumb,
            isNew: true,
          });
        } catch (err) {
          skipped.format.push(`${file.name} (Verarbeitung fehlgeschlagen)`);
        }

        // Repaint des Ladekreisels zwischen Dateien ermöglichen
        if (showSpinner) {
          await new Promise(r => requestAnimationFrame(() => r()));
        }
      }
    } finally {
      if (showSpinner) {
        editorLoading.classList.add('hidden');
      }
    }

    if (zipMetaLabel && editorState.mode === 'create' && !themeNameInput.value.trim()) {
      themeNameInput.value = zipMetaLabel.slice(0, 20);
    }

    renderEditorGrid();
    reportSkips(skipped);
  }

  // ---------- Editor-Vorschau rendern ----------
  function renderEditorGrid() {
    themeEditorGrid.innerHTML = '';
    if (editorState.images.length === 0) {
      themeEditorGrid.innerHTML = '<div class="theme-editor-empty">Noch keine Bilder hinzugefügt.</div>';
    } else {
      editorState.images.forEach((img, idx) => {
        const item = document.createElement('div');
        item.className = 'theme-editor-item';
        item.title = 'Klicken zum Löschen';
        const im = document.createElement('img');
        im.src = img.data;
        im.alt = `Bild ${idx + 1}`;
        item.appendChild(im);
        item.addEventListener('click', () => {
          editorState.images.splice(idx, 1);
          renderEditorGrid();
        });
        themeEditorGrid.appendChild(item);
      });
    }
    themeEditorCount.textContent = `${editorState.images.length} / ${MAX_IMAGES} Bilder`;
  }

  // ---------- Editor öffnen ----------
  async function openEditor(mode, themeKey = null) {
    uploadErrors.textContent = '';
    editorState.mode = mode;
    editorState.editThemeKey = themeKey;
    editorState.images = [];
    editorState.existingImages = [];

    if (mode === 'create') {
      themeModalTitle.textContent = 'Neues Thema erstellen';
      themeNameInput.value = '';
      deleteThemeBtnInModal.style.display = 'none';
      exportThemeBtn.style.display = 'none';
    } else {
      const customThemes = getCustomThemes();
      const meta = customThemes[themeKey];
      if (!meta) { alert('Thema nicht gefunden.'); return; }
      themeModalTitle.textContent = 'Thema bearbeiten';
      themeNameInput.value = meta.label;
      deleteThemeBtnInModal.style.display = 'inline-flex';
      exportThemeBtn.style.display = 'inline-flex';

      let stored = [];
      try { stored = await getThemeImages(themeKey); } catch (_) {}
      editorState.existingImages = stored.map(item => ({ name: item.name, data: item.data }));
      editorState.images = stored.map(item => ({
        name: item.name,
        data: item.data,
        isNew: false,
      }));
    }

    renderEditorGrid();
    createModal.classList.remove('hidden');
  }

  function closeEditor() {
    createModal.classList.add('hidden');
    if (editorLoading) editorLoading.classList.add('hidden');
    editorState.images = [];
    editorState.existingImages = [];
    editorState.editThemeKey = null;
  }

  // ---------- Export als ZIP ----------
  async function exportThemeAsZip() {
    uploadErrors.textContent = '';

    if (editorState.images.length === 0) {
      uploadErrors.textContent = 'Keine Bilder zum Exportieren.';
      return;
    }

    const rawName = themeNameInput.value.trim()
      || (getCustomThemes()[editorState.editThemeKey]?.label)
      || 'theme';
    const safeName = sanitizeFileName(rawName);

    exportThemeBtn.disabled = true;
    const originalHtml = exportThemeBtn.innerHTML;
    exportThemeBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Exportiere…';

    try {
      const zip = new JSZip();
      const folder = zip.folder(safeName);

      editorState.images.forEach((img, i) => {
        const base64 = (img.data.split(',')[1]) || '';
        const ext = mimeToExt(dataURLMime(img.data));
        folder.file(`${String(i + 1).padStart(2, '0')}.${ext}`, base64, { base64: true });
      });

      folder.file('theme.json', JSON.stringify({
        label: rawName,
        format: 'webp',
        images: editorState.images.length,
        exportedAt: new Date().toISOString(),
        app: 'Memory',
      }, null, 2));

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      downloadBlob(blob, `${safeName}.zip`);
    } catch (err) {
      uploadErrors.textContent = 'Fehler beim Export: ' + (err.message || err);
    } finally {
      exportThemeBtn.disabled = false;
      exportThemeBtn.innerHTML = originalHtml;
    }
  }

  // ---------- Event-Handler ----------
  openCreateThemeBtn.addEventListener('click', () => {
    openEditor('create');
  });

  editThemeBtn.addEventListener('click', async () => {
    const themeKey = themeSelect.value;
    const customThemes = getCustomThemes();
    if (!customThemes[themeKey]) {
      alert('Nur Custom-Themes können bearbeitet werden.');
      return;
    }
    openEditor('edit', themeKey);
  });

  closeModalBtn.addEventListener('click', closeEditor);

  addImagesBtn.addEventListener('click', () => themeFilesInput.click());

  themeFilesInput.addEventListener('change', async () => {
    const files = Array.from(themeFilesInput.files);
    themeFilesInput.value = '';
    await addImagesFromFiles(files);
  });

  pasteImagesBtn.addEventListener('click', async () => {
    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const ext = type.split('/')[1] || 'png';
            files.push(new File([blob], `clipboard.${ext}`, { type: blob.type }));
          }
        }
      }
      if (files.length === 0) {
        uploadErrors.textContent = 'Keine Bilder in der Zwischenablage gefunden.';
        return;
      }
      await addImagesFromFiles(files);
    } catch (err) {
      uploadErrors.textContent = 'Zwischenablage konnte nicht gelesen werden (Berechtigung?).';
    }
  });

  // Globale Strg+V / Cmd+V-Unterstützung
  document.addEventListener('paste', async (e) => {
    if (createModal.classList.contains('hidden')) return;
    const items = Array.from(e.clipboardData?.items || []);
    const files = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      await addImagesFromFiles(files);
    }
  });

  saveThemeBtn.addEventListener('click', async () => {
    uploadErrors.textContent = '';
    const name = themeNameInput.value.trim();
    if (!name || name.length < 1 || name.length > 20) {
      uploadErrors.textContent = 'Name muss 1–20 Zeichen lang sein.';
      return;
    }

    if (editorState.images.length < 1) {
      uploadErrors.textContent = 'Mindestens 1 Bild erforderlich.';
      return;
    }
    if (editorState.images.length > MAX_IMAGES) {
      uploadErrors.textContent = `Maximal ${MAX_IMAGES} Bilder erlaubt.`;
      return;
    }

    const customThemes = getCustomThemes();

    const isDuplicate = (key, meta) =>
      meta.label === name && !(editorState.mode === 'edit' && key === editorState.editThemeKey);

    if (THEMES[name] || Object.entries(customThemes).some(([k, v]) => isDuplicate(k, v))) {
      uploadErrors.textContent = 'Name bereits vergeben.';
      return;
    }

    const format = 'webp';

    let themeKey = editorState.editThemeKey;
    if (editorState.mode === 'create') {
      themeKey = 'custom_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      while (THEMES[themeKey] || customThemes[themeKey]) {
        themeKey = 'custom_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      }
    }

    const imageDataArray = editorState.images.map((img, i) => ({
      name: String(i + 1),
      data: img.data,
    }));

    try {
      await storeThemeImages(themeKey, imageDataArray);
    } catch (e) {
      uploadErrors.textContent = 'Fehler beim Speichern der Bilder (IndexedDB).';
      return;
    }

    customThemes[themeKey] = {
      label: name,
      custom: true,
      images: imageDataArray.length,
      format: format,
    };
    saveCustomThemes(customThemes);

    // UI aktualisieren
    populateThemeSelect();
    themeSelect.value = themeKey;
    setAppThemeKey(themeKey);
    validateThemeAndGame();
    updateHighscoreDisplay();
    renderThemePreview();

    closeEditor();
  });

  exportThemeBtn.addEventListener('click', exportThemeAsZip);

  deleteThemeBtnInModal.addEventListener('click', async () => {
    if (editorState.mode !== 'edit' || !editorState.editThemeKey) return;
    const themeKey = editorState.editThemeKey;
    const customThemes = getCustomThemes();
    if (!customThemes[themeKey]) {
      alert('Thema nicht gefunden.');
      return;
    }
    if (!confirm(`Thema "${customThemes[themeKey].label}" wirklich löschen?`)) return;

    try {
      await deleteThemeImages(themeKey);
    } catch (e) {
      alert('Fehler beim Löschen der Bilder: ' + e.message);
      return;
    }
    delete customThemes[themeKey];
    saveCustomThemes(customThemes);

    if (getAppState().themeKey === themeKey) {
      setAppThemeKey(Object.keys(THEMES)[0] || '');
    }
    populateThemeSelect();
    updateHighscoreDisplay();
    renderResults();
    renderThemePreview();
    closeEditor();
  });

  // ---------- Öffentliche API für Drag & Drop im Hauptskript ----------
  window.MemoryThemeEditor = {
    openEditor,
    addImagesFromFiles,
    closeEditor,
    getEditorState: () => editorState,
  };
})();