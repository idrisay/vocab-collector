const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "addToVocab",
    title: 'Add "%s" to Vocab',
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "addToVocab" || !info.selectionText) return;

  const word = info.selectionText.trim();
  if (!word) return;

  // Grab surrounding context from the page
  let context = "";
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return "";
        let node = sel.getRangeAt(0).commonAncestorContainer;
        while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
        while (node && node.parentNode) {
          const t = node.innerText || node.textContent || "";
          if (t.trim().length > 80) break;
          node = node.parentNode;
        }
        const full = (node?.innerText || node?.textContent || "").trim();
        const selText = sel.toString();
        const idx = full.indexOf(selText);
        if (idx === -1) return full.slice(0, 800);
        return full.slice(Math.max(0, idx - 300), Math.min(full.length, idx + selText.length + 300));
      },
    });
    context = results?.[0]?.result || "";
  } catch (_) {}

  // Check if word already exists
  const stored = await chrome.storage.local.get(["words", "apiKeys", "apiKey"]);
  const storedWords = stored.words || [];
  const apiKeys = stored.apiKeys || (stored.apiKey ? [stored.apiKey] : ["AIzaSyDvj1RV1AMUnmPQ7k1yUsBaa5gAzB8FfK4"]);

  const existingIdx = storedWords.findIndex(
    (w) => w.word.toLowerCase() === word.toLowerCase()
  );
  const isNew = existingIdx === -1;
  const existingMeaning = isNew ? "" : storedWords[existingIdx].meaning;
  const currentCount = isNew ? 0 : (storedWords[existingIdx].count || 1);

  // Inject content script if not already there, then show the modal
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  } catch (_) {}

  // Show modal on the page immediately
  chrome.tabs.sendMessage(tab.id, {
    type: "showModal",
    word,
    existingMeaning,
    isNew,
    count: currentCount + 1,
  });

  // Fetch AI meaning (only for new words or words without a meaning)
  if (isNew || !existingMeaning) {
    const { meaning, error, keyHint, keyErrors } = await fetchMeaningWithFallback(word, context, apiKeys);
    chrome.tabs.sendMessage(tab.id, { type: "meaningReady", word, meaning, error, keyHint, keyErrors });
  }
});

async function fetchMeaningWithFallback(word, context, apiKeys) {
  const keyErrors = [];

  for (const apiKey of apiKeys) {
    const { meaning, error } = await fetchMeaning(word, context, apiKey);
    if (!error) return { meaning, error: null, keyHint: apiKey.slice(-6), keyErrors };
    keyErrors.push({ keyHint: apiKey.slice(-6), error });
    // Don't try more keys for content-policy blocks — result will be same
    if (error.startsWith("Blocked:")) break;
  }

  const summary = keyErrors.map((e) => `···${e.keyHint}: ${e.error}`).join(" | ");
  return { meaning: "", error: summary, keyHint: null, keyErrors };
}

async function fetchMeaning(word, context, apiKey) {
  const contextPart = context ? `\n\nContext from the page:\n"${context}"` : "";
  const prompt = `You are a vocabulary assistant. Given the word or phrase below, determine its language (English or German), then provide a meaning following these rules:

Word: "${word}"${contextPart}

Rules:
- If the word is ENGLISH → respond in Turkish (give Turkish translation + short explanation)
- If the word is GERMAN → respond in English (give English translation + short explanation)
- Include the detected language at the start in brackets: [English] or [German]
- Keep it under 2 sentences
- No extra commentary, just the answer`;

  try {
    const response = await fetch(GEMINI_URL(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 150, temperature: 0.3 },
      }),
    });
    if (!response.ok) {
      const errBody = await response.text();
      let errMsg = `HTTP ${response.status}`;
      try { errMsg = JSON.parse(errBody)?.error?.message || errMsg; } catch (_) {}
      return { meaning: "", error: errMsg };
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      const blocked = data?.promptFeedback?.blockReason;
      return { meaning: "", error: blocked ? `Blocked: ${blocked}` : "Empty response from AI" };
    }
    return { meaning: text, error: null };
  } catch (err) {
    return { meaning: "", error: err.message };
  }
}

// Handle "Add to list" confirmation from content script modal
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "confirmAdd") {
    chrome.storage.local.get(["words"], (result) => {
      const words = result.words || [];
      const idx = words.findIndex(
        (w) => w.word.toLowerCase() === msg.word.toLowerCase()
      );
      if (idx !== -1) {
        words[idx].count = (words[idx].count || 1) + 1;
        if (msg.meaning) words[idx].meaning = msg.meaning;
        if (msg.lang) words[idx].lang = msg.lang;
      } else {
        words.unshift({
          word: msg.word,
          meaning: msg.meaning || "",
          lang: msg.lang || "EN",
          learned: false,
          count: 1,
          addedAt: Date.now(),
        });
      }
      chrome.storage.local.set({ words }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  // Allow popup to re-trigger AI meaning fetch
  if (msg.type === "refetchMeaning") {
    chrome.storage.local.get(["words", "apiKeys", "apiKey"], async (result) => {
      const words = result.words || [];
      const apiKeys = result.apiKeys || (result.apiKey ? [result.apiKey] : ["AIzaSyDvj1RV1AMUnmPQ7k1yUsBaa5gAzB8FfK4"]);
      const idx = words.findIndex(
        (w) => w.word.toLowerCase() === msg.word.toLowerCase()
      );
      if (idx === -1) { sendResponse({ ok: false }); return; }
      words[idx].loadingMeaning = true;
      words[idx].meaning = "";
      await chrome.storage.local.set({ words });
      const { meaning, error } = await fetchMeaningWithFallback(msg.word, "", apiKeys);
      const r2 = await chrome.storage.local.get(["words"]);
      const w2 = r2.words || [];
      const i2 = w2.findIndex((w) => w.word.toLowerCase() === msg.word.toLowerCase());
      if (i2 !== -1) {
        w2[i2].meaning = error ? `[Error] ${error}` : meaning;
        w2[i2].loadingMeaning = false;
        await chrome.storage.local.set({ words: w2 });
      }
      sendResponse({ ok: true });
    });
    return true;
  }
});
