/**
 * BunkScanner — Frontend Error Handler
 *
 * Client-side error handling, connection monitoring,
 * and user notification system.
 */

(function () {
  'use strict';

  /* ── Configuration ── */
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2000;
  const CONNECTION_CHECK_INTERVAL_MS = 15000;
  const ERROR_DISPLAY_DURATION_MS = 8000;
  const MAX_ERROR_LOG = 50;

  /* ── State ── */
  const errorState = {
    connectionStatus: 'unknown',  // online | offline | degraded | unknown
    lastSuccessfulFetch: null,
    consecutiveFailures: 0,
    errorLog: [],
    activeToast: null,
  };

  /* ══════════════════════════════════════════════════════
     ERROR CLASSIFICATION
     ══════════════════════════════════════════════════════ */

  function classifyError(error, context) {
    if (!navigator.onLine) {
      return { type: 'network', severity: 'error', message: 'No internet connection', recoverable: true };
    }
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      return { type: 'connection', severity: 'error', message: 'Cannot reach BunkScanner server', recoverable: true };
    }
    if (error.status === 400) {
      return { type: 'validation', severity: 'warn', message: `Invalid request: ${error.statusText || 'Bad Request'}`, recoverable: false };
    }
    if (error.status === 404) {
      return { type: 'not_found', severity: 'warn', message: `Resource not found: ${context || ''}`, recoverable: false };
    }
    if (error.status === 429) {
      return { type: 'rate_limit', severity: 'warn', message: 'Too many requests — slowing down', recoverable: true };
    }
    if (error.status >= 500) {
      return { type: 'server', severity: 'error', message: 'Server error — data may be stale', recoverable: true };
    }
    return { type: 'unknown', severity: 'error', message: error.message || 'An unexpected error occurred', recoverable: true };
  }

  /* ══════════════════════════════════════════════════════
     ERROR LOG
     ══════════════════════════════════════════════════════ */

  function logError(classification, rawError, context) {
    const entry = {
      timestamp: Date.now(),
      ...classification,
      context: context || null,
      raw: rawError ? (rawError.message || String(rawError)) : null,
    };

    errorState.errorLog.push(entry);
    if (errorState.errorLog.length > MAX_ERROR_LOG) {
      errorState.errorLog.shift();
    }

    if (typeof console !== 'undefined') {
      const logFn = classification.severity === 'error' ? console.error : console.warn;
      logFn(`[BunkScanner] [${classification.type}] ${classification.message}`, context || '');
    }

    return entry;
  }

  /* ══════════════════════════════════════════════════════
     CONNECTION MONITOR
     ══════════════════════════════════════════════════════ */

  function updateConnectionStatus(isSuccess) {
    if (isSuccess) {
      errorState.consecutiveFailures = 0;
      errorState.lastSuccessfulFetch = Date.now();
      setConnectionStatus('online');
    } else {
      errorState.consecutiveFailures++;
      if (errorState.consecutiveFailures >= MAX_RETRIES) {
        setConnectionStatus('offline');
      } else {
        setConnectionStatus('degraded');
      }
    }
  }

  function setConnectionStatus(status) {
    const prev = errorState.connectionStatus;
    errorState.connectionStatus = status;

    if (prev !== status) {
      updateConnectionIndicator(status);

      if (status === 'offline') {
        showToast('Connection lost — displaying cached data', 'error');
      } else if (prev === 'offline' && status === 'online') {
        showToast('Connection restored', 'success');
      }
    }
  }

  function updateConnectionIndicator(status) {
    const dot = document.getElementById('connDot');
    if (!dot) return;

    dot.classList.remove('status-dot--ok', 'status-dot--warn', 'status-dot--error');

    switch (status) {
      case 'online':
        dot.classList.add('status-dot--ok');
        dot.title = 'Connection OK';
        break;
      case 'degraded':
        dot.classList.add('status-dot--warn');
        dot.title = 'Connection unstable';
        break;
      case 'offline':
        dot.classList.add('status-dot--error');
        dot.title = 'Connection lost';
        break;
      default:
        dot.title = 'Checking connection...';
    }
  }

  /* ══════════════════════════════════════════════════════
     RESILIENT FETCH WITH RETRY
     ══════════════════════════════════════════════════════ */

  async function resilientFetch(url, options = {}, retries = MAX_RETRIES) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: options.signal || AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`);
          error.status = response.status;
          error.statusText = response.statusText;
          throw error;
        }

        updateConnectionStatus(true);
        return response;
      } catch (error) {
        lastError = error;

        if (error.name === 'AbortError') {
          const classification = { type: 'timeout', severity: 'warn', message: 'Request timed out' };
          logError(classification, error, url);
          break; // Don't retry timeouts
        }

        if (attempt < retries) {
          const delay = RETRY_DELAY_MS * Math.pow(1.5, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    updateConnectionStatus(false);
    const classification = classifyError(lastError, url);
    logError(classification, lastError, url);
    throw lastError;
  }

  /* ══════════════════════════════════════════════════════
     TOAST NOTIFICATION
     ══════════════════════════════════════════════════════ */

  function showToast(message, type = 'info') {
    // Remove existing toast
    if (errorState.activeToast) {
      errorState.activeToast.remove();
      errorState.activeToast = null;
    }

    const toast = document.createElement('div');
    toast.className = `bunk-toast bunk-toast--${type}`;
    toast.setAttribute('role', 'alert');

    const icon = {
      error: '\u26A0',    // ⚠
      warn: '\u26A0',
      success: '\u2714',  // ✔
      info: '\u2139',     // ℹ
    }[type] || '\u2139';

    toast.innerHTML = `
      <span class="bunk-toast__icon">${icon}</span>
      <span class="bunk-toast__message">${escapeForDisplay(message)}</span>
      <button class="bunk-toast__close" aria-label="Dismiss">\u2715</button>
    `;

    toast.querySelector('.bunk-toast__close').addEventListener('click', () => {
      toast.remove();
      errorState.activeToast = null;
    });

    document.body.appendChild(toast);
    errorState.activeToast = toast;

    // Force reflow for animation
    toast.offsetHeight;
    toast.classList.add('bunk-toast--visible');

    setTimeout(() => {
      if (errorState.activeToast === toast) {
        toast.classList.remove('bunk-toast--visible');
        setTimeout(() => {
          if (toast.parentNode) toast.remove();
          if (errorState.activeToast === toast) errorState.activeToast = null;
        }, 300);
      }
    }, ERROR_DISPLAY_DURATION_MS);
  }

  function escapeForDisplay(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ══════════════════════════════════════════════════════
     STALE DATA WARNING
     ══════════════════════════════════════════════════════ */

  function checkDataStaleness(siteTimestamp) {
    if (!siteTimestamp) return;

    const ageMs = Date.now() - siteTimestamp;
    const headerTs = document.getElementById('headerTimestamp');

    if (ageMs > 120000) {
      // >2 minutes old
      if (headerTs) headerTs.classList.add('timestamp--stale');
      showToast('Data is more than 2 minutes old', 'warn');
    } else if (ageMs > 60000) {
      if (headerTs) headerTs.classList.add('timestamp--warn');
    } else {
      if (headerTs) {
        headerTs.classList.remove('timestamp--stale', 'timestamp--warn');
      }
    }
  }

  /* ══════════════════════════════════════════════════════
     GLOBAL ERROR HANDLERS
     ══════════════════════════════════════════════════════ */

  function setupGlobalErrorHandlers() {
    window.addEventListener('error', (event) => {
      const classification = {
        type: 'runtime',
        severity: 'error',
        message: event.message || 'Runtime error',
        recoverable: false,
      };
      logError(classification, event.error, `${event.filename}:${event.lineno}`);
    });

    window.addEventListener('unhandledrejection', (event) => {
      const classification = classifyError(event.reason || {}, 'unhandled_promise');
      logError(classification, event.reason, 'Promise rejection');
    });

    window.addEventListener('online', () => {
      setConnectionStatus('online');
      showToast('Back online', 'success');
    });

    window.addEventListener('offline', () => {
      setConnectionStatus('offline');
      showToast('You are offline — displaying cached data', 'error');
    });
  }

  /* ══════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════ */

  function initErrorHandler() {
    setupGlobalErrorHandlers();

    // Periodic connection check
    setInterval(() => {
      if (errorState.connectionStatus === 'offline') {
        // Try a lightweight check
        fetch('/api/health', { signal: AbortSignal.timeout(5000) })
          .then(() => updateConnectionStatus(true))
          .catch(() => {}); // Stay offline
      }
    }, CONNECTION_CHECK_INTERVAL_MS);
  }

  /* ══════════════════════════════════════════════════════
     EXPORTS (attach to window for app.js access)
     ══════════════════════════════════════════════════════ */

  window.BunkScannerErrors = {
    init: initErrorHandler,
    resilientFetch,
    showToast,
    logError,
    classifyError,
    updateConnectionStatus,
    checkDataStaleness,
    getErrorLog: () => [...errorState.errorLog],
    getConnectionStatus: () => errorState.connectionStatus,
    getState: () => ({ ...errorState }),
  };

})();
