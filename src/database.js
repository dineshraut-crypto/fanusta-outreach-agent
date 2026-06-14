import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILES = {
  opportunities: path.join(DATA_DIR, 'opportunities.json'),
  contacts: path.join(DATA_DIR, 'contacts.json'),
  outreach: path.join(DATA_DIR, 'outreach_logs.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  logs: path.join(DATA_DIR, 'app_logs.json')
};

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial defaults
const DEFAULTS = {
  opportunities: [],
  contacts: [],
  outreach: [],
  logs: [],
  settings: {
    gemini_api_key: '',
    smtp_host: 'smtp.gmail.com',
    smtp_port: '465',
    smtp_secure: true,
    smtp_user: '',
    smtp_pass: '',
    sender_name: 'Dinesh Raut | Fanusta',
    sender_email: '',
    summary_recipient: 'dinesh@fanusta.com',
    mock_mode: true,
    run_time: '08:00',
    opportunity_score_threshold: 70,
    daily_outreach_limit: 5,
    google_sheet_webhook: ''
  }
};

// Helper to read JSON file
function readJson(fileKey) {
  const filePath = FILES[fileKey];
  if (!fs.existsSync(filePath)) {
    writeJson(fileKey, DEFAULTS[fileKey]);
    return DEFAULTS[fileKey];
  }
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${fileKey}:`, error);
    return DEFAULTS[fileKey];
  }
}

// Helper to write JSON file atomically
function writeJson(fileKey, data) {
  const filePath = FILES[fileKey];
  const tempPath = `${filePath}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (error) {
    console.error(`Error writing ${fileKey}:`, error);
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    return false;
  }
}

export const db = {
  // Opportunities CRUD
  getOpportunities() {
    return readJson('opportunities');
  },
  saveOpportunities(opps) {
    return writeJson('opportunities', opps);
  },
  addOpportunity(opp) {
    const opps = this.getOpportunities();
    opps.push({
      id: opp.id || crypto.randomUUID(),
      discoveryDate: new Date().toISOString(),
      ...opp
    });
    this.saveOpportunities(opps);
  },
  updateOpportunity(id, updates) {
    const opps = this.getOpportunities();
    const idx = opps.findIndex(o => o.id === id);
    if (idx !== -1) {
      opps[idx] = { ...opps[idx], ...updates };
      this.saveOpportunities(opps);
      return opps[idx];
    }
    return null;
  },

  // Contacts CRUD
  getContacts() {
    return readJson('contacts');
  },
  saveContacts(contacts) {
    return writeJson('contacts', contacts);
  },
  addContact(contact) {
    const contacts = this.getContacts();
    const newContact = {
      id: contact.id || crypto.randomUUID(),
      outreachStatus: 'Not Contacted',
      addedDate: new Date().toISOString(),
      ...contact
    };
    contacts.push(newContact);
    this.saveContacts(contacts);
    return newContact;
  },
  updateContact(id, updates) {
    const contacts = this.getContacts();
    const idx = contacts.findIndex(c => c.id === id);
    if (idx !== -1) {
      contacts[idx] = { ...contacts[idx], ...updates };
      this.saveContacts(contacts);
      return contacts[idx];
    }
    return null;
  },

  // Outreach CRUD
  getOutreachLogs() {
    return readJson('outreach');
  },
  saveOutreachLogs(logs) {
    return writeJson('outreach', logs);
  },
  addOutreachLog(log) {
    const logs = this.getOutreachLogs();
    const newLog = {
      id: crypto.randomUUID(),
      sentDate: new Date().toISOString(),
      ...log
    };
    logs.push(newLog);
    this.saveOutreachLogs(logs);
    return newLog;
  },

  // Settings CRUD
  getSettings() {
    return readJson('settings');
  },
  saveSettings(settings) {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    return writeJson('settings', updated);
  },

  // App running logs (for live dashboard console)
  getLogs() {
    return readJson('logs');
  },
  addLog(message, type = 'info') {
    const logs = this.getLogs();
    logs.push({
      timestamp: new Date().toISOString(),
      message,
      type
    });
    // Keep last 500 logs to prevent file growing indefinitely
    if (logs.length > 500) {
      logs.shift();
    }
    writeJson('logs', logs);
    console.log(`[${type.toUpperCase()}] ${message}`);
  },
  clearLogs() {
    writeJson('logs', []);
  }
};
