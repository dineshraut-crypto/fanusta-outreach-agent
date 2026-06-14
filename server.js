import express from 'express';
import cron from 'node-cron';
import fs from 'fs';
import { exportToExcel, getExcelPath } from './src/excel.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './src/database.js';
import { runPipelineWorkflow, getWorkflowStatus } from './src/agents/orchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3050;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cron job variable to allow rescheduling
let scheduledJob = null;

/**
 * Schedules the daily pipeline run based on settings.
 */
function scheduleDailyPipeline() {
  const settings = db.getSettings();
  const [hour, minute] = settings.run_time.split(':');
  
  if (scheduledJob) {
    scheduledJob.stop();
    db.addLog('Stopped previous cron schedule.', 'info');
  }

  // Cron pattern: minute hour * * *
  const cronPattern = `${parseInt(minute)} ${parseInt(hour)} * * *`;
  
  db.addLog(`Scheduling daily pipeline run for ${settings.run_time} IST (Pattern: "${cronPattern}")`, 'info');
  
  scheduledJob = cron.schedule(cronPattern, async () => {
    db.addLog('Triggering scheduled daily pipeline execution...', 'info');
    await runPipelineWorkflow();
  }, {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  });
}

// Initialize scheduling
scheduleDailyPipeline();

// --- API ROUTES ---

// 1. Settings Endpoints
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.post('/api/settings', (req, res) => {
  const updated = db.saveSettings(req.body);
  if (updated) {
    db.addLog('System settings updated.', 'info');
    // Reschedule if time changed
    if (req.body.run_time) {
      scheduleDailyPipeline();
    }
    res.json({ success: true, settings: db.getSettings() });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save settings' });
  }
});

// 2. Opportunities Endpoints
app.get('/api/opportunities', (req, res) => {
  res.json(db.getOpportunities());
});

app.post('/api/opportunities/:id/status', (req, res) => {
  const updated = db.updateOpportunity(req.params.id, { status: req.body.status });
  if (updated) {
    res.json({ success: true, opportunity: updated });
  } else {
    res.status(404).json({ success: false, error: 'Opportunity not found' });
  }
});

// 3. Contacts Endpoints
app.get('/api/contacts', (req, res) => {
  res.json(db.getContacts());
});

app.post('/api/contacts/:id/status', (req, res) => {
  const updated = db.updateContact(req.params.id, { outreachStatus: req.body.status });
  if (updated) {
    res.json({ success: true, contact: updated });
  } else {
    res.status(404).json({ success: false, error: 'Contact not found' });
  }
});

// 4. Outreach Logs
app.get('/api/outreach', (req, res) => {
  res.json(db.getOutreachLogs());
});

// 5. System Logs
app.get('/api/logs', (req, res) => {
  res.json(db.getLogs());
});

app.post('/api/logs/clear', (req, res) => {
  db.clearLogs();
  res.json({ success: true });
});

// 6. Manual Execution Trigger
app.get('/api/run/status', (req, res) => {
  res.json({ isRunning: getWorkflowStatus() });
});

app.post('/api/run', (req, res) => {
  if (getWorkflowStatus()) {
    return res.status(400).json({ success: false, error: 'Pipeline is already running.' });
  }
  
  // Trigger async in background
  runPipelineWorkflow().then(result => {
    db.addLog(`Manual run finished. Success: ${result.success}`, 'info');
  });

  res.json({ success: true, message: 'Pipeline process started in background.' });
});

// 7. Excel Database Download
app.get('/api/download/excel', (req, res) => {
  const filePath = getExcelPath();
  if (fs.existsSync(filePath)) {
    res.download(filePath, 'Fanusta_Hospitality_Leads.xlsx');
  } else {
    // Generate on the fly
    exportToExcel();
    if (fs.existsSync(filePath)) {
      res.download(filePath, 'Fanusta_Hospitality_Leads.xlsx');
    } else {
      res.status(404).send('Excel database not generated yet. Run the discovery pipeline first.');
    }
  }
});

// Serve Frontend index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  db.addLog(`Fanusta Hospitality Outreach Server running at http://localhost:${PORT}`, 'info');
});
