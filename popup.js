const wordInput = document.getElementById("wordInput");
const meaningInput = document.getElementById("meaningInput");
const langSelect = document.getElementById("langSelect");
const addBtn = document.getElementById("addBtn");
const wordList = document.getElementById("wordList");
const searchInput = document.getElementById("searchInput");
const filterLang = document.getElementById("filterLang");
const filterStatus = document.getElementById("filterStatus");
const wordCount = document.getElementById("wordCount");
const emptyState = document.getElementById("emptyState");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const apiKeyInput = document.getElementById("apiKeyInput");
const addApiKeyBtn = document.getElementById("addApiKey");
const apiKeyList = document.getElementById("apiKeyList");
const exportBtn = document.getElementById("exportBtn");

let allWords = [];
let refreshTimer = null;

// --- Settings: multi-key management ---
function renderApiKeys(keys) {
  apiKeyList.innerHTML = "";
  if (!keys.length) {
    apiKeyList.innerHTML = '<li class="no-keys">No keys added yet.</li>';
    return;
  }
  keys.forEach((key, i) => {
    const li = document.createElement("li");
    li.className = "api-key-item";

    const label = document.createElement("span");
    label.className = "api-key-label";
    label.textContent = `#${i + 1}  ····${key.slice(-8)}`;

    const del = document.createElement("button");
    del.className = "api-key-del";
    del.title = "Remove key";
    del.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    del.addEventListener("click", () => {
      keys.splice(i, 1);
      chrome.storage.local.set({ apiKeys: keys }, () => renderApiKeys(keys));
    });

    li.appendChild(label);
    li.appendChild(del);
    apiKeyList.appendChild(li);
  });
}

settingsBtn.addEventListener("click", () => {
  const open = settingsPanel.style.display !== "none";
  settingsPanel.style.display = open ? "none" : "block";
  if (!open) {
    chrome.storage.local.get(["apiKeys", "apiKey"], (r) => {
      // migrate legacy single key
      const keys = r.apiKeys || (r.apiKey ? [r.apiKey] : []);
      renderApiKeys(keys);
    });
  }
});

addApiKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  chrome.storage.local.get(["apiKeys", "apiKey"], (r) => {
    const keys = r.apiKeys || (r.apiKey ? [r.apiKey] : []);
    if (!keys.includes(key)) {
      keys.push(key);
      chrome.storage.local.set({ apiKeys: keys }, () => {
        apiKeyInput.value = "";
        renderApiKeys(keys);
      });
    } else {
      apiKeyInput.value = "";
    }
  });
});

apiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addApiKeyBtn.click();
});

