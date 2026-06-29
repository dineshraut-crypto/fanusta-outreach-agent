import nodemailer from 'nodemailer';
import { db } from '../database.js';
import { callGemini } from '../ai.js';

/**
 * Sends an email using SMTP (with space sanitization) or falls back to Google Sheets Webhook.
 */
async function sendEmail({ to, subject, html, text, settings }) {
  if (settings.mock_mode) {
    db.addLog(`[MOCK EMAIL] To: ${to} | Subject: ${subject}`, 'info');
    return { messageId: 'mock-id-' + Math.random().toString(36).substring(2, 9) };
  }

  let smtpError = null;
  // If SMTP settings are fully configured, attempt to send via SMTP
  if (settings.smtp_host && settings.smtp_user && settings.smtp_pass) {
    try {
      db.addLog(`Attempting SMTP delivery to ${to}...`, 'info');
      const port = parseInt(settings.smtp_port) || 587;
      const secure = port === 465;
      
      // Strip any spaces from password (commonly displayed as xxxx xxxx xxxx xxxx)
      const cleanPass = settings.smtp_pass ? settings.smtp_pass.replace(/\s+/g, '') : '';
      
      const transporter = nodemailer.createTransport({
        host: settings.smtp_host,
        port: port,
        secure: secure,
        auth: {
          user: settings.smtp_user,
          pass: cleanPass
        },
        connectionTimeout: 10000, // 10 seconds timeout
        greetingTimeout: 10000
      });

      const mailOptions = {
        from: `"${settings.sender_name}" <${settings.sender_email || settings.smtp_user}>`,
        to: to,
        subject: subject,
        text: text || '',
        html: html
      };

      const info = await transporter.sendMail(mailOptions);
      db.addLog(`Email sent successfully via SMTP to ${to}`, 'info');
      return { messageId: info.messageId || 'smtp-' + Date.now() };
    } catch (err) {
      smtpError = err;
      let smtpAdvice = '';
      if (err.message.includes('534') || err.message.toLowerCase().includes('application-specific password required')) {
        smtpAdvice = ' (Tip: You must use a Gmail "App Password" instead of your normal Gmail account password. Generate one in your Google Account settings under Security)';
      } else if (err.message.includes('535') || err.message.toLowerCase().includes('authentication failed') || err.message.toLowerCase().includes('username and password not accepted')) {
        smtpAdvice = ' (Tip: Authentication failed. Please verify your SMTP Username and App Password)';
      } else if (err.message.includes('ENOTFOUND') || err.message.includes('EAI_AGAIN')) {
        smtpAdvice = ' (Tip: Hostname not found. Please verify your SMTP Host address)';
      } else if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
        smtpAdvice = ' (Tip: Connection timed out. Render cloud hosting blocks standard SMTP ports like 25, 465, and 587. Please use the Google Sheets Webhook fallback)';
      }
      db.addLog(`SMTP delivery failed: ${err.message}${smtpAdvice}. Trying webhook fallback...`, 'warn');
    }
  }

  // Fallback to Google Sheets Webhook if available
  if (settings.google_sheet_webhook) {
    try {
      db.addLog(`Attempting Webhook delivery to ${to}...`, 'info');
      const response = await fetch(settings.google_sheet_webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'email',
          to: to,
          subject: subject,
          html: html
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const resData = await response.json();
      if (resData.result === 'success') {
        db.addLog(`Email sent successfully via Webhook to ${to}`, 'info');
        return { messageId: 'webhook-' + Date.now() };
      } else {
        throw new Error(resData.message || 'Unknown Webhook error');
      }
    } catch (err) {
      let webhookAdvice = '';
      if (err.message.includes('403')) {
        webhookAdvice = ' (Tip: Access Forbidden. Ensure your Google Apps Script Web App deployment is configured with "Who has access: Anyone")';
      } else if (err.message.includes('401')) {
        webhookAdvice = ' (Tip: Unauthorized. Please check your Web App URL and permissions)';
      } else if (err.message.toLowerCase().includes('doget') || err.message.includes('Script function not found')) {
        webhookAdvice = ' (Tip: Apps Script failed because it redirected to doGet. Ensure you deployed doPost correctly and authorized the script)';
      } else if (err.code === 'UND_ERR_CONNECT_TIMEOUT' || err.message.toLowerCase().includes('timeout')) {
        webhookAdvice = ' (Tip: Connection timed out. Please check your internet connectivity or if script.google.com is blocked)';
      }
      db.addLog(`Webhook email delivery failed: ${err.message}${webhookAdvice}`, 'error');
      throw new Error(`Email sending failed. SMTP: ${smtpError ? smtpError.message : 'N/A'}. Webhook: ${err.message}${webhookAdvice}`);
    }
  }

  throw new Error(
    smtpError 
      ? `SMTP failed: ${smtpError.message}` 
      : 'No SMTP credentials or Google Sheet Webhook URL configured.'
  );
}

