import { fetchWebMetadata } from "./web.js";

function isSsrnUrl(value) {
  return /ssrn\.com|papers\.ssrn\.com/i.test(String(value || ""));
}

function inferSsrnUrls(query, options = {}) {
  const urls = options.ssrnUrls || options.webUrls || [];
  if (urls.length) {
    return urls.filter(isSsrnUrl);
  }

  const trimmed = String(query || "").trim();
  if (isSsrnUrl(trimmed)) {
    return [trimmed];
  }

  return [];
}

function normalizeSsrnPaper(paper) {
  return {
    ...paper,
    source: "ssrn",
    provider: "ssrn",
    categories: [...new Set([...(paper.categories || []), "ssrn_preprint"])]
  };
}

export async function searchSsrn(query, options = {}) {
  const urls = inferSsrnUrls(query, options);
  if (!urls.length) {
    throw new Error("SSRN provider currently supports direct SSRN URLs via --web-url or an SSRN URL query.");
  }

  const results = await Promise.all(
    urls.map((url) =>
      fetchWebMetadata(url, {
        timeoutMs: options.timeoutMs,
        userAgent: options.userAgent
      })
    )
  );

  return results.map(normalizeSsrnPaper);
}
