(async () => {
  console.log("[BatchExtractor] Loading source strings...");
  const resp = await fetch("./translation/main.json");
  const sourceDict = await resp.json();
  const allKeys = Object.keys(sourceDict);
  const total = allKeys.length;
  console.log(`[BatchExtractor] Total: ${total}`);

  const fragments = new Set();
  const BATCH = 100;
  let idx = 0;

  const processOne = (raw) => {
    if (typeof raw !== "string" || !/[a-zA-Z]/.test(raw)) return;
    try {
      const textified = window.textify?.([raw]) ?? raw;
      const parsed = window.Parser?.parse?.(textified) ?? textified;
      const div = document.createElement("div");
      div.innerHTML = parsed;
      const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const t = walker.currentNode.textContent;
        if (t && t.trim()) fragments.add(t);
      }
    } catch (e) {}
  };

  const processBatch = () => {
    const start = idx;
    const end = Math.min(idx + BATCH, total);
    for (let i = start; i < end; i++) processOne(allKeys[i]);
    idx = end;
    console.log(`[BatchExtractor] ${idx}/${total}`);
    if (idx < total) setTimeout(processBatch, 50);
    else {
      const out = {};
      fragments.forEach(f => out[f] = "");
      const blob = new Blob([JSON.stringify(out, null, 2)], {type:"application/json"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "runtime_fragments.json";
      a.click();
      console.log(`[BatchExtractor] Done! ${fragments.size} fragments saved.`);
    }
  };

  processBatch();
})();