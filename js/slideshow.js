/* Memory Slideshow – selbstablaufende Bildpräsentation mit Fade & Zoom */
(function () {
  'use strict';

  const DURATION = 4500;              // Anzeigedauer pro Bild (ms)
  const FADE = 900;                   // Ein-/Ausblenddauer (muss zu CSS passen)
  const ZOOM_DURATION = DURATION + FADE;

  let overlay, stage, titleEl, counterEl, progressBar, toggleIcon;
  let images = [];
  let index = 0;
  let playing = true;
  let timer = null;
  let timerStartedAt = 0;
  let timerRemaining = DURATION;

  // ---------------- DOM ----------------
  function ensureDom() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.id = 'slideshowOverlay';
    overlay.className = 'slideshow-overlay hidden';
    overlay.innerHTML = `
      <div class="slideshow-stage" id="ssStage"></div>
      <div class="slideshow-topbar">
        <span class="slideshow-title" id="ssTitle"></span>
        <span class="slideshow-counter" id="ssCounter"></span>
        <button class="ss-btn ss-close" id="ssClose" title="Schließen (Esc)">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>
      <div class="slideshow-controls">
        <button class="ss-btn" id="ssPrev" title="Zurück (←)">
          <i class="bi bi-chevron-left"></i>
        </button>
        <button class="ss-btn" id="ssToggle" title="Pause / Weiter (Leertaste)">
          <i class="bi bi-pause-fill"></i>
        </button>
        <button class="ss-btn" id="ssNext" title="Weiter (→)">
          <i class="bi bi-chevron-right"></i>
        </button>
      </div>
      <div class="slideshow-progress">
        <div class="slideshow-progress-bar" id="ssProgress"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    stage      = overlay.querySelector('#ssStage');
    titleEl    = overlay.querySelector('#ssTitle');
    counterEl  = overlay.querySelector('#ssCounter');
    progressBar = overlay.querySelector('#ssProgress');
    toggleIcon = overlay.querySelector('#ssToggle i');

    overlay.querySelector('#ssClose').addEventListener('click', stop);
    overlay.querySelector('#ssPrev').addEventListener('click', () => goTo(index - 1));
    overlay.querySelector('#ssNext').addEventListener('click', () => goTo(index + 1));
    overlay.querySelector('#ssToggle').addEventListener('click', togglePause);

    document.addEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e) {
    if (!overlay || overlay.classList.contains('hidden')) return;
    switch (e.key) {
      case 'Escape':      e.preventDefault(); stop();             break;
      case 'ArrowRight':  e.preventDefault(); goTo(index + 1);    break;
      case 'ArrowLeft':   e.preventDefault(); goTo(index - 1);    break;
      case ' ':           e.preventDefault(); togglePause();      break;
    }
  }

  // ---------------- Bildanzeige ----------------
  function showImage(idx) {
    if (images.length === 0) return;
    index = ((idx % images.length) + images.length) % images.length;

    const layer = document.createElement('div');
    layer.className = 'slideshow-layer';

    const img = document.createElement('img');
    img.src = images[index];
    img.alt = '';
    img.style.animationDuration = ZOOM_DURATION + 'ms';
    layer.appendChild(img);
    stage.appendChild(layer);

    // Alte Layer ausblenden und danach entfernen
    const oldLayers = Array.from(stage.children).filter(el => el !== layer);
    oldLayers.forEach(el => {
      el.classList.remove('active');
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, FADE + 80);
    });

    // Aktivieren → Fade-In + Ken-Burns-Zoom starten
    requestAnimationFrame(() => {
      requestAnimationFrame(() => layer.classList.add('active'));
    });

    updateCounter();
  }

  function updateCounter() {
    counterEl.textContent = `${index + 1} / ${images.length}`;
  }

  // ---------------- Timer & Fortschritt ----------------
  function restartProgress(duration) {
    progressBar.style.animation = 'none';
    progressBar.style.animationPlayState = 'running';
    void progressBar.offsetWidth;
    progressBar.style.animation = `ssProgress ${duration}ms linear forwards`;
  }

  function pauseAnimations() {
    progressBar.style.animationPlayState = 'paused';
    const active = stage.querySelector('.slideshow-layer.active img');
    if (active) active.style.animationPlayState = 'paused';
  }

  function resumeAnimations() {
    progressBar.style.animationPlayState = 'running';
    const active = stage.querySelector('.slideshow-layer.active img');
    if (active) active.style.animationPlayState = 'running';
  }

  function scheduleNext() {
    clearTimeout(timer);
    if (!playing) return;
    restartProgress(DURATION);
    timerStartedAt = Date.now();
    timerRemaining = DURATION;
    timer = setTimeout(() => {
      showImage(index + 1);
      scheduleNext();
    }, DURATION);
  }

  // ---------------- Steuerung ----------------
  function goTo(newIndex) {
    clearTimeout(timer);
    playing = true;
    updateToggleIcon();
    showImage(newIndex);
    scheduleNext();
  }

  function togglePause() {
    if (playing) {
      playing = false;
      clearTimeout(timer);
      timerRemaining = Math.max(200, DURATION - (Date.now() - timerStartedAt));
      pauseAnimations();
    } else {
      playing = true;
      timerStartedAt = Date.now();
      resumeAnimations();
      timer = setTimeout(() => {
        showImage(index + 1);
        scheduleNext();
      }, timerRemaining);
    }
    updateToggleIcon();
  }

  function updateToggleIcon() {
    if (toggleIcon) toggleIcon.className = playing ? 'bi bi-pause-fill' : 'bi bi-play-fill';
  }

  function stop() {
    clearTimeout(timer);
    timer = null;
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
    while (stage.firstChild) stage.removeChild(stage.firstChild);
    playing = true;
    updateToggleIcon();
  }

  // ---------------- Public API ----------------
  function start(list, title) {
    ensureDom();
    const clean = (list || []).filter(Boolean);
    if (clean.length === 0) {
      alert('Keine Bilder für die Präsentation verfügbar.');
      return;
    }
    images = clean;
    index = 0;
    playing = true;
    titleEl.textContent = title || 'Präsentation';
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    while (stage.firstChild) stage.removeChild(stage.firstChild);
    updateToggleIcon();
    showImage(0);
    scheduleNext();
  }

  window.MemorySlideshow = { start };
})();