/**
 * Generates personalized email for a decision maker contact.
 * Uses Gemini to draft body using Version A (Corporate) or Version B (Boutique).
 */
export async function generateOutreachEmail(contact, opportunity) {
  const isCorporate = opportunity.hotelGroup !== 'Unknown' && 
                      ['IHG', 'Marriott', 'Taj', 'Oberoi', 'ITC', 'Radisson', 'Hyatt', 'Accor', 'Hilton', 'Lemon Tree']
                      .some(group => opportunity.hotelGroup.toLowerCase().includes(group.toLowerCase()));

  const versionType = isCorporate ? 'Version A - Corporate' : 'Version B - Boutique';
  db.addLog(`Drafting outreach email (${versionType}) for ${contact.fullName}...`, 'info');

  const systemPrompt = `
You are Dinesh Raut, representative of Fanusta, a premier design-build contractor in India.
Fanusta provides turnkey interior design, fit-out, renovation, and execution services for hotels, resorts, and premium villas.
Your tone should be professional, executive, concise, and highly relevant.
Address the recipient directly using their name (e.g. 'Dear Sandip,' or 'Dear Sandip Kumar,' depending on professional tone). NEVER use generic placeholders like '[Contact Name]', '[Contact's Name]', or '[Recipient Name]'.
`;

  let prompt = '';
  if (isCorporate) {
    prompt = `
Draft a professional and formal introductory B2B email to:
Name: ${contact.fullName}
Designation: ${contact.designation}
Company: ${contact.company}
Project Reference: ${opportunity.propertyName} (${opportunity.projectType} in ${opportunity.city}, ${opportunity.state})

Guidelines (Version A - Corporate):
- Subject Line: Introduction – Design-Build Support for Hospitality Projects
- Tone: Professional, executive, concise, respectful.
- Greeting: Start with a professional greeting addressing ${contact.fullName} directly (e.g., "Dear ${contact.fullName}," or "Dear ${contact.fullName.split(' ')[0]},"). Do not use generic name placeholders.
- Content: Congratulate or reference the project announcement/renovation. Briefly state how Fanusta can serve as their Design-Build partner, ensuring seamless execution, turnkey interiors, and modular furniture capability.
- Call to Action (CTA): Request a brief 15-20 minute introductory MS Teams/Zoom call.
- Signature: 
  Dinesh Raut
  Design-Build Partner | Fanusta
  dineshraut@fanusta.com | +91 7798003399

Do not include any placeholders or markdown email wrappers. Output only the email body.
`;
  } else {
    prompt = `
Draft a warm and relationship-driven introductory email to:
Name: ${contact.fullName}
Designation: ${contact.designation}
Company: ${contact.company}
Project Reference: ${opportunity.propertyName} (${opportunity.projectType} in ${opportunity.city}, ${opportunity.state})

Guidelines (Version B - Boutique Hospitality):
- Subject Line: Quick Introduction – Hospitality Design & Turnkey
- Tone: Friendly, professional, personalized, welcoming, passionate about hospitality aesthetics.
- Greeting: Start with a warm greeting addressing ${contact.fullName} directly (e.g., "Dear ${contact.fullName}," or "Dear ${contact.fullName.split(' ')[0]},"). Do not use generic name placeholders.
- Content: Share appreciation for the boutique concept/project. Explain how Fanusta collaborates with boutique hotels and luxury resorts to create signature hospitality interiors, custom craftsmanship, and turnkey project execution that wows guests.
- Call to Action (CTA): Request a brief 15-20 minute introductory call to connect.
- Signature:
  Dinesh Raut
  Design-Build Partner | Fanusta
  dineshraut@fanusta.com | +91 7798003399

Do not include any placeholders or markdown email wrappers. Output only the email body.
`;
  }

  try {
    const emailBody = await callGemini(prompt, systemPrompt, false);
    const subject = isCorporate 
      ? 'Introduction – Design-Build Support for Hospitality Projects' 
      : 'Quick Introduction – Hospitality Design & Turnkey';

    return {
      subject,
      body: emailBody.trim(),
      version: versionType
    };
  } catch (error) {
    db.addLog(`Failed to generate email draft: ${error.message}`, 'error');
    return {
      subject: isCorporate ? 'Introduction – Design-Build Support for Hospitality Projects' : 'Quick Introduction – Hospitality Design & Turnkey',
      body: `Dear ${contact.fullName},\n\nI hope this email finds you well. I am reaching out from Fanusta. We are a premier Design-Build partner for hospitality projects in India, specializing in turnkey interior design and execution.\n\nWe would love to discuss support for the upcoming project at ${opportunity.propertyName}.\n\nBest regards,\nDinesh Raut\nFanusta`,
      version: versionType
    };
  }
}

