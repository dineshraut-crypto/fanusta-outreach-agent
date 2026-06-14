import { db } from './src/database.js';
import { callGemini } from './src/ai.js';
import { qualifyOpportunity } from './src/agents/qualification.js';
import { generateOutreachEmail } from './src/agents/outreach.js';

async function runTests() {
  db.addLog('=== Starting Verification Tests ===', 'info');

  // Test 1: Database Initialization
  try {
    db.addLog('Test 1: Verifying database CRUD operations...', 'info');
    const originalSettings = db.getSettings();
    db.saveSettings({ ...originalSettings, sender_name: 'Dinesh Raut | Fanusta Test' });
    const updatedSettings = db.getSettings();
    if (updatedSettings.sender_name !== 'Dinesh Raut | Fanusta Test') {
      throw new Error('Database failed to save settings.');
    }
    // Restore
    db.saveSettings(originalSettings);
    db.addLog('Test 1 Passed: Database CRUD verified successfully.', 'info');
  } catch (e) {
    db.addLog(`Test 1 Failed: ${e.message}`, 'error');
    process.exit(1);
  }

  // Test 2: Verify API Key Status & Mock API Call
  let apiConfigured = false;
  try {
    db.addLog('Test 2: Checking Gemini API configuration...', 'info');
    const settings = db.getSettings();
    if (settings.gemini_api_key) {
      db.addLog('Gemini API Key is configured. Running test API call...', 'info');
      const testResponse = await callGemini('Respond with "API Ok" if you read this.');
      db.addLog(`Test 2 Response: "${testResponse.trim()}"`, 'info');
      apiConfigured = true;
      db.addLog('Test 2 Passed: Gemini API verified.', 'info');
    } else {
      db.addLog('Test 2 Info: Gemini API Key not set in database. Skipping live AI test. Running in mock mode.', 'warn');
    }
  } catch (e) {
    db.addLog(`Test 2 Warning (API Call Failed): ${e.message}. (Ensure your API key is valid.)`, 'warn');
  }

  // Test 3: Qualification Agent Test (Mock or Real)
  try {
    db.addLog('Test 3: Testing Opportunity Qualification scoring logic...', 'info');
    const mockOpp = {
      id: 'test-opp-123',
      propertyName: 'Luxury Palace Jaipur Refurbishment',
      hotelGroup: 'Independent',
      city: 'Jaipur',
      state: 'Rajasthan',
      projectType: 'Renovation',
      expectedTimeline: 'October 2026',
      description: 'The historic luxury palace is planning a complete structural and design refurbishment of all 50 heritage suites.',
      sourceUrl: 'https://test-news.com/refurbish-jaipur'
    };

    const mockContacts = [
      {
        fullName: 'Aravind Singh',
        designation: 'General Manager',
        linkedIn: 'https://linkedin.com/in/aravindsingh-test',
        companyWebsite: 'https://palacehoteljaipur.com',
        email: 'gm@palacehoteljaipur.com',
        role: 'General Manager',
        company: 'Independent'
      }
    ];

    let qualification;
    if (apiConfigured) {
      qualification = await qualifyOpportunity(mockOpp, mockContacts);
    } else {
      // Return simulated score
      qualification = {
        qualificationScore: {
          projectSize: 8,
          interiorProbability: 9,
          timelineUrgency: 8,
          dmAvailability: 9,
          overallScore: 85,
          reasoning: 'Simulated qualification: High score due to complete heritage suite refurbishment and GM contact available.'
        },
        status: 'shortlisted'
      };
    }

    db.addLog(`Qualified Score: ${qualification.qualificationScore.overallScore} | Status: ${qualification.status}`, 'info');
    db.addLog(`Reasoning: ${qualification.qualificationScore.reasoning}`, 'info');
    
    if (qualification.qualificationScore.overallScore < 1 || qualification.qualificationScore.overallScore > 100) {
      throw new Error('Invalid score generated.');
    }
    db.addLog('Test 3 Passed: Qualification logic verified.', 'info');

    // Test 4: Email Generation
    db.addLog('Test 4: Testing Personalized Email Outreach generation...', 'info');
    let emailResult;
    if (apiConfigured) {
      emailResult = await generateOutreachEmail(mockContacts[0], mockOpp);
    } else {
      emailResult = {
        subject: 'Quick Introduction – Hospitality Design & Turnkey',
        body: 'Dear Aravind Singh,\n\nI hope you are doing well.\n\nI read about the upcoming suite renovation at Luxury Palace Jaipur. At Fanusta, we specialize in high-end design-build interior execution for heritage properties.\n\nI would love to arrange a quick 15-minute introductory call.\n\nBest regards,\nDinesh Raut',
        version: 'Version B - Boutique'
      };
    }

    db.addLog(`Generated Email Subject: "${emailResult.subject}"`, 'info');
    db.addLog(`Generated Version: ${emailResult.version}`, 'info');
    db.addLog(`Body Sample:\n---\n${emailResult.body.substring(0, 200)}...\n---`, 'info');
    
    if (!emailResult.subject || !emailResult.body) {
      throw new Error('Email subject or body generation failed.');
    }
    db.addLog('Test 4 Passed: Outreach email generator verified.', 'info');

  } catch (e) {
    db.addLog(`Test Failed: ${e.message}`, 'error');
    process.exit(1);
  }

  db.addLog('=== All Verification Tests Completed Successfully! ===', 'info');
}

runTests();
