import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const EXCEL_FILE_PATH = path.join(DATA_DIR, 'Fanusta_Hospitality_Leads.xlsx');

/**
 * Compiles all CRM opportunities and contacts into a single Excel sheet.
 */
export function exportToExcel() {
  db.addLog('Compiling Excel database file...', 'info');

  try {
    const opportunities = db.getOpportunities();
    const contacts = db.getContacts();
    const outreachLogs = db.getOutreachLogs();

    const rows = [];

    // Map each contact to their opportunity
    opportunities.forEach(opp => {
      const oppContacts = contacts.filter(c => c.opportunityId === opp.id);

      if (oppContacts.length === 0) {
        // If no contacts identified yet, write the opportunity details alone
        rows.push({
          'Discovery Date': new Date(opp.discoveryDate).toLocaleDateString('en-IN'),
          'Property Name': opp.propertyName,
          'Hotel Group': opp.hotelGroup,
          'City': opp.city,
          'State': opp.state,
          'Project Type': opp.projectType,
          'Expected Timeline': opp.expectedTimeline,
          'Lead Score (1-100)': opp.qualificationScore?.overallScore || 'N/A',
          'Campaign Status': opp.status === 'shortlisted' ? 'Shortlisted' : 'Disqualified',
          'Decision Makers': 'No contacts identified yet',
          'Designation': '',
          'Contact Role': '',
          'Email Address': '',
          'LinkedIn Profile': '',
          'Outreach Status': 'Not Contacted',
          'Outreach Date': '',
          'Qualification Reasoning': opp.qualificationScore?.reasoning || '',
          'Source Article URL': opp.sourceUrl
        });
      } else {
        const outreachDates = oppContacts.map(contact => {
          const contactOutreach = outreachLogs.find(o => o.contactId === contact.id) || {};
          return contactOutreach.sentDate 
            ? new Date(contactOutreach.sentDate).toLocaleDateString('en-IN') 
            : 'N/A';
        }).join(', ');

        rows.push({
          'Discovery Date': new Date(opp.discoveryDate).toLocaleDateString('en-IN'),
          'Property Name': opp.propertyName,
          'Hotel Group': opp.hotelGroup,
          'City': opp.city,
          'State': opp.state,
          'Project Type': opp.projectType,
          'Expected Timeline': opp.expectedTimeline,
          'Lead Score (1-100)': opp.qualificationScore?.overallScore || 'N/A',
          'Campaign Status': opp.status === 'shortlisted' ? 'Shortlisted' : 'Disqualified',
          'Decision Makers': oppContacts.map(c => c.fullName).join(', '),
          'Designation': oppContacts.map(c => c.designation || 'N/A').join(', '),
          'Contact Role': oppContacts.map(c => c.role || 'N/A').join(', '),
          'Email Address': oppContacts.map(c => c.email || 'Not Discovered').join(', '),
          'LinkedIn Profile': oppContacts.map(c => c.linkedIn || 'Not Discovered').join(', '),
          'Outreach Status': oppContacts.map(c => c.outreachStatus || 'Not Contacted').join(', '),
          'Outreach Date': outreachDates,
          'Qualification Reasoning': opp.qualificationScore?.reasoning || '',
          'Source Article URL': opp.sourceUrl
        });
      }
    });

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Set column widths dynamically
    const colWidths = [
      { wch: 15 }, // Discovery Date
      { wch: 30 }, // Property Name
      { wch: 20 }, // Hotel Group
      { wch: 15 }, // City
      { wch: 15 }, // State
      { wch: 15 }, // Project Type
      { wch: 20 }, // Expected Timeline
      { wch: 18 }, // Lead Score
      { wch: 18 }, // Campaign Status
      { wch: 25 }, // Decision Makers
      { wch: 25 }, // Designation
      { wch: 20 }, // Contact Role
      { wch: 30 }, // Email
      { wch: 35 }, // LinkedIn
      { wch: 18 }, // Outreach Status
      { wch: 15 }, // Outreach Date
      { wch: 50 }, // Qualification Reasoning
      { wch: 40 }  // Source URL
    ];
    worksheet['!cols'] = colWidths;

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Hospitality Leads');

    // Write file
    XLSX.writeFile(workbook, EXCEL_FILE_PATH);
    db.addLog(`Excel database written successfully: ${EXCEL_FILE_PATH}`, 'info');
    return true;
  } catch (error) {
    db.addLog(`Failed to compile Excel database: ${error.message}`, 'error');
    return false;
  }
}

export function getExcelPath() {
  return EXCEL_FILE_PATH;
}
