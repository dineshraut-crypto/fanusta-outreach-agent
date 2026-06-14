import { runPipelineWorkflow } from './src/agents/orchestrator.js';
import { db } from './src/database.js';
import dotenv from 'dotenv';

dotenv.config();

db.addLog('Starting Daily CLI pipeline run...', 'info');

runPipelineWorkflow()
  .then(result => {
    if (result.success) {
      db.addLog('Daily pipeline run completed successfully.', 'info');
      process.exit(0);
    } else {
      db.addLog(`Daily pipeline run failed: ${result.error}`, 'error');
      process.exit(1);
    }
  })
  .catch(err => {
    db.addLog(`Daily pipeline runner crashed: ${err.message}`, 'error');
    process.exit(1);
  });
