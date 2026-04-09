(() => {
  // Only inject once
  if (window.__vocabCollectorInjected) return;
  window.__vocabCollectorInjected = true;

  let host = null;
  let shadow = null;
  let currentWord = "";
  let selectedLang = "EN";

  function detectWordLang(word) {
    // Simple heuristic: German has umlauts or common short words
    if (/[äöüÄÖÜß]/.test(word)) return "DE";
    const deWords = ["der", "die", "das", "und", "ist", "ein", "eine", "ich", "nicht", "mit", "auf", "von"];
    if (deWords.includes(word.toLowerCase())) return "DE";
    return "EN";
  }

  function removeModal() {
    if (host) {
      host.remove();
      host = null;
      shadow = null;
    }
  }

  function showModal({ word, existingMeaning, isNew, count }) {
    removeModal();
    currentWord = word;
    selectedLang = detectWordLang(word);

    host = document.createElement("div");
    host.id = "vocab-collector-host";
    host.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 0; height: 0;
      z-index: 2147483647;
      pointer-events: none;
    `;

    shadow = host.attachShadow({ mode: "closed" });

    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: all;
          animation: fadeIn 0.15s ease;
        }

        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }

        .card {
          background: #13131c;
          border: 1px solid #2a2a42;
          border-radius: 14px;
          width: 340px;
          padding: 20px 18px 16px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #e8e8f0;
          font-size: 13px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.6);
          animation: slideUp 0.18s ease;
          pointer-events: all;
        }

        .card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 14px;
        }

        .word-area {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .word {
          font-size: 18px;
          font-weight: 700;
          color: #d4caff;
          line-height: 1.2;
          word-break: break-word;
        }

        .count-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 10px;
          background: #1e1e30;
          color: #5a5a80;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .count-badge.mid { background: #1e2e1e; color: #5a9a5a; }
        .count-badge.high { background: #2e1e0a; color: #cc8a40; }

        .close-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #4a4a6a;
          padding: 2px;
          border-radius: 4px;
          font-size: 18px;
          line-height: 1;
          margin-left: 8px;
          flex-shrink: 0;
        }
        .close-btn:hover { color: #9090aa; }

        .lang-row {
          display: flex;
          gap: 6px;
          margin-bottom: 12px;
        }

        .lang-btn {
          flex: 1;
          padding: 6px;
          border-radius: 6px;
          border: 1px solid #2a2a3e;
          background: #1a1a28;
          color: #5a5a8a;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.1s;
        }
        .lang-btn.active.en { background: #1a2a4a; border-color: #3a5a8a; color: #6ab0ff; }
        .lang-btn.active.de { background: #2a1a1a; border-color: #8a3a3a; color: #ff8a6a; }
        .lang-btn:hover:not(.active) { background: #1e1e30; }

        .meaning-section {
          margin-bottom: 14px;
        }

        .meaning-label {
          font-size: 11px;
          color: #5a5a7a;
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .ai-badge {
          font-size: 9px;
          font-weight: 700;
          background: #241a3a;
          color: #9070cc;
          padding: 1px 5px;
          border-radius: 4px;
        }

        .meaning-loading {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #5a5a8a;
          font-size: 12px;
          padding: 10px 10px;
          background: #0f0f1a;
          border-radius: 7px;
          border: 1px solid #1e1e30;
        }

        .spinner {
          width: 13px;
          height: 13px;
          border: 2px solid #2a2a40;
          border-top-color: #7c6aff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .meaning-input {
          width: 100%;
          background: #0f0f1a;
          border: 1px solid #1e1e30;
          border-radius: 7px;
          color: #c8c8e0;
          font-size: 13px;
          padding: 9px 10px;
          outline: none;
          resize: none;
          font-family: inherit;
          line-height: 1.5;
          min-height: 60px;
          transition: border-color 0.15s;
        }
        .meaning-input:focus { border-color: #5a4aaa; }

        .actions {
          display: flex;
          gap: 8px;
        }

        .btn-cancel {
          flex: 0 0 auto;
          padding: 9px 16px;
          border-radius: 7px;
          border: 1px solid #2a2a3e;
          background: none;
          color: #5a5a7a;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.1s;
        }
        .btn-cancel:hover { background: #1e1e2e; color: #9090aa; }

        .btn-add {
          flex: 1;
          padding: 9px;
          border-radius: 7px;
          border: none;
          background: #7c6aff;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.1s;
        }
        .btn-add:hover { background: #6a58e8; }
        .btn-add:disabled { background: #3a3a5a; color: #6a6a8a; cursor: not-allowed; }

        .ai-error {
          display: flex;
          align-items: flex-start;
          gap: 7px;
          background: #2a0f0f;
          border: 1px solid #6a2020;
          border-radius: 7px;
          padding: 8px 10px;
          margin-top: 6px;
        }
        .ai-error-icon { color: #ff6a6a; font-size: 13px; flex-shrink: 0; margin-top: 2px; }
        .ai-error-rows { display: flex; flex-direction: column; gap: 4px; flex: 1; }
        .ai-error-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .ai-error-msg { color: #ff9a9a; font-size: 12px; line-height: 1.4; flex: 1; }
        .ai-error-key {
          font-size: 10px;
          color: #7a4a4a;
          background: #1e0a0a;
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
          font-family: monospace;
          flex-shrink: 0;
        }

        .already-badge {
          display: inline-block;
          font-size: 10px;
          background: #1a2a1a;
          color: #5a9a5a;
          padding: 2px 7px;
          border-radius: 4px;
          margin-bottom: 10px;
        }
      </style>

      <div class="overlay" id="overlay">
        <div class="card" id="card">
          <div class="card-header">
            <div class="word-area">
              <span class="word" id="wordDisplay">${escapeHtml(word)}</span>
              <span class="count-badge ${count >= 5 ? "high" : count >= 3 ? "mid" : ""}" id="countBadge">×${count}</span>
            </div>
            <button class="close-btn" id="closeBtn">×</button>
          </div>

          ${!isNew ? `<div class="already-badge">Already in your list</div>` : ""}

          <div class="lang-row">
            <button class="lang-btn en ${selectedLang === "EN" ? "active en" : ""}" data-lang="EN">English</button>
            <button class="lang-btn de ${selectedLang === "DE" ? "active de" : ""}" data-lang="DE">Deutsch</button>
          </div>

          <div class="meaning-section">
            <div class="meaning-label">
              Meaning <span class="ai-badge">AI</span>
            </div>
            ${existingMeaning
              ? `<textarea class="meaning-input" id="meaningInput">${escapeHtml(existingMeaning)}</textarea>`
              : `<div class="meaning-loading" id="meaningLoading">
                  <div class="spinner"></div> AI meaning is being generated...
                </div>
                <textarea class="meaning-input" id="meaningInput" style="display:none"></textarea>`
            }
          </div>

          <div class="actions">
            <button class="btn-cancel" id="cancelBtn">Cancel</button>
            <button class="btn-add" id="addBtn">${isNew ? "Add to List" : "Update"}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(host);

    // Wire up events
    shadow.getElementById("closeBtn").addEventListener("click", removeModal);
    shadow.getElementById("cancelBtn").addEventListener("click", removeModal);

    shadow.getElementById("overlay").addEventListener("click", (e) => {
      if (e.target === shadow.getElementById("overlay")) removeModal();
    });

    shadow.querySelectorAll(".lang-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedLang = btn.dataset.lang;
        shadow.querySelectorAll(".lang-btn").forEach((b) => {
          b.className = `lang-btn ${b.dataset.lang.toLowerCase()}`;
        });
        btn.className = `lang-btn ${selectedLang.toLowerCase()} active ${selectedLang.toLowerCase()}`;
      });
    });

    shadow.getElementById("addBtn").addEventListener("click", () => {
      const meaningEl = shadow.getElementById("meaningInput");
      const meaning = meaningEl ? meaningEl.value.trim() : "";
      chrome.runtime.sendMessage(
        { type: "confirmAdd", word: currentWord, meaning, lang: selectedLang },
        () => {
          showToast(`"${currentWord}" added!`);
          removeModal();
        }
      );
    });

    // Keyboard: Escape to close
    document.addEventListener("keydown", onKeyDown);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      removeModal();
      document.removeEventListener("keydown", onKeyDown);
    }
  }

  function updateMeaning(word, meaning, error, keyHint, keyErrors) {
    if (!shadow || word.toLowerCase() !== currentWord.toLowerCase()) return;
    const loading = shadow.getElementById("meaningLoading");
    if (loading) loading.style.display = "none";

    const prevErr = shadow.getElementById("aiError");
    if (prevErr) prevErr.remove();

    if (error) {
      const errBox = document.createElement("div");
      errBox.id = "aiError";
      errBox.className = "ai-error";

      const rows = (keyErrors && keyErrors.length > 0 ? keyErrors : [{ keyHint: keyHint || "?", error }]);
      const rowsHtml = rows.map((e) => `
        <div class="ai-error-row">
          <span class="ai-error-msg">${escapeHtml(e.error)}</span>
          <span class="ai-error-key">···${escapeHtml(e.keyHint)}</span>
        </div>
      `).join("");

      errBox.innerHTML = `<span class="ai-error-icon">⚠</span><div class="ai-error-rows">${rowsHtml}</div>`;
      const section = shadow.querySelector(".meaning-section");
      if (section) section.appendChild(errBox);
      return;
    }

    const input = shadow.getElementById("meaningInput");
    if (input) {
      input.style.display = "block";
      input.value = meaning;
      input.focus();
      input.setSelectionRange(meaning.length, meaning.length);
    }
  }

  function showToast(message) {
    const toastHost = document.createElement("div");
    toastHost.style.cssText = `
      position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647; pointer-events: none;
    `;
    const toastShadow = toastHost.attachShadow({ mode: "closed" });
    toastShadow.innerHTML = `
      <style>
        .toast {
          background: #7c6aff;
          color: #fff;
          padding: 9px 20px;
          border-radius: 20px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          animation: pop 0.2s ease;
          box-shadow: 0 8px 24px rgba(124,106,255,0.4);
        }
        @keyframes pop { from { opacity:0; transform:scale(0.9) } to { opacity:1; transform:scale(1) } }
      </style>
      <div class="toast">${escapeHtml(message)}</div>
    `;
    document.body.appendChild(toastHost);
    setTimeout(() => toastHost.remove(), 2000);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "showModal") {
      showModal(msg);
    } else if (msg.type === "meaningReady") {
      updateMeaning(msg.word, msg.meaning, msg.error, msg.keyHint, msg.keyErrors);
    }
  });
})();