/**
 * Runs the daily outreach program for shortlisted, qualified opportunities.
 * Sends emails to newly qualified contacts up to the daily limit.
 */
export async function runDailyOutreach() {
  db.addLog('Starting Outreach Agent (Agent 5)...', 'info');
  const settings = db.getSettings();
  const limit = settings.daily_outreach_limit || 5;

  const contacts = db.getContacts();
  const opportunities = db.getOpportunities();

  // Find contacts that have emails, belong to shortlisted opportunities, and have 'Not Contacted' status
  const eligibleContacts = contacts.filter(c => {
    if (!c.email || c.outreachStatus !== 'Not Contacted') return false;
    const opp = opportunities.find(o => o.id === c.opportunityId);
    return opp && opp.status === 'shortlisted';
  });

  db.addLog(`Found ${eligibleContacts.length} contacts eligible for email outreach. Daily limit is ${limit}.`, 'info');

  const contactsToSend = eligibleContacts.slice(0, limit);
  const sentLogs = [];

  for (const contact of contactsToSend) {
    const opp = opportunities.find(o => o.id === contact.opportunityId);
    
    // Generate draft
    const draft = await generateOutreachEmail(contact, opp);

    // Send
    try {
      db.addLog(`Sending email to ${contact.fullName} (${contact.email})...`, 'info');
      
      const info = await sendEmail({
        to: contact.email,
        subject: draft.subject,
        text: draft.body,
        html: draft.body.replace(/\n/g, '<br>'),
        settings
      });
      
      // Update CRM
      db.updateContact(contact.id, { outreachStatus: 'Contacted' });
      db.addOutreachLog({
        contactId: contact.id,
        opportunityId: opp.id,
        contactName: contact.fullName,
        company: contact.company,
        email: contact.email,
        subject: draft.subject,
        body: draft.body,
        version: draft.version,
        messageId: info.messageId,
        status: settings.mock_mode ? 'mock-sent' : 'sent'
      });

      sentLogs.push({
        email: contact.email,
        name: contact.fullName,
        company: contact.company,
        status: 'Success'
      });
    } catch (err) {
      db.addLog(`Failed to send email to ${contact.email}: ${err.message}`, 'error');
      db.addOutreachLog({
        contactId: contact.id,
        opportunityId: opp.id,
        contactName: contact.fullName,
        company: contact.company,
        email: contact.email,
        subject: draft.subject,
        body: draft.body,
        version: draft.version,
        status: 'failed',
        error: err.message
      });
      sentLogs.push({
        email: contact.email,
        name: contact.fullName,
        company: contact.company,
        status: 'Failed'
      });
    }
  }

  return sentLogs;
}

/**
 * Sends a daily digest report summarizing new pipeline data and outbound logs.
 */
