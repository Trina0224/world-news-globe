# Keyword search — 2026-10-17

Frontend and Worker version: `2026-10-17.1`.

## Request control

All keyword triggers use one request controller. Repeated requests for the same
country, region, and committed keyword share an in-flight request. Cleanup checks
the request object's identity: a late A1 cannot clear a newer A2 after A → B → A.
Clear, empty-input Search, and Back to World invalidate the prior request. Static
news also checks the shared generation and location before writing to the panel.
A separate 15-second settlement deadline releases the slot even if fetch abort
settles late. Editing text alone does not commit it; Search does. Selecting a new
country continues to search the committed keyword, as before.

## Localization and upstream load

Common topics use a multilingual dictionary. `election` becomes `選舉` for Taiwan,
`選挙` for Japan, and `élection` for France. Other terms may use the existing
`@cf/meta/m2m100-1.2b` Workers AI binding with a 1.2-second wait limit. No new API key,
paid subscription, binding, or credit-card setup is introduced. Existing account
quotas/billing still apply. Missing binding, quota exhaustion, timeout, or invalid
translation falls back to the original term and is labelled in the UI.

This is best-effort localization, not a universal language detector: source-script
heuristics can be ambiguous, especially shared Han characters and short Latin
words. API callers can specify `source_language`. Known brand names and acronyms
are preserved. The current country-edition table still has limited coverage;
unknown countries use its existing English/US fallback and expose
`edition.fallback=true`. Multilingual countries still use one configured edition.

Exactly one final keyword query is sent to Google News, with at most one retry.
Each attempt has a 4-second deadline covering headers, body, and RSS validation.
Permanent 4xx and invalid RSS are not retried. Long Retry-After instructions do
not cause immediate retry. Successful responses are ranked as before; this change
is not an editorial-quality improvement.

Successful same-query results may be reused for two minutes. On an upstream
error only, a same-query result less than ten minutes old may be shown with a
stale/cache-age label. Valid zero-result responses stay empty, and errors/empty
results are never stored as successful cache entries. "Refresh this area" bypasses
the fresh-cache shortcut. Cache availability is best effort and not required for
correctness. There is no fallback to unrelated ordinary headlines.

## Diagnostics and testing

`POST /keyword` returns `request_id`, `version`, `search_keyword`, `localization`,
`edition`, cache/stale information, and per-attempt feed diagnostics.
`GET /debug-keyword?country=Taiwan&keyword=election` uses the same pipeline and
normalizes country aliases/case. It is a new request, not a replay of a prior
failure. A successful debug GET cannot prove that a previous POST succeeded.

Browser diagnostics: `window.keywordDiagnostics` (last 40 events),
`window.lastKeywordError`, and `window.keywordSearchVersion`. These remain in
memory; no extra telemetry service is introduced.

Run dependency-free regression tests with Node.js 18+:

```sh
node --test tests/keyword.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The Python wrapper includes the Node checks in the existing offline suite when
Node is available. An optional Chromium test clicks the real keyword controls
using mocked, deliberately delayed network responses:

```sh
python3 tests/keyword_browser.py
```

It requires Playwright and Chromium. Offline tests do not establish live Google
RSS availability, production Workers AI latency, or Safari/iPad-specific behavior.
The existing map implementations, URL/reload behavior, ranking pipeline, and
2-hour deployment schedule are not changed.
