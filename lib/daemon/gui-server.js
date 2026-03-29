import http from "node:http";

function getHtmlTemplate(port) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Guardrails Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 20px;
      min-height: 100vh;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #334155;
    }
    .logo { font-size: 24px; }
    h1 { font-size: 20px; font-weight: 600; }
    .status-badge {
      margin-left: auto;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
    }
    .status-ok { background: #065f46; color: #6ee7b7; }
    .status-fail { background: #7f1d1d; color: #fca5a5; }
    .status-pending { background: #78350f; color: #fcd34d; }
    .status-error { background: #7f1d1d; color: #fca5a5; }

    .timestamp {
      color: #94a3b8;
      font-size: 13px;
      margin-bottom: 20px;
    }

    .section {
      background: #1e293b;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: #94a3b8;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .finding {
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .finding-error { background: #450a0a; border-left: 3px solid #ef4444; }
    .finding-warning { background: #451a03; border-left: 3px solid #f59e0b; }
    .finding-info { background: #0c4a6e; border-left: 3px solid #0ea5e9; }

    .finding-code {
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      color: #f8fafc;
      font-size: 13px;
    }
    .finding-location {
      color: #94a3b8;
      font-size: 12px;
      margin-top: 4px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
    }
    .summary-item {
      background: #334155;
      border-radius: 6px;
      padding: 12px;
      text-align: center;
    }
    .summary-value {
      font-size: 24px;
      font-weight: 700;
    }
    .summary-label {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 4px;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: #64748b;
    }
    .empty-state-icon { font-size: 48px; margin-bottom: 12px; }
    .empty-state-text { font-size: 14px; }

    .error-banner {
      background: #7f1d1d;
      color: #fca5a5;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 14px;
    }

    #connection-status {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 8px 12px;
      border-radius: 20px;
      font-size: 12px;
      background: #334155;
      color: #94a3b8;
    }
    #connection-status.connected { background: #065f46; color: #6ee7b7; }
    #connection-status.disconnected { background: #7f1d1d; color: #fca5a5; }

    .autofix-section { background: #064e3b; border: 1px solid #065f46; }
    .autofix-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #065f46;
      border-radius: 4px;
      margin-bottom: 6px;
      font-size: 13px;
    }
    .autofix-item.failed {
      background: #7f1d1d;
    }
    .autofix-icon { font-size: 14px; }
    .autofix-name { font-weight: 500; }
    .autofix-file { color: #94a3b8; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <span class="logo">🛡️</span>
    <h1>Agent Guardrails</h1>
    <span class="status-badge status-pending" id="status-badge">Waiting...</span>
  </div>

  <div class="timestamp" id="timestamp">-</div>

  <div id="content">
    <div class="empty-state">
      <div class="empty-state-icon">👀</div>
      <div class="empty-state-text">Waiting for guardrail check results...</div>
    </div>
  </div>

  <div id="connection-status">Connecting...</div>

  <script>
    const evtSource = new EventSource('/api/events');
    const statusBadge = document.getElementById('status-badge');
    const timestamp = document.getElementById('timestamp');
    const content = document.getElementById('content');
    const connStatus = document.getElementById('connection-status');

    evtSource.onopen = () => {
      connStatus.textContent = 'Connected';
      connStatus.className = 'connected';
    };

    evtSource.onerror = () => {
      connStatus.textContent = 'Disconnected - Retrying...';
      connStatus.className = 'disconnected';
    };

    evtSource.addEventListener('result', (e) => {
      const data = JSON.parse(e.data);
      renderResult(data);
    });

    function renderResult(data) {
      const ts = new Date(data.timestamp).toLocaleString();
      timestamp.textContent = 'Last check: ' + ts;

      if (data.ok) {
        statusBadge.textContent = '✓ All Clear';
        statusBadge.className = 'status-badge status-ok';
      } else {
        statusBadge.textContent = '✗ Issues Found';
        statusBadge.className = 'status-badge status-fail';
      }

      if (data.error) {
        content.innerHTML = '<div class="error-banner">Error: ' + escapeHtml(data.error) + '</div>';
        return;
      }

      const findings = data.findings || [];
      const summary = data.summary || { errors: 0, warnings: 0, info: 0 };

      let html = '';

      // Summary section
      html += '<div class="section">';
      html += '<div class="section-title">Summary</div>';
      html += '<div class="summary-grid">';
      html += '<div class="summary-item"><div class="summary-value" style="color:#ef4444">' + summary.errors + '</div><div class="summary-label">Errors</div></div>';
      html += '<div class="summary-item"><div class="summary-value" style="color:#f59e0b">' + summary.warnings + '</div><div class="summary-label">Warnings</div></div>';
      html += '<div class="summary-item"><div class="summary-value" style="color:#0ea5e9">' + summary.info + '</div><div class="summary-label">Info</div></div>';
      html += '<div class="summary-item"><div class="summary-value" style="color:#6ee7b7">' + findings.length + '</div><div class="summary-label">Total</div></div>';
      html += '</div></div>';

      // Auto-fix section
      const autoFix = data.autoFix;
      if (autoFix && (autoFix.applied.length > 0 || autoFix.failed.length > 0)) {
        html += '<div class="section autofix-section">';
        html += '<div class="section-title">🔧 Auto-Fix</div>';

        if (autoFix.applied.length > 0) {
          html += '<div style="margin-bottom:8px;font-size:12px;color:#6ee7b7;">Applied:</div>';
          for (const fix of autoFix.applied) {
            html += '<div class="autofix-item">';
            html += '<span class="autofix-icon">✓</span>';
            html += '<span class="autofix-name">' + escapeHtml(fix.name) + '</span>';
            if (fix.filePath) {
              html += '<span class="autofix-file">' + escapeHtml(fix.filePath) + '</span>';
            }
            html += '</div>';
          }
        }

        if (autoFix.failed.length > 0) {
          html += '<div style="margin:12px 0 8px;font-size:12px;color:#fca5a5;">Failed:</div>';
          for (const fix of autoFix.failed) {
            html += '<div class="autofix-item failed">';
            html += '<span class="autofix-icon">✗</span>';
            html += '<span class="autofix-name">' + escapeHtml(fix.name || fix.ruleId) + '</span>';
            if (fix.reason) {
              html += '<span class="autofix-file">' + escapeHtml(fix.reason) + '</span>';
            }
            html += '</div>';
          }
        }

        html += '</div>';
      }

      // Findings section
      if (findings.length > 0) {
        html += '<div class="section">';
        html += '<div class="section-title">Findings</div>';
        for (const f of findings) {
          const levelClass = 'finding-' + (f.level || 'info');
          html += '<div class="finding ' + levelClass + '">';
          html += '<div class="finding-code">' + escapeHtml(f.code || '') + '</div>';
          if (f.location) {
            html += '<div class="finding-location">' + escapeHtml(f.location) + '</div>';
          }
          if (f.message) {
            html += '<div class="finding-location">' + escapeHtml(f.message) + '</div>';
          }
          html += '</div>';
        }
        html += '</div>';
      }

      content.innerHTML = html;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Load current state on page load
    fetch('/api/state')
      .then(r => r.json())
      .then(data => {
        if (data.timestamp) renderResult(data);
      })
      .catch(() => {});
  </script>
</body>
</html>`;
}

function createStateStore() {
  let state = {
    timestamp: null,
    ok: true,
    findings: [],
    summary: { errors: 0, warnings: 0, info: 0 },
    error: null
  };
  const listeners = new Set();

  return {
    get: () => state,
    set: (newState) => {
      state = { ...state, ...newState, timestamp: new Date().toISOString() };

      const message = \`event: result\\ndata: \${JSON.stringify(state)}\\n\\n\`;
      for (const res of listeners) {
        try { res.write(message); } catch { listeners.delete(res); }
      }
    },
    addListener: (res) => listeners.add(res),
    removeListener: (res) => listeners.delete(res)
  };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export function createGuiServer() {
  const stateStore = createStateStore();
  let server = null;
  let port = null;

  function start() {
    return new Promise((resolve, reject) => {
      server = http.createServer((req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');

        const url = new URL(req.url, \`http://localhost\`);

        // SSE endpoint
        if (url.pathname === '/api/events') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });
          res.write('event: connected\\ndata: {}\\n\\n');
          stateStore.addListener(res);
          req.on('close', () => stateStore.removeListener(res));
          return;
        }


        if (url.pathname === '/api/state') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(stateStore.get()));
          return;
        }


        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(getHtmlTemplate(port));
      });

      server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve(port);
      });

      server.on('error', reject);
    });
  }

  function stop() {
    if (server) {
      server.close();
      server = null;
    }
  }

  function pushResult(result) {
    const { ok, findings, summary, error } = result;
    stateStore.set({ ok, findings, summary, error });
  }

  return { start, stop, pushResult, getPort: () => port };
}