export async function sendDailySummaryReport(newOpps = [], newContacts = [], sentOutreach = []) {
  db.addLog('Compiling Daily Summary Report (Agent 6)...', 'info');
  const settings = db.getSettings();

  const allOpps = db.getOpportunities();
  const highPriorityOpps = allOpps
    .filter(o => o.status === 'shortlisted')
    .sort((a, b) => b.qualificationScore.overallScore - a.qualificationScore.overallScore)
    .slice(0, 10);

  const allContacts = db.getContacts();

  const newOppsTable = newOpps.length > 0 
    ? newOpps.map(o => {
        const oppContacts = allContacts.filter(c => c.opportunityId === o.id);
        const dmText = oppContacts.length > 0 
          ? oppContacts.map(c => `• ${c.fullName}${c.designation ? ` (${c.designation})` : ''}`).join('<br>')
          : 'None';
        return `
          <tr>
            <td style="border:1px solid #ddd; padding:8px;">${o.propertyName}</td>
            <td style="border:1px solid #ddd; padding:8px;">${o.city}, ${o.state}</td>
            <td style="border:1px solid #ddd; padding:8px;">${o.projectType}</td>
            <td style="border:1px solid #ddd; padding:8px; text-align:center; font-weight:bold; color:${o.status === 'shortlisted' ? 'green' : 'red'};">${o.qualificationScore?.overallScore || 'N/A'}</td>
            <td style="border:1px solid #ddd; padding:8px; font-size:12px;">${dmText}</td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="5" style="border:1px solid #ddd; padding:8px; text-align:center;">No new opportunities discovered today.</td></tr>';

  const newContactsList = newContacts.length > 0
    ? newContacts.map(c => `
        <li><strong>${c.fullName}</strong> - ${c.designation} at <em>${c.company}</em> (Email: ${c.email || 'Not found'})</li>
      `).join('')
    : '<li>No new decision makers identified today.</li>';

  const sentOutreachList = sentOutreach.length > 0
    ? sentOutreach.map(s => `
        <li>Sent to: <strong>${s.name}</strong> (${s.email}) at <em>${s.company}</em> - Status: <strong>${s.status}</strong></li>
      `).join('')
    : '<li>No outreach emails sent today.</li>';

  const topOppsList = highPriorityOpps.map(o => {
    const oppContacts = allContacts.filter(c => c.opportunityId === o.id);
    const dmText = oppContacts.length > 0 
      ? oppContacts.map(c => `• ${c.fullName}${c.designation ? ` (${c.designation})` : ''}`).join('<br>')
      : 'None';
    return `
      <tr>
        <td style="border:1px solid #ddd; padding:8px;"><strong>${o.propertyName}</strong></td>
        <td style="border:1px solid #ddd; padding:8px;">${o.city}</td>
        <td style="border:1px solid #ddd; padding:8px; text-align:center;"><strong>${o.qualificationScore.overallScore}</strong></td>
        <td style="border:1px solid #ddd; padding:8px; font-size:12px;">${dmText}</td>
        <td style="border:1px solid #ddd; padding:8px;">${o.qualificationScore.reasoning}</td>
      </tr>
    `;
  }).join('');

  const reportHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
      <h2 style="color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px;">Daily Hospitality pipeline Report - Fanusta</h2>
      <p>Hello Dinesh,</p>
      <p>Here is the automated pipeline report for today, <strong>${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</strong>.</p>
      
      <h3 style="color: #2980b9; margin-top: 25px;">1. New Opportunities Discovered</h3>
      <table style="width:100%; border-collapse:collapse; margin-bottom: 15px;">
        <thead>
          <tr style="background-color:#f2f2f2;">
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Property</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Location</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Type</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:center;">Score</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Decision Makers</th>
          </tr>
        </thead>
        <tbody>
          ${newOppsTable}
        </tbody>
      </table>
      
      <h3 style="color: #2980b9; margin-top: 25px;">2. Decision Makers Found</h3>
      <ul>
        ${newContactsList}
      </ul>
      
      <h3 style="color: #2980b9; margin-top: 25px;">3. Outreach Sent Today</h3>
      <ul>
        ${sentOutreachList}
      </ul>
      
      <h3 style="color: #2980b9; margin-top: 25px;">4. Top 10 High Priority Opportunities in CRM</h3>
      <table style="width:100%; border-collapse:collapse; margin-bottom: 15px;">
        <thead>
          <tr style="background-color:#e8f4f8;">
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Property</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Location</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:center;">Score</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Decision Makers</th>
            <th style="border:1px solid #ddd; padding:8px; text-align:left;">Qualification Reasoning</th>
          </tr>
        </thead>
        <tbody>
          ${topOppsList}
        </tbody>
      </table>

      <p style="margin-top: 30px; font-size: 12px; color: #7f8c8d; border-top: 1px solid #eee; padding-top: 10px;">
        This is an automated report generated by your Fanusta Opportunity Discovery Agent. 
        You can view and manage these opportunities at the local dashboard: <a href="http://localhost:3050">http://localhost:3050</a>.
      </p>
    </div>
  `;

  const subject = `Fanusta Daily Hospitality Pipeline Report - ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

  try {
    const recipient = settings.summary_recipient || 'dinesh@fanusta.com';
    db.addLog(`Sending Daily Summary Email to ${recipient}...`, 'info');
    
    await sendEmail({
      to: recipient,
      subject,
      text: 'Please view the HTML version of this email to see the daily hospitality pipeline report.',
      html: reportHtml,
      settings
    });
    db.addLog('Daily Summary Email sent successfully!', 'info');
  } catch (error) {
    db.addLog(`Failed to send Daily Summary Email: ${error.message}`, 'error');
  }
}
