export async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    },
    signal: options.signal || AbortSignal.timeout(options.timeoutMs || 15000)
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return response.json();
}

export async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: options.accept || "text/plain",
      ...(options.headers || {})
    },
    signal: options.signal || AbortSignal.timeout(options.timeoutMs || 15000)
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return response.text();
}

export function cleanText(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