// --- Export CSV ---
exportBtn.addEventListener("click", () => {
  if (!allWords.length) return;

  const escape = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;

  const header = ["Word", "Language", "Meaning", "Learned", "Times Selected", "Added At"];
  const rows = allWords.map((w) => [
    escape(w.word),
    escape(w.lang),
    escape(w.meaning),
    escape(w.learned ? "Yes" : "No"),
    escape(w.count ?? 1),
    escape(w.addedAt ? new Date(w.addedAt).toISOString().slice(0, 10) : ""),
  ]);

  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vocab_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// --- Storage helpers ---
function saveAndRender(words) {
  allWords = words;
  chrome.storage.local.set({ words });
  render();
}

// --- Render ---
function render() {
  const query = searchInput.value.toLowerCase();
  const lang = filterLang.value;
  const status = filterStatus.value;

  const filtered = allWords.filter((w) => {
    const matchSearch =
      w.word.toLowerCase().includes(query) ||
      (w.meaning || "").toLowerCase().includes(query);
    const matchLang = lang === "ALL" || w.lang === lang;
    const matchStatus =
      status === "ALL" ||
      (status === "learned" && w.learned) ||
      (status === "review" && !w.learned);
    return matchSearch && matchLang && matchStatus;
  });

  wordList.innerHTML = "";
  wordCount.textContent = `${allWords.length} word${allWords.length !== 1 ? "s" : ""}`;
  emptyState.style.display = allWords.length === 0 ? "block" : "none";

  const hasLoading = allWords.some((w) => w.loadingMeaning);
  // Auto-refresh while any word is still loading AI meaning
  if (hasLoading && !refreshTimer) {
    refreshTimer = setInterval(() => {
      chrome.storage.local.get(["words"], (r) => {
        allWords = r.words || [];
        render();
      });
    }, 1500);
  } else if (!hasLoading && refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  filtered.forEach((w) => {
    const realIndex = allWords.indexOf(w);
    const li = document.createElement("li");
    li.className = `word-item ${w.learned ? "learned" : ""}`;

    // --- Top row ---
    const topRow = document.createElement("div");
    topRow.className = "top-row";

    const langBadge = document.createElement("span");
    langBadge.className = `lang-badge lang-${w.lang.toLowerCase()}`;
    langBadge.textContent = w.lang;

    const wordSpan = document.createElement("span");
    wordSpan.className = "word-text";
    wordSpan.textContent = w.word;

    // Selection count badge
    const countBadge = document.createElement("span");
    countBadge.className = "count-badge";
    countBadge.title = "Times selected";
    const count = w.count || 1;
    countBadge.textContent = `×${count}`;
    if (count >= 5) countBadge.classList.add("count-high");
    else if (count >= 3) countBadge.classList.add("count-mid");

    // Lang toggle
    const langToggle = document.createElement("button");
    langToggle.className = "btn-icon btn-lang";
    langToggle.title = "Toggle language";
    langToggle.textContent = w.lang === "EN" ? "DE" : "EN";
    langToggle.addEventListener("click", () => {
      allWords[realIndex].lang = w.lang === "EN" ? "DE" : "EN";
      saveAndRender(allWords);
    });

    // Learned toggle
    const learnBtn = document.createElement("button");
    learnBtn.className = `btn-icon ${w.learned ? "btn-review" : "btn-learned"}`;
    learnBtn.title = w.learned ? "Mark as to review" : "Mark as learned";
    learnBtn.innerHTML = w.learned
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    learnBtn.addEventListener("click", () => {
      allWords[realIndex].learned = !w.learned;
      saveAndRender(allWords);
    });

    // Delete
    const delBtn = document.createElement("button");
    delBtn.className = "btn-icon btn-delete";
    delBtn.title = "Delete word";
    delBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    delBtn.addEventListener("click", () => {
      allWords.splice(realIndex, 1);
      saveAndRender(allWords);
    });

    topRow.appendChild(langBadge);
    topRow.appendChild(wordSpan);
    topRow.appendChild(countBadge);
    topRow.appendChild(langToggle);
    topRow.appendChild(learnBtn);
    topRow.appendChild(delBtn);

    // --- Meaning row ---
    const meaningRow = document.createElement("div");
    meaningRow.className = "meaning-row-display";

    if (w.loadingMeaning) {
      const loader = document.createElement("div");
      loader.className = "meaning-loading";
      loader.innerHTML = `<span class="spinner"></span> AI anlam getiriliyor...`;
      meaningRow.appendChild(loader);
    } else {
      const meaningEl = document.createElement("input");
      meaningEl.type = "text";
      meaningEl.className = "meaning-input";
      meaningEl.placeholder = "Anlam ekle...";
      meaningEl.value = w.meaning || "";
      meaningEl.addEventListener("change", () => {
        allWords[realIndex].meaning = meaningEl.value.trim();
        chrome.storage.local.set({ words: allWords });
      });

      // Re-fetch AI meaning button
      const aiBtn = document.createElement("button");
      aiBtn.className = "btn-icon btn-ai";
      aiBtn.title = "Re-fetch AI meaning";
      aiBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.491-5.777"/></svg>`;
      aiBtn.addEventListener("click", () => {
        allWords[realIndex].loadingMeaning = true;
        allWords[realIndex].meaning = "";
        saveAndRender(allWords);
        chrome.runtime.sendMessage({ type: "refetchMeaning", word: w.word });
      });

      meaningRow.appendChild(meaningEl);
      meaningRow.appendChild(aiBtn);
    }

    li.appendChild(topRow);
    li.appendChild(meaningRow);
    wordList.appendChild(li);
  });
}

// --- Add word manually ---
function addWord() {
  const word = wordInput.value.trim();
  const meaning = meaningInput.value.trim();
  const lang = langSelect.value;
  if (!word) return;

  const existingIdx = allWords.findIndex(
    (w) => w.word.toLowerCase() === word.toLowerCase()
  );

  if (existingIdx !== -1) {
    if (meaning) allWords[existingIdx].meaning = meaning;
    allWords[existingIdx].lang = lang;
    allWords[existingIdx].count = (allWords[existingIdx].count || 1) + 1;
    saveAndRender(allWords);
  } else {
    const newWord = {
      word,
      meaning,
      lang,
      learned: false,
      count: 1,
      addedAt: Date.now(),
      loadingMeaning: !meaning, // fetch AI meaning only if no meaning provided
    };
    allWords.unshift(newWord);
    saveAndRender(allWords);

    if (!meaning) {
      chrome.runtime.sendMessage({ type: "refetchMeaning", word });
    }
  }

  wordInput.value = "";
  meaningInput.value = "";
  wordInput.focus();
}

addBtn.addEventListener("click", addWord);
wordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") meaningInput.focus();
});
meaningInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addWord();
});
searchInput.addEventListener("input", render);
filterLang.addEventListener("change", render);
filterStatus.addEventListener("change", render);

// --- Init ---
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["words", "pendingWord"], (result) => {
    allWords = result.words || [];

    if (result.pendingWord) {
      const pending = allWords.find(
        (w) => w.word.toLowerCase() === result.pendingWord.toLowerCase()
      );
      if (pending && !pending.meaning && !pending.loadingMeaning) {
        wordInput.value = pending.word;
        langSelect.value = pending.lang || "EN";
        meaningInput.focus();
      }
      chrome.storage.local.remove("pendingWord");
    }

    render();
  });
});
