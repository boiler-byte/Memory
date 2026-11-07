/* ============================================================
   Memory v2 - Tresor
   - Geschlossene Tresor-Themen werden aus der Benutzeroberflaeche gefiltert.
   - Der Passwort-Pruefwert wird mit PBKDF2-SHA-256 und zufaelligem Salt
     gespeichert; das Klartext-Passwort wird nicht persistiert.
   - Die Bilddaten bleiben wie bisher lokal in IndexedDB. Der Tresor ist
     ein Sichtschutz, keine Verschluesselung gespeicherter Dateien.
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'memory_vault_config';
  const ITERATIONS = 210000;
  const encoder = new TextEncoder();

  const app = window.MemoryApp;
  const toggle = document.getElementById('vaultToggleBtn');
  const createModal = document.getElementById('vaultCreateModal');
  const unlockModal = document.getElementById('vaultUnlockModal');
  const createForm = document.getElementById('vaultCreateForm');
  const unlockForm = document.getElementById('vaultUnlockForm');
  const createTitle = document.getElementById('vaultCreateTitle');
  const newPassword = document.getElementById('vaultNewPassword');
  const repeatPassword = document.getElementById('vaultRepeatPassword');
  const currentPassword = document.getElementById('vaultCurrentPassword');
  const createError = document.getElementById('vaultCreateError');
  const unlockError = document.getElementById('vaultUnlockError');
  const changeBtn = document.getElementById('vaultChangePassword');
  const unlockBtn = document.getElementById('vaultUnlockSubmit');
  const saveBtn = document.getElementById('vaultSavePassword');

  function readConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (value && value.version === 1 && value.algorithm === 'PBKDF2-SHA-256' &&
          Number.isInteger(value.iterations) && value.iterations >= 100000 &&
          typeof value.salt === 'string' && typeof value.verifier === 'string') {
        return value;
      }
    } catch (_) { /* Keine benutzbare Konfiguration. */ }
    return null;
  }

  // Der Tresor ist nur vor der allerersten Passwort-Erstellung standardmaessig offen.
  // Nach dem Anlegen eines Passworts wird er bei einem Neustart geschlossen.
  let vaultOpen = !readConfig();
  let createMode = 'initial';
  let busy = false;

  const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
  const fromBase64 = base64 => Uint8Array.from(atob(base64), c => c.charCodeAt(0));

  async function deriveVerifier(password, salt, iterations) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('Die Passwortfunktion benötigt einen sicheren Browser-Kontext (HTTPS oder localhost).');
    }
    const key = await window.crypto.subtle.importKey(
      'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await window.crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256
    );
    return new Uint8Array(bits);
  }

  async function newConfig(password) {
    if (!window.crypto || !window.crypto.getRandomValues) {
      throw new Error('Der Browser unterstützt keine sichere Zufallszahlenerzeugung.');
    }
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const hash = await deriveVerifier(password, salt, ITERATIONS);
    return {
      version: 1,
      algorithm: 'PBKDF2-SHA-256',
      iterations: ITERATIONS,
      salt: toBase64(salt),
      verifier: toBase64(hash),
    };
  }

  async function verifyPassword(password) {
    const stored = readConfig();
    if (!stored) return false;
    const candidate = await deriveVerifier(password, fromBase64(stored.salt), stored.iterations);
    const expected = fromBase64(stored.verifier);
    if (candidate.length !== expected.length) return false;
    let difference = 0;
    for (let i = 0; i < candidate.length; i++) difference |= candidate[i] ^ expected[i];
    return difference === 0;
  }

  function isHidden(themeKey) {
    if (vaultOpen || !themeKey) return false;
    return app.getCustomThemes()[themeKey]?.vault === true;
  }

  function renderToggle() {
    const locked = !vaultOpen;
    const label = locked ? 'Tresor öffnen' : 'Tresor schließen';
    toggle.setAttribute('aria-pressed', String(locked));
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.querySelector('i').className = locked ? 'bi bi-lock-fill' : 'bi bi-unlock';
  }

  function setOpen(isOpen) {
    vaultOpen = isOpen;
    renderToggle();
    app.refreshVaultUi();
  }

  function setBusy(value) {
    busy = value;
    [toggle, saveBtn, unlockBtn, changeBtn].forEach(button => { button.disabled = value; });
  }

  function resetVisibility(modal) {
    for (const button of modal.querySelectorAll('[data-password-target]')) {
      const input = document.getElementById(button.dataset.passwordTarget);
      input.type = 'password';
      button.setAttribute('aria-label', 'Passwort anzeigen');
      button.title = 'Passwort anzeigen';
      button.querySelector('i').className = 'bi bi-eye';
    }
  }

  function closeDialogs() {
    createModal.classList.add('hidden');
    unlockModal.classList.add('hidden');
    createForm.reset();
    unlockForm.reset();
    createError.textContent = '';
    unlockError.textContent = '';
    resetVisibility(createModal);
    resetVisibility(unlockModal);
    toggle.focus();
  }

  function showCreate(mode) {
    closeDialogs();
    createMode = mode;
    createTitle.innerHTML = mode === 'change'
      ? '<i class="bi bi-shield-lock"></i> Tresor-Passwort ändern'
      : '<i class="bi bi-shield-lock"></i> Tresor-Passwort erstellen';
    createModal.classList.remove('hidden');
    newPassword.focus();
  }

  function showUnlock() {
    closeDialogs();
    unlockModal.classList.remove('hidden');
    currentPassword.focus();
  }

  toggle.addEventListener('click', () => {
    if (busy) return;
    if (vaultOpen) {
      if (!readConfig()) {
        showCreate('initial');
      } else {
        setOpen(false);
      }
    } else {
      showUnlock();
    }
  });

  document.getElementById('vaultCancelCreate').addEventListener('click', closeDialogs);
  document.getElementById('vaultCancelUnlock').addEventListener('click', closeDialogs);

  document.querySelectorAll('[data-password-target]').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.passwordTarget);
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-label', visible ? 'Passwort verbergen' : 'Passwort anzeigen');
      button.title = visible ? 'Passwort verbergen' : 'Passwort anzeigen';
      button.querySelector('i').className = visible ? 'bi bi-eye-slash' : 'bi bi-eye';
      input.focus();
    });
  });

  createForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    createError.textContent = '';
    const first = newPassword.value;
    const second = repeatPassword.value;
    if (first.length < 1) {
      createError.textContent = 'Das Passwort muss mindestens 1 Zeichen enthalten.';
      newPassword.focus();
      return;
    }
    if (first !== second) {
      createError.textContent = 'Die Passwörter stimmen nicht überein.';
      repeatPassword.focus();
      return;
    }
    setBusy(true);
    try {
      const config = await newConfig(first);
      // Eine Aenderung ist nur nach erfolgreicher Pruefung des alten Passworts moeglich.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      const shouldOpen = createMode === 'change';
      closeDialogs();
      setOpen(shouldOpen);
    } catch (error) {
      createError.textContent = error.message || 'Passwort konnte nicht gespeichert werden.';
    } finally {
      setBusy(false);
    }
  });

  async function checkCurrentPassword(mode) {
    if (busy) return;
    unlockError.textContent = '';
    if (!currentPassword.value) {
      unlockError.textContent = 'Bitte Passwort eingeben.';
      return;
    }
    setBusy(true);
    try {
      const correct = await verifyPassword(currentPassword.value);
      if (!correct) {
        unlockError.textContent = 'Falsches Passwort.';
        currentPassword.focus();
        currentPassword.select();
        return;
      }
      if (mode === 'change') {
        showCreate('change');
      } else {
        closeDialogs();
        setOpen(true);
      }
    } catch (error) {
      unlockError.textContent = error.message || 'Passwort konnte nicht geprüft werden.';
    } finally {
      setBusy(false);
    }
  }

  unlockForm.addEventListener('submit', event => {
    event.preventDefault();
    checkCurrentPassword('unlock');
  });
  changeBtn.addEventListener('click', () => checkCurrentPassword('change'));

  document.addEventListener('keydown', event => {
    const modal = !createModal.classList.contains('hidden') ? createModal
      : !unlockModal.classList.contains('hidden') ? unlockModal : null;
    if (!modal || busy) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialogs();
    }
    // Fokus bleibt in dem jeweils aktiven Passwortdialog.
    if (event.key === 'Tab') {
      const elements = [...modal.querySelectorAll('input, button')].filter(el => !el.disabled);
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }
  });

  renderToggle();
  window.MemoryVault = { isHidden, isOpen: () => vaultOpen };
})();
