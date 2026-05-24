// news.js — Fetch Minecraft news and translate if needed

const NEWS_CACHE_KEY = 'yolo_news_cache';
const CACHE_TTL_MS = 15 * 60 * 1000;
const TRANSLATE_CACHE_KEY = 'yolo_translate_cache';

// In-memory + localStorage translation cache
let translateMemCache = {};
try {
  translateMemCache = JSON.parse(localStorage.getItem(TRANSLATE_CACHE_KEY)) || {};
} catch { translateMemCache = {}; }

function saveTranslateCache() {
  try {
    // Only keep last 100 entries
    const keys = Object.keys(translateMemCache);
    if (keys.length > 100) {
      const toRemove = keys.slice(0, keys.length - 100);
      toRemove.forEach(k => delete translateMemCache[k]);
    }
    localStorage.setItem(TRANSLATE_CACHE_KEY, JSON.stringify(translateMemCache));
  } catch {}
}

/**
 * Fetches Minecraft patch notes / news from Mojang's launcher content API.
 */
export async function fetchMinecraftNews() {
  try {
    const cached = JSON.parse(localStorage.getItem(NEWS_CACHE_KEY));
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.articles;
    }
  } catch {}

  try {
    const res = await fetch('https://launchercontent.mojang.com/v2/javaPatchNotes.json', {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const articles = (data.entries || []).slice(0, 20).map(entry => ({
        id: entry.id || entry.version,
        title: entry.title || `Minecraft ${entry.version}`,
        summary: entry.shortText || stripHtml(entry.body || '').slice(0, 200) + '…',
        body: entry.body || '',
        image: entry.image?.url
          ? (entry.image.url.startsWith('http')
              ? entry.image.url
              : `https://launchercontent.mojang.com${entry.image.url}`)
          : null,
        date: entry.date || null,
        url: buildArticleUrl(entry),
        lang: 'en',
        tag: entry.type || 'release',
        version: entry.version || null,
      }));
      localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ ts: Date.now(), articles }));
      return articles;
    }
  } catch (e) {
    console.warn('[news] Primary source failed:', e);
  }

  try {
    const res = await fetch(
      'https://minecraft.wiki/api.php?action=query&list=categorymembers&cmtitle=Category:Java_Edition_versions&cmlimit=10&format=json&origin=*',
      { signal: AbortSignal.timeout(6000) }
    );
    if (res.ok) {
      const data = await res.json();
      return (data.query?.categorymembers || []).map(item => ({
        id: String(item.pageid),
        title: item.title,
        summary: '',
        body: '',
        image: null,
        date: null,
        url: `https://minecraft.wiki/w/${encodeURIComponent(item.title)}`,
        lang: 'en',
        tag: 'release',
        version: null,
      }));
    }
  } catch {}
  return [];
}

function buildArticleUrl(entry) {
  if (entry.articleUrl && entry.articleUrl.startsWith('http')) return entry.articleUrl;
  const version = entry.version;
  const type = entry.type || 'release';
  if (!version) return null;
  if (type === 'release') {
    return `https://www.minecraft.net/en-us/article/minecraft-java-edition-${version.replace(/\./g, '-')}`;
  }
  if (type === 'snapshot') {
    if (/^\d{2}w\d{2}[a-z]$/i.test(version)) {
      return `https://www.minecraft.net/en-us/article/minecraft-snapshot-${version.toLowerCase()}`;
    }
    const pre = version.match(/^([\d.]+)-pre(\d+)$/);
    if (pre) return `https://www.minecraft.net/en-us/article/minecraft-java-edition-${pre[1].replace(/\./g,'-')}-pre-release-${pre[2]}`;
    const rc = version.match(/^([\d.]+)-rc(\d+)$/);
    if (rc) return `https://www.minecraft.net/en-us/article/minecraft-java-edition-${rc[1].replace(/\./g,'-')}-release-candidate-${rc[2]}`;
  }
  return `https://minecraft.wiki/w/Java_Edition_${encodeURIComponent(version)}`;
}

/**
 * Translate text from English to Russian via MyMemory API.
 * Includes persistent caching and robust validation.
 */
export async function translateToRu(text) {
  if (!text || text.trim().length < 3) return text;

  // Check cache first
  const cacheKey = text.slice(0, 200);
  if (translateMemCache[cacheKey]) return translateMemCache[cacheKey];

  // Split into chunks
  const chunks = splitIntoChunks(text, 450);
  const translated = [];

  for (const chunk of chunks) {
    const result = await translateSingleChunk(chunk);
    translated.push(result);
  }

  const full = translated.join(' ');

  // Only cache if translation actually changed
  if (full !== text) {
    translateMemCache[cacheKey] = full;
    saveTranslateCache();
  }

  return full;
}

async function translateSingleChunk(text) {
  if (!text || !text.trim()) return text;

  // MyMemory (primary)
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ru`;
    console.log('[translate] Requesting MyMemory for:', text.slice(0, 50) + '...');
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    
    if (res.ok) {
      const data = await res.json();
      console.log('[translate] MyMemory response:', JSON.stringify(data.responseData).slice(0, 200));
      
      const tr = data.responseData?.translatedText;
      if (tr && data.responseStatus === 200
          && tr !== text
          && !tr.includes('MYMEMORY WARNING')
          && !tr.toUpperCase().includes('QUOTA')
          && !tr.toUpperCase().includes('LIMIT')
          && tr.length > 2) {
        return tr;
      }
    }
  } catch (e) {
    console.warn('[translate] MyMemory error:', e);
  }

  // Lingva Translate (secondary) — free, no key required
  try {
    const url = `https://lingva.ml/api/v1/en/ru/${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      if (data.translation && data.translation !== text) {
        return data.translation;
      }
    }
  } catch (e) {
    console.warn('[translate] Lingva failed:', e);
  }

  return text;
}

function splitIntoChunks(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length);
    if (end < text.length) {
      const dot = text.lastIndexOf('. ', end);
      if (dot > start) end = dot + 2;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks;
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function clearNewsCache() {
  localStorage.removeItem(NEWS_CACHE_KEY);
  localStorage.removeItem(TRANSLATE_CACHE_KEY);
  translateMemCache = {};
}
