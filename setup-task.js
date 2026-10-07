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

// PowerShell command construction for resilient registration:
// - StartWhenAvailable: runs as soon as PC wakes up or turns on if scheduled time was missed
// - AllowStartIfOnBatteries / DontStopIfGoingOnBatteries: allows running on battery
// - WakeToRun: wakes PC to run
const command = `powershell -ExecutionPolicy Bypass -Command "$action = New-ScheduledTaskAction -Execute '${nodePath}' -Argument '${runnerPath}' -WorkingDirectory '${__dirname}'; $trigger = New-ScheduledTaskTrigger -Daily -At '${runTime}'; $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -WakeToRun -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew; Register-ScheduledTask -TaskName '${taskName}' -Action $action -Trigger $trigger -Settings $settings -Force"`;

console.log(`Setting up Resilient Windows Scheduled Task...`);
console.log(`Node Executable: ${nodePath}`);
console.log(`Script Runner: ${runnerPath}`);
console.log(`Target Time: ${runTime} daily`);
console.log(`Executing task registration...\n`);

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
    process.exit(1);
  }
  
  console.log('SUCCESS: Resilient scheduled task registered successfully!');
  console.log(`\nThe agent system will now launch automatically every day at ${runTime} AM local time, and run immediately upon wake/startup if the scheduled time was missed.`);
  process.exit(0);
});
