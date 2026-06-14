import { db } from '../database.js';
import { discoverOpportunities } from './discovery.js';
import { identifyDecisionMakers } from './decisionMaker.js';
import { discoverContactEmail } from './emailDiscovery.js';
import { qualifyOpportunity } from './qualification.js';
import { runDailyOutreach, sendDailySummaryReport } from './outreach.js';
import { exportToExcel } from '../excel.js';

let isRunning = false;

/**
 * Runs the full automated hospitality pipeline workflow sequentially.
 */
export async function runPipelineWorkflow() {
  if (isRunning) {
    db.addLog('Pipeline is already running. Skipping execution.', 'warn');
    return { success: false, reason: 'Already running' };
  }

  isRunning = true;
  db.addLog('=== Starting Automated Hospitality Pipeline Workflow ===', 'info');

  const runStats = {
    discoveredOpps: [],
    newContacts: [],
    outreachSent: []
  };

  try {
    // Step 1: Discover Opportunities (Agent 1)
    const rawOpps = await discoverOpportunities();
    db.addLog(`Discovered ${rawOpps.length} potential opportunities.`, 'info');

    for (const rawOpp of rawOpps) {
      // Create a unique ID for processing
      const opportunityId = crypto.randomUUID();
      const oppWithId = { ...rawOpp, id: opportunityId };

      // Step 2: Decision Maker Intelligence (Agent 2)
      const rawContacts = await identifyDecisionMakers(oppWithId);
      const processedContacts = [];

      // Step 3: Email Discovery (Agent 3)
      for (const contact of rawContacts) {
        const validatedContact = await discoverContactEmail(contact, oppWithId);
        
        // Add contact to CRM database
        const savedContact = db.addContact(validatedContact || contact);
        processedContacts.push(savedContact);
        runStats.newContacts.push(savedContact);
      }

      // Step 4: Opportunity Qualification (Agent 4)
      const qualification = await qualifyOpportunity(oppWithId, processedContacts);
      
      // Save opportunity to CRM database
      const finalOpp = {
        ...oppWithId,
        ...qualification
      };
      db.addOpportunity(finalOpp);
      runStats.discoveredOpps.push(finalOpp);
      
      // Sync to Google Sheets if configured and shortlisted
      if (finalOpp.status === 'shortlisted') {
        const settings = db.getSettings();
        if (settings.google_sheet_webhook) {
          await syncToGoogleSheets(finalOpp, processedContacts, settings.google_sheet_webhook);
        }
      }
      
      // Delay to avoid request bursts
      await new Promise(r => setTimeout(r, 1000));
    }

    // Step 5: Send Personalized Outreach (Agent 5 & 7)
    const outreachLogs = await runDailyOutreach();
    runStats.outreachSent = outreachLogs;

    // Step 6: Send Daily Summary Report to Dinesh Raut (Agent 6)
    await sendDailySummaryReport(runStats.discoveredOpps, runStats.newContacts, runStats.outreachSent);

    // Sync to Excel Database
    exportToExcel();

    db.addLog('=== Pipeline Workflow Execution Completed Successfully! ===', 'info');
    isRunning = false;
    return { success: true, stats: runStats };
  } catch (error) {
    db.addLog(`Workflow failed with error: ${error.message}`, 'error');
    isRunning = false;
    
    // Attempt to send a failure notification report if possible
    try {
      await sendDailySummaryReport(runStats.discoveredOpps, runStats.newContacts, runStats.outreachSent);
    } catch (e) {
      db.addLog(`Failed to send fallback summary: ${e.message}`, 'error');
    }
    
    return { success: false, error: error.message };
  }
}

export function getWorkflowStatus() {
  return isRunning;
}

/**
 * Syncs a qualified lead opportunity and its contacts to Google Sheets via Webhook.
 */
async function syncToGoogleSheets(opp, contacts, webhookUrl) {
  db.addLog(`Syncing ${opp.propertyName} to Google Sheets...`, 'info');
  
  const payloadRows = [];
  if (contacts.length === 0) {
    payloadRows.push({
      propertyName: opp.propertyName,
      hotelGroup: opp.hotelGroup,
      city: opp.city,
      state: opp.state,
      projectType: opp.projectType,
      expectedTimeline: opp.expectedTimeline,
      overallScore: opp.qualificationScore?.overallScore || 'N/A',
      contactName: 'No contacts identified yet',
      designation: '',
      role: '',
      email: '',
      linkedIn: '',
      outreachStatus: 'Not Contacted',
      reasoning: opp.qualificationScore?.reasoning || '',
      sourceUrl: opp.sourceUrl
    });
  } else {
    contacts.forEach(contact => {
      payloadRows.push({
        propertyName: opp.propertyName,
        hotelGroup: opp.hotelGroup,
        city: opp.city,
        state: opp.state,
        projectType: opp.projectType,
        expectedTimeline: opp.expectedTimeline,
        overallScore: opp.qualificationScore?.overallScore || 'N/A',
        contactName: contact.fullName,
        designation: contact.designation,
        role: contact.role,
        email: contact.email || 'Not Discovered',
        linkedIn: contact.linkedIn || 'Not Discovered',
        outreachStatus: contact.outreachStatus || 'Not Contacted',
        reasoning: opp.qualificationScore?.reasoning || '',
        sourceUrl: opp.sourceUrl
      });
    });
  }

  for (const row of payloadRows) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row)
      });
      if (!response.ok) {
        db.addLog(`Google Sheets webhook returned error: ${response.statusText}`, 'warn');
      } else {
        db.addLog(`Google Sheets sync successful for contact: ${row.contactName}`, 'info');
      }
    } catch (err) {
      db.addLog(`Google Sheets sync failed: ${err.message}`, 'warn');
    }
  }
}
