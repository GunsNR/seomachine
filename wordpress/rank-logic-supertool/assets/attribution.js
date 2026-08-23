/**
 * Rank Logic SuperTool — AI referral attribution.
 *
 * Reports a page view only when it arrived from a known answer engine.
 * No cookies and no browser storage, and nothing is sent for ordinary visits.
 * It does send the full document referrer, which can carry query parameters
 * set by the referring site — so this is not claimed to be free of personal
 * data. Runs once per page load, after paint.
 */
(function () {
  'use strict';

  if (typeof window.RLST_ATTR === 'undefined' || !window.RLST_ATTR.endpoint) return;

  var referrer = document.referrer || '';
  if (!referrer) return;

  var PATTERNS = [
    [/chat\.openai\.com|chatgpt\.com/i, 'chatgpt'],
    [/perplexity\.ai/i, 'perplexity'],
    [/claude\.ai|anthropic\.com/i, 'claude'],
    [/gemini\.google\.com|bard\.google\.com/i, 'gemini'],
    [/grok\.com|x\.ai/i, 'grok'],
    [/google\.[a-z.]+\/(search\?.*udm=50|aimode)/i, 'google-ai-mode']
  ];

  var engine = '';
  for (var i = 0; i < PATTERNS.length; i++) {
    if (PATTERNS[i][0].test(referrer)) { engine = PATTERNS[i][1]; break; }
  }

  // Ordinary search and direct traffic is none of our business.
  if (!engine) return;

  var payload = {
    engine: engine,
    referrer: referrer,
    landingUrl: window.location.origin + window.location.pathname
  };

  function send() {
    try {
      fetch(window.RLST_ATTR.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': window.RLST_ATTR.nonce || '' },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: 'same-origin'
      }).catch(function () { /* attribution must never break the page */ });
    } catch (e) { /* no-op */ }
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(send, { timeout: 2000 });
  } else {
    window.setTimeout(send, 400);
  }
})();
