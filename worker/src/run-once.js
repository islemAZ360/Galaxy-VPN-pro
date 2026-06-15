import { runWifiCascade } from './sync.js';

// One-shot run for local testing: `npm run sync`
runWifiCascade().then((log) => {
  console.log(JSON.stringify(log, null, 2));
  process.exit(0);
});
