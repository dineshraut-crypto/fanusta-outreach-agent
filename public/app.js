// Fanusta Hospitality Outreach App Frontend

document.addEventListener('DOMContentLoaded', () => {
  // Navigation elements
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('page-title');
  const pageSubtitle = document.getElementById('page-subtitle');
  
  // Timer widget
  const currentTimeWidget = document.getElementById('current-time-ist');
  
  // Manual trigger buttons
  const btnManualTrigger = document.getElementById('btn-manual-trigger');
  const btnSpinner = btnManualTrigger.querySelector('.btn-spinner');
  const btnText = btnManualTrigger.querySelector('.btn-text');
  const pipelineStatus = document.getElementById('pipeline-status-indicator');
  
  // Console logs elements
  const consoleLogsOutput = document.getElementById('console-logs-output');
  const btnClearLogs = document.getElementById('btn-clear-logs');
  
  // Modals elements
  const emailModal = document.getElementById('email-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  
  // Forms
  const formSettingsAi = document.getElementById('form-settings-ai');
  const formSettingsSmtp = document.getElementById('form-settings-smtp');
  const formSettingsCampaign = document.getElementById('form-settings-campaign');

  let activeTab = 'overview';
  let logsInterval = null;
  let statusInterval = null;
  let isExecuting = false;

  // --- TAB NAVIGATION ---
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = item.getAttribute('data-tab');
      
      navItems.forEach(n => n.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      
      item.classList.add('active');
      const targetPane = document.getElementById(`tab-${targetTab}`);
      targetPane.classList.add('active');
      
      activeTab = targetTab;
      
      // Update header titles
      updateHeaderTitles(targetTab);
      
      // Refresh tab data
      refreshTabData(targetTab);
    });
  });

  function updateHeaderTitles(tab) {
    const titles = {
      overview: { title: 'Dashboard Overview', sub: 'Campaign Health & Pipeline Summary' },
      crm: { title: 'CRM Kanban Pipeline', sub: 'Manage Outreach Lifecycle & Meeting Scheduled' },
      opportunities: { title: 'Discovered Opportunities', sub: 'All Parsed Hospitality Projects & AI Scores' },
      outreach: { title: 'Outreach Outbox', sub: 'Sent and Drafted Personalized Emails' },
      console: { title: 'Live Agent Console', sub: 'Real-time Scraper & Analyzer Output' },
      settings: { title: 'System Settings', sub: 'Configure API Keys, SMTP Credentials & Limits' }
    };
    
    if (titles[tab]) {
      pageTitle.textContent = titles[tab].title;
      pageSubtitle.textContent = titles[tab].sub;
    }
  }

  // --- TIME WIDGET UPDATE ---
  function updateTime() {
    const options = {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };
    const formatter = new Intl.DateTimeFormat([], options);
    currentTimeWidget.textContent = formatter.format(new Date()) + ' IST';
  }
  updateTime();
  setInterval(updateTime, 1000);

  // --- REFRESH DATA ROUTINES ---
  function refreshTabData(tab) {
    if (tab === 'overview') {
      loadStats();
      loadSettingsSummary();
    } else if (tab === 'crm') {
      loadCrmBoard();
    } else if (tab === 'opportunities') {
      loadOpportunitiesTable();
    } else if (tab === 'outreach') {
      loadOutreachTable();
    } else if (tab === 'console') {
      loadConsoleLogs();
    } else if (tab === 'settings') {
      loadAllSettings();
    }
  }

  // --- LOAD STATS (Overview) ---
  async function loadStats() {
    try {
      const [oppsRes, contactsRes, outreachRes] = await Promise.all([
        fetch('/api/opportunities'),
        fetch('/api/contacts'),
        fetch('/api/outreach')
      ]);

      const opps = await oppsRes.json();
      const contacts = await contactsRes.json();
      const outreach = await outreachRes.json();

      // Set raw numbers
      document.getElementById('stat-total-discovered').textContent = opps.length;
      document.getElementById('stat-total-qualified').textContent = opps.filter(o => o.status === 'shortlisted').length;
      document.getElementById('stat-total-contacts').textContent = contacts.length;
      document.getElementById('stat-total-emails').textContent = outreach.length;

      // Group contacts by status
      const statusCounts = {
        'Not Contacted': 0,
        'Contacted': 0,
        'Replied': 0,
        'Meeting Scheduled': 0,
        'Opportunity Closed': 0
      };

      contacts.forEach(c => {
        if (statusCounts[c.outreachStatus] !== undefined) {
          statusCounts[c.outreachStatus]++;
        } else {
          statusCounts['Not Contacted']++;
        }
      });

      // Update legends
      document.getElementById('count-not-contacted').textContent = statusCounts['Not Contacted'];
      document.getElementById('count-contacted').textContent = statusCounts['Contacted'];
      document.getElementById('count-replied').textContent = statusCounts['Replied'];
      document.getElementById('count-meeting').textContent = statusCounts['Meeting Scheduled'];
      document.getElementById('count-closed').textContent = statusCounts['Opportunity Closed'];

      // Update progress bars
      const total = contacts.length || 1;
      document.getElementById('chart-bar-not-contacted').style.width = `${(statusCounts['Not Contacted'] / total) * 100}%`;
      document.getElementById('chart-bar-contacted').style.width = `${(statusCounts['Contacted'] / total) * 100}%`;
      document.getElementById('chart-bar-replied').style.width = `${(statusCounts['Replied'] / total) * 100}%`;
      document.getElementById('chart-bar-meeting').style.width = `${(statusCounts['Meeting Scheduled'] / total) * 100}%`;
      document.getElementById('chart-bar-closed').style.width = `${(statusCounts['Opportunity Closed'] / total) * 100}%`;

    } catch (e) {
      console.error('Error loading stats:', e);
    }
  }

  // --- LOAD SETTINGS SUMMARY (Overview) ---
  async function loadSettingsSummary() {
    try {
      const response = await fetch('/api/settings');
      const settings = await response.json();
      
      document.getElementById('summary-run-time').textContent = settings.run_time + ' IST';
      
      const mockBadge = document.getElementById('summary-mock-mode');
      if (settings.mock_mode) {
        mockBadge.textContent = 'Mock Mode (Enabled)';
        mockBadge.style.backgroundColor = 'rgba(249, 115, 22, 0.2)';
        mockBadge.style.color = 'var(--color-orange)';
      } else {
        mockBadge.textContent = 'Live Production Mode';
        mockBadge.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
        mockBadge.style.color = 'var(--color-green)';
      }
    } catch (e) {
      console.error(e);
    }
  }

  // --- KANBAN CRM BOARD ---
  async function loadCrmBoard() {
    try {
      const [contactsRes, oppsRes] = await Promise.all([
        fetch('/api/contacts'),
        fetch('/api/opportunities')
      ]);

      const contacts = await contactsRes.json();
      const opportunities = await oppsRes.json();

      // Clear all containers
      const containers = document.querySelectorAll('.kanban-cards-container');
      containers.forEach(c => {
        c.innerHTML = '';
        // Set count badges to 0 initially
        const countBadge = c.parentElement.querySelector('.kanban-count');
        if (countBadge) countBadge.textContent = '0';
      });

      const counts = {
        'Not Contacted': 0,
        'Contacted': 0,
        'Replied': 0,
        'Meeting Scheduled': 0,
        'Opportunity Closed': 0
      };

      contacts.forEach(contact => {
        const opp = opportunities.find(o => o.id === contact.opportunityId) || {};
        const status = contact.outreachStatus || 'Not Contacted';
        
        const container = document.querySelector(`.kanban-cards-container[data-status="${status}"]`);
        if (!container) return;

        counts[status]++;

        const card = document.createElement('div');
        card.className = 'kanban-card';
        card.innerHTML = `
          <div class="kanban-card-title">${contact.fullName}</div>
          <div class="kanban-card-meta">
            <strong>Role:</strong> ${contact.role}<br>
            <strong>Company:</strong> ${contact.company}<br>
            <strong>Project:</strong> ${opp.propertyName || 'Unknown'}
          </div>
          <div class="kanban-card-score">
            ★ ${opp.qualificationScore?.overallScore || 'N/A'}
          </div>
          <div class="kanban-card-actions">
            <select class="card-select status-select" data-id="${contact.id}">
              <option value="Not Contacted" ${status === 'Not Contacted' ? 'selected' : ''}>Not Contacted</option>
              <option value="Contacted" ${status === 'Contacted' ? 'selected' : ''}>Contacted</option>
              <option value="Replied" ${status === 'Replied' ? 'selected' : ''}>Replied</option>
              <option value="Meeting Scheduled" ${status === 'Meeting Scheduled' ? 'selected' : ''}>Meeting Scheduled</option>
              <option value="Opportunity Closed" ${status === 'Opportunity Closed' ? 'selected' : ''}>Closed/Lost</option>
            </select>
          </div>
        `;

        // Add event listener to status dropdown
        const select = card.querySelector('.status-select');
        select.addEventListener('change', async (e) => {
          const newStatus = e.target.value;
          const contactId = e.target.getAttribute('data-id');
          await updateContactStatus(contactId, newStatus);
        });

        container.appendChild(card);
      });

      // Update column count badges
      Object.keys(counts).forEach(key => {
        const container = document.querySelector(`.kanban-cards-container[data-status="${key}"]`);
        if (container) {
          const countBadge = container.parentElement.querySelector('.kanban-count');
          if (countBadge) countBadge.textContent = counts[key];
        }
      });

    } catch (e) {
      console.error(e);
    }
  }

  async function updateContactStatus(contactId, status) {
    try {
      const res = await fetch(`/api/contacts/${contactId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        loadCrmBoard();
      }
    } catch (e) {
      console.error(e);
    }
  }

  // --- OPPORTUNITIES TABLE ---
  async function loadOpportunitiesTable() {
    try {
      const oppsRes = await fetch('/api/opportunities');
      const opps = await oppsRes.json();
      
      const filterType = document.getElementById('filter-type').value;
      const filterStatus = document.getElementById('filter-status').value;
      
      const tableBody = document.getElementById('opps-table-body');
      tableBody.innerHTML = '';

      const filtered = opps.filter(o => {
        if (filterType !== 'all' && o.projectType !== filterType) return false;
        if (filterStatus !== 'all' && o.status !== filterStatus) return false;
        return true;
      });

      if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No opportunities found matching search criteria.</td></tr>';
        return;
      }

      filtered.forEach(o => {
        const score = o.qualificationScore?.overallScore || 'N/A';
        const scoreClass = score >= 70 ? 'text-green' : 'text-red';
        const dateStr = new Date(o.discoveryDate).toLocaleDateString('en-IN');

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <strong>${o.propertyName}</strong><br>
            <span class="field-help">Found: ${dateStr}</span><br>
            <a href="${o.sourceUrl}" target="_blank" class="field-help" style="color: var(--accent-indigo)">View Source ↗</a>
          </td>
          <td>${o.hotelGroup}</td>
          <td>${o.city}, ${o.state}</td>
          <td><span class="badge" style="background: rgba(255,255,255,0.05); color: #fff;">${o.projectType}</span></td>
          <td style="text-align:center;"><strong class="${scoreClass}" style="font-size:16px;">${score}</strong></td>
          <td>
            <div style="max-width: 250px; font-size: 11px;">
              <strong>Timeline:</strong> ${o.expectedTimeline}<br>
              <strong>Reasoning:</strong> ${o.qualificationScore?.reasoning || 'N/A'}
            </div>
          </td>
          <td>
            <select class="form-control btn-small opp-status-select" data-id="${o.id}">
              <option value="shortlisted" ${o.status === 'shortlisted' ? 'selected' : ''}>Shortlisted</option>
              <option value="disqualified" ${o.status === 'disqualified' ? 'selected' : ''}>Disqualified</option>
            </select>
          </td>
        `;

        const select = tr.querySelector('.opp-status-select');
        select.addEventListener('change', async (e) => {
          const newStatus = e.target.value;
          const oppId = e.target.getAttribute('data-id');
          await updateOpportunityStatus(oppId, newStatus);
        });

        tableBody.appendChild(tr);
      });

    } catch (e) {
      console.error(e);
    }
  }

  // Bind filter change events
  document.getElementById('filter-type').addEventListener('change', loadOpportunitiesTable);
  document.getElementById('filter-status').addEventListener('change', loadOpportunitiesTable);

  async function updateOpportunityStatus(oppId, status) {
    try {
      const res = await fetch(`/api/opportunities/${oppId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        loadOpportunitiesTable();
      }
    } catch (e) {
      console.error(e);
    }
  }

  // --- OUTREACH TABLE ---
  async function loadOutreachTable() {
    try {
      const response = await fetch('/api/outreach');
      const outreachLogs = await response.json();
      
      const tableBody = document.getElementById('outreach-table-body');
      tableBody.innerHTML = '';

      if (outreachLogs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No outreach emails sent yet.</td></tr>';
        return;
      }

      // Sort logs by newest date
      outreachLogs.sort((a, b) => new Date(b.sentDate) - new Date(a.sentDate));

      outreachLogs.forEach(log => {
        const dateStr = new Date(log.sentDate).toLocaleString('en-IN');
        
        let statusBadge = '';
        if (log.status === 'sent') {
          statusBadge = '<span class="badge" style="background:rgba(16, 185, 129, 0.2); color:var(--color-green);">Sent</span>';
        } else if (log.status === 'mock-sent') {
          statusBadge = '<span class="badge" style="background:rgba(59, 130, 246, 0.2); color:var(--color-blue);">Mock Sent</span>';
        } else {
          statusBadge = `<span class="badge" style="background:rgba(239, 68, 68, 0.2); color:var(--color-red);">Failed</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${dateStr}</td>
          <td><strong>${log.contactName}</strong></td>
          <td>${log.company}</td>
          <td><code>${log.email}</code></td>
          <td><span class="badge" style="background: rgba(168, 85, 247, 0.15); color: var(--accent-purple);">${log.version}</span></td>
          <td>${log.subject}</td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-secondary btn-small btn-view-email" data-id="${log.id}">Preview</button>
          </td>
        `;

        const viewBtn = tr.querySelector('.btn-view-email');
        viewBtn.addEventListener('click', () => {
          showEmailPreview(log);
        });

        tableBody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
    }
  }

  function showEmailPreview(log) {
    document.getElementById('modal-email-subject').textContent = log.subject;
    document.getElementById('modal-email-to').textContent = log.email;
    document.getElementById('modal-email-name').textContent = log.contactName;
    document.getElementById('modal-email-version').textContent = log.version;
    document.getElementById('modal-email-body').textContent = log.body;
    
    emailModal.classList.remove('hidden');
  }

  btnCloseModal.addEventListener('click', () => {
    emailModal.classList.add('hidden');
  });

  // --- LIVE CONSOLE LOGS ---
  async function loadConsoleLogs() {
    try {
      const res = await fetch('/api/logs');
      const logs = await res.json();
      
      consoleLogsOutput.innerHTML = '';
      
      if (logs.length === 0) {
        consoleLogsOutput.innerHTML = '<div class="log-entry">Waiting for pipeline execution...</div>';
        return;
      }

      logs.forEach(log => {
        const timeStr = new Date(log.timestamp).toLocaleTimeString('en-IN');
        const entry = document.createElement('div');
        entry.className = `log-entry log-type-${log.type}`;
        entry.innerHTML = `<span class="log-time">[${timeStr}]</span> ${escapeHtml(log.message)}`;
        consoleLogsOutput.appendChild(entry);
      });
      
      // Auto-scroll console to bottom
      consoleLogsOutput.scrollTop = consoleLogsOutput.scrollHeight;
    } catch (e) {
      console.error(e);
    }
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  btnClearLogs.addEventListener('click', async () => {
    try {
      await fetch('/api/logs/clear', { method: 'POST' });
      loadConsoleLogs();
    } catch (e) {
      console.error(e);
    }
  });

  // --- SETTINGS FORMS ---
  async function loadAllSettings() {
    try {
      const res = await fetch('/api/settings');
      const s = await res.json();

      // AI Settings
      document.getElementById('setting-gemini-key').value = s.gemini_api_key || '';
      document.getElementById('setting-score-threshold').value = s.opportunity_score_threshold || 70;

      // SMTP Settings
      document.getElementById('setting-mock-mode').checked = s.mock_mode !== false;
      document.getElementById('setting-smtp-host').value = s.smtp_host || 'smtp.gmail.com';
      document.getElementById('setting-smtp-port').value = s.smtp_port || '465';
      document.getElementById('setting-smtp-user').value = s.smtp_user || '';
      document.getElementById('setting-smtp-pass').value = s.smtp_pass || '';

      // Campaign settings
      document.getElementById('setting-sender-name').value = s.sender_name || 'Dinesh Raut | Fanusta';
      document.getElementById('setting-sender-email').value = s.sender_email || '';
      document.getElementById('setting-recipient').value = s.summary_recipient || 'dinesh@fanusta.com';
      document.getElementById('setting-run-time').value = s.run_time || '08:00';
      document.getElementById('setting-limit').value = s.daily_outreach_limit || 5;

    } catch (e) {
      console.error(e);
    }
  }

  formSettingsAi.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      gemini_api_key: document.getElementById('setting-gemini-key').value,
      opportunity_score_threshold: parseInt(document.getElementById('setting-score-threshold').value)
    };
    await saveSettings(payload);
  });

  formSettingsSmtp.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      mock_mode: document.getElementById('setting-mock-mode').checked,
      smtp_host: document.getElementById('setting-smtp-host').value,
      smtp_port: document.getElementById('setting-smtp-port').value,
      smtp_user: document.getElementById('setting-smtp-user').value,
      smtp_pass: document.getElementById('setting-smtp-pass').value
    };
    await saveSettings(payload);
  });

  formSettingsCampaign.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      sender_name: document.getElementById('setting-sender-name').value,
      sender_email: document.getElementById('setting-sender-email').value,
      summary_recipient: document.getElementById('setting-recipient').value,
      run_time: document.getElementById('setting-run-time').value,
      daily_outreach_limit: parseInt(document.getElementById('setting-limit').value)
    };
    await saveSettings(payload);
  });

  async function saveSettings(payload) {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert('Settings saved successfully!');
        loadAllSettings();
      } else {
        alert('Failed to save settings.');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving settings: ' + err.message);
    }
  }

  // --- MANUAL WORKFLOW TRIGGER & POLLING ---
  btnManualTrigger.addEventListener('click', async () => {
    if (isExecuting) return;
    
    const confirmRun = confirm('Are you sure you want to run the Opportunity Discovery and Outreach pipeline right now? This may make several API requests.');
    if (!confirmRun) return;

    try {
      const res = await fetch('/api/run', { method: 'POST' });
      if (res.ok) {
        // Switch tab to Console immediately so they can see logs
        document.getElementById('nav-console').click();
        checkRunningStatus();
      }
    } catch (e) {
      console.error(e);
    }
  });

  async function checkRunningStatus() {
    try {
      const res = await fetch('/api/run/status');
      const data = await res.json();
      
      isExecuting = data.isRunning;
      
      if (isExecuting) {
        // Update button state
        btnManualTrigger.classList.add('btn-secondary');
        btnManualTrigger.classList.remove('btn-primary');
        btnSpinner.classList.remove('hidden');
        btnText.textContent = 'Running...';
        
        // Update status text
        pipelineStatus.innerHTML = '<span class="status-dot orange"></span> Discovery Agent Active';
        
        // Start polling logs & status if not already running
        if (!logsInterval) {
          logsInterval = setInterval(loadConsoleLogs, 1500);
        }
        if (!statusInterval) {
          statusInterval = setInterval(checkRunningStatus, 3000);
        }
      } else {
        // Restore button state
        btnManualTrigger.classList.remove('btn-secondary');
        btnManualTrigger.classList.add('btn-primary');
        btnSpinner.classList.add('hidden');
        btnText.textContent = 'Run Discovery Now';
        
        // Restore status text
        pipelineStatus.innerHTML = '<span class="status-dot green"></span> System Idle';
        
        // Clear polling intervals
        if (logsInterval) {
          clearInterval(logsInterval);
          logsInterval = null;
        }
        if (statusInterval) {
          clearInterval(statusInterval);
          statusInterval = null;
        }
        
        // Load final logs and stats
        loadConsoleLogs();
        loadStats();
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Initial checks
  loadStats();
  loadSettingsSummary();
  checkRunningStatus();
});
