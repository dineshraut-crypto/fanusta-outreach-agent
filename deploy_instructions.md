# 24/7 Cloud Deployment & Google Sheets Setup Guide

To run this agent system 24/7 and collect leads even when your local computer is shut down, you must deploy the application to a cloud hosting platform and link it to a cloud spreadsheet (Google Sheets).

---

## 1. Cloud Hosting Options

### Option A: Railway (Highly Recommended)
Railway.app is the easiest platform for Node.js applications. It supports persistent disks so your local files (like the SQLite/JSON databases and Excel spreadsheet) do not get deleted when the app restarts.

1. **Upload your code to GitHub**: Create a private GitHub repository and push your project code there.
2. **Connect to Railway**:
   - Go to [Railway.app](https://railway.app) and log in with your GitHub account.
   - Click **New Project** -> **Deploy from GitHub repo** and select your repository.
3. **Configure a Persistent Volume** (Required to save the Excel file):
   - In your Railway service settings, go to **Volumes** -> **Add Volume**.
   - Set the mount path to `/app/data` (which maps to your `data/` folder).
4. **Deploy**: Railway will automatically build and deploy your project. It will run the server 24/7.

### Option B: Render (Free Tier)
Render.com is a free alternative, but the free tier will "sleep" if there is no web traffic. 

1. **Connect to Render**:
   - Create a free account at [Render.com](https://render.com).
   - Click **New** -> **Web Service** and connect your GitHub repository.
2. **Setup cron-job ping**:
   - Because Render free tier goes to sleep after 15 minutes of inactivity, you can use a free uptime pinger (like [UptimeRobot.com](https://uptimerobot.com)) to ping your dashboard URL (`https://your-app.onrender.com`) every 5 minutes to keep it awake.
3. **Persistent Disk**:
   - Under the service **Advanced** settings, mount a Disk to `/opt/render/project/src/data` to keep your leads saved.

---

## 2. Environment Variables Configuration
In your Railway or Render settings dashboard, add the following variables under **Variables / Environment Variables**:

| Variable | Value / Description |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `PORT` | `8080` (or leave default, Railway configures this automatically) |
| `GEMINI_API_KEY` | *Your Google Gemini API Key* |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | *Your Gmail Address* |
| `SMTP_PASS` | *Your Gmail App Password* |

---

## 3. Google Sheets Integration (Cloud Excel Sync)
Because local Excel files can be hard to open from mobile devices, you can easily sync your leads to a live **Google Sheet** (which serves as your cloud Excel database).

### Step 1: Create Google Sheets Credentials
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project, search for the **Google Sheets API**, and click **Enable**.
3. Go to **APIs & Services** -> **Credentials**. Click **Create Credentials** -> **Service Account**.
4. In the service account details, go to **Keys** -> **Add Key** -> **Create New Key (JSON)**. Download the JSON key file.
5. Copy the `client_email` address inside that downloaded JSON file.
6. Open your Target Google Sheet where you want leads collected and **Share** it with that `client_email` as an **Editor**.

### Step 2: Add Google Sheets Sync to Code
You can install the official Google API package:
```bash
npm install googleapis
```
And add this small function to `src/excel.js` (or trigger it in `src/agents/orchestrator.js`) to append new leads directly:

```javascript
import { google } from 'googleapis';

export async function appendLeadToGoogleSheets(lead) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: './data/google-credentials.json', // Put your downloaded JSON here
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = 'YOUR_GOOGLE_SPREADSHEET_ID_HERE'; // Extract from sheet URL
    
    const values = [[
      lead.propertyName,
      lead.city,
      lead.projectType,
      lead.qualificationScore.overallScore,
      lead.contactName,
      lead.email,
      lead.linkedIn,
      new Date().toLocaleDateString('en-IN')
    ]];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:H',
      valueInputOption: 'USER_ENTERED',
      resource: { values },
    });
    
    console.log('Successfully synced lead to Google Sheets!');
  } catch (error) {
    console.error('Google Sheets Sync Failed:', error.message);
  }
}
```
Triggering this ensures that your sales pipeline updates on Google Sheets in real time, 24/7, accessible from your computer, phone, or tablet even when your local system is turned off!
