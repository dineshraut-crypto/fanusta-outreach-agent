import { exportToExcel, getExcelPath } from './src/excel.js';
import { db } from './src/database.js';
import fs from 'fs';

db.addLog('=== Starting Excel Export Verification Test ===', 'info');

// 1. Create a dummy opportunity and contact
const testOpp = {
  id: 'test-opp-excel-123',
  propertyName: 'Taj Mahal Palace Presidential Suite Fit-Out',
  hotelGroup: 'Taj Hotels (IHCL)',
  city: 'Mumbai',
  state: 'Maharashtra',
  projectType: 'Renovation',
  expectedTimeline: 'December 2026',
  description: 'Refurbishing the presidential suites and corridors.',
  sourceUrl: 'https://test-news.com/taj-palace-presidential-fitout',
  qualificationScore: {
    overallScore: 95,
    reasoning: 'Test lead with executive contacts and immediate timeline.'
  },
  status: 'shortlisted'
};

const testContact = {
  id: 'test-contact-excel-123',
  opportunityId: 'test-opp-excel-123',
  fullName: 'Vikramaditya Singh',
  designation: 'Director of Luxury Procurement',
  linkedIn: 'https://linkedin.com/in/vikramadityasingh-test',
  companyWebsite: 'https://www.tajhotels.com',
  email: 'vikram.singh@tajhotels.com',
  role: 'Procurement Head',
  company: 'Taj Hotels (IHCL)',
  outreachStatus: 'Contacted'
};

// Insert into DB
db.addOpportunity(testOpp);
db.addContact(testContact);

db.addLog('Mock data inserted for test. Generating Excel...', 'info');

// 2. Generate Excel
const result = exportToExcel();

if (result) {
  const filePath = getExcelPath();
  db.addLog(`Excel generated at: ${filePath}`, 'info');

  // Check if file exists
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    db.addLog(`File size: ${stats.size} bytes.`, 'info');
    db.addLog('=== Excel Export Test Passed Successfully! ===', 'info');
    process.exit(0);
  } else {
    db.addLog('ERROR: Excel file does not exist on disk.', 'error');
    process.exit(1);
  }
} else {
  db.addLog('ERROR: Excel generation returned false.', 'error');
  process.exit(1);
}
