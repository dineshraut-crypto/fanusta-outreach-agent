import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nodePath = process.execPath;
const runnerPath = path.resolve(__dirname, 'run-daily.js');

// Task details
const taskName = 'FanustaHospitalityOutreach';
const runTime = '08:00'; // 8:00 AM

// schtasks command construction
// Using /f to force creation and overwrite if exists
const command = `schtasks /create /tn "${taskName}" /tr "\\"${nodePath}\\" \\"${runnerPath}\\"" /sc daily /st ${runTime} /f`;

console.log(`Setting up Windows Scheduled Task...`);
console.log(`Node Executable: ${nodePath}`);
console.log(`Script Runner: ${runnerPath}`);
console.log(`Target Time: ${runTime} daily`);
console.log(`Executing: ${command}\n`);

if (process.platform !== 'win32') {
  console.error('ERROR: Scheduled task setup is only supported on Windows operating systems.');
  process.exit(1);
}

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error('------------------------------------------------------------');
    console.error(`ERROR: Failed to create scheduled task.`);
    console.error(stderr || error.message);
    console.error('------------------------------------------------------------');
    console.log('\nTIP: This script might require Administrator privileges to register system tasks.');
    console.log('Please try running this command in an Administrator PowerShell console:');
    console.log(`\n  schtasks /create /tn "${taskName}" /tr "\\"${nodePath}\\" \\"${runnerPath}\\"" /sc daily /st ${runTime} /f\n`);
    process.exit(1);
  }
  
  console.log('SUCCESS: Scheduled task registered successfully!');
  console.log(stdout.trim());
  console.log(`\nThe agent system will now launch automatically every day at 8:00 AM local time.`);
  console.log('You can view, edit, or delete this task in Windows "Task Scheduler" under Active Tasks.');
  process.exit(0);
});
