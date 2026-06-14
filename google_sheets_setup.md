# Google Sheets Web App Setup Guide (100% Free)

This guide shows you how to connect your live agent system to a **Google Sheet** (serving as your live, date-wise Excel database) using a simple, free **Google Apps Script Web App**.

---

## Step 1: Open Google Sheets
1. Create a new Google Sheet or open an existing one.
2. Add the following headers in row 1 (columns A to O) so your data has columns:
   `Timestamp`, `Property Name`, `Hotel Group`, `City`, `State`, `Project Type`, `Expected Timeline`, `Lead Score`, `Contact Name`, `Designation`, `Role`, `Email`, `LinkedIn`, `Outreach Status`, `Reasoning`, `Source URL`

---

## Step 2: Paste the Apps Script Code
1. In the Google Sheets menu, click **Extensions** -> **Apps Script**.
2. Delete any default code in the editor, and paste the following script:

```javascript
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    // Append row to sheet date-wise
    sheet.appendRow([
      new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), // Indian Timestamp
      data.propertyName,
      data.hotelGroup,
      data.city,
      data.state,
      data.projectType,
      data.expectedTimeline,
      data.overallScore,
      data.contactName,
      data.designation,
      data.role,
      data.email,
      data.linkedIn,
      data.outreachStatus,
      data.reasoning,
      data.sourceUrl
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ result: "success" }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ result: "error", message: error.message }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}
```
3. Click the **Save** icon (floppy disk) at the top of the editor.

---

## Step 3: Deploy as a Web App
1. Click the **Deploy** button (top right of the editor) -> **New deployment**.
2. Click the **Select type** gear icon next to "Configuration" and choose **Web app**.
3. Set the configuration details exactly as follows:
   - **Description**: `Fanusta Outreach Webhook`
   - **Execute as**: `Me (your-gmail-address@gmail.com)`
   - **Who has access**: `Anyone` *(Crucial: This allows your cloud server to send the data without complex passwords)*.
4. Click **Deploy**.
5. *Note: Google will show a popup asking to authorize access. Click **Authorize access**, choose your account, click **Advanced** (at the bottom of the prompt), and click **Go to Untitled project (unsafe)** to approve the permission.*
6. Once deployed, copy the **Web app URL** provided (it looks like `https://script.google.com/macros/s/.../exec`).

---

## Step 4: Add the URL to Your Live Dashboard
1. Open your live dashboard: `https://your-service-name.onrender.com`.
2. Go to the **Settings** tab.
3. Scroll to the **Campaign Parameters** card.
4. Paste the copied web app URL into the **Google Sheet Web App URL** input field.
5. Click **Save Parameters**.

**All set!** The next time you run a discovery campaign, every qualified shortlisted lead and contact will instantly populate your Google Sheet in real time, date-wise!
