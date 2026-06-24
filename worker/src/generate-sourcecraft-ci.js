import fs from 'node:fs';
import path from 'node:path';
import { supa, closeSupa } from './supa.js';
import { log } from './log.js';

(async () => {
  log.step('Generating dynamic SourceCraft ci.yaml based on alive candidates...');

  // 1. Get the number of alive servers
  const { count, error } = await supa
    .from('candidates')
    .select('*', { count: 'exact', head: true })
    .eq('alive', true);

  if (error) {
    log.err(`Failed to count alive servers: ${error.message}`);
    await closeSupa();
    process.exit(1);
  }

  const aliveCount = count || 1;
  log.info(`Total alive servers ready for Russia DPI scan: ${aliveCount}`);

  // 2. Calculate dynamic chunks for SourceCraft
  // Using 1500 per task as a safe default for DPI testing
  const CHUNKS_PER_TASK = 1500;
  let targetTasks = Math.ceil(aliveCount / CHUNKS_PER_TASK);
  if (targetTasks < 1) targetTasks = 1;
  if (targetTasks > 20) targetTasks = 20;

  log.ok(`Calculated ${targetTasks} concurrent tasks for SourceCraft.`);

  // 3. Generate ci.yaml content
  const workflowName = 'discovery-workflow';
  
  let yaml = `on:
  push:
    - workflows: ${workflowName}
      filter:
        branches: ["main"]

workflows:
  ${workflowName}:
    tasks:
`;

  // Add task names to workflow
  for (let i = 0; i < targetTasks; i++) {
    yaml += `      - discovery-task-${i + 1}\n`;
  }

  yaml += `
tasks:
`;

  // Add tasks definitions using the user's exact template
  for (let i = 0; i < targetTasks; i++) {
    yaml += `  - name: discovery-task-${i + 1}
    cubes:
      - name: test-russia-part${i + 1}
        image: docker.io/library/node:22
        env:
          SUPABASE_URL: \${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          ENABLE_SPEED_TEST: \${{ secrets.ENABLE_SPEED_TEST }}
          XRAY_KNIFE_CORE: auto
          TEST_CONCURRENCY: "30"
          SUPA_PAGE_SIZE: "1000"
          SUPA_CONCURRENCY: "10"
          TEST_CHUNKS_TOTAL: "${targetTasks}"
          TEST_CHUNK_INDEX: "${i}"
        script:
          - echo "=== Extracting xray-knife ==="
          - apt-get update && apt-get install -y unzip
          - unzip -o xk.zip -d xk-bin
          - chmod +x xk-bin/xray-knife*
          - export XRAY_KNIFE_PATH=$(find $PWD/xk-bin -type f -name 'xray-knife*' | head -1)
          - echo "=== Cloning latest worker code from GitHub ==="
          - git clone https://github.com/islemAZ360/Galaxy-VPN-pro.git github-repo
          - cd github-repo/worker
          - echo "=== Unlocking Database Restrictions for CI ==="
          - sed -i 's/Math.min(30,/Math.min(1000,/g' src/sync.js
          - echo "=== Installing dependencies ==="
          - npm install
          - echo "=== Running Smart System Wi-Fi DPI Test (Part ${i + 1}) ==="
          - npm run sync:wifi\n\n`;
  }

  // 4. Write to the cloned repo directory
  const repoPath = path.resolve(process.cwd(), '../sc');
  const sourcecraftDir = path.join(repoPath, '.sourcecraft');
  const ciYamlPath = path.join(sourcecraftDir, 'ci.yaml');

  try {
    if (!fs.existsSync(sourcecraftDir)) {
      fs.mkdirSync(sourcecraftDir, { recursive: true });
    }
    fs.writeFileSync(ciYamlPath, yaml, 'utf8');
    log.ok(`Successfully wrote dynamic ci.yaml with ${targetTasks} tasks to ${ciYamlPath}`);
  } catch (writeErr) {
    log.err(`Failed to write ci.yaml: ${writeErr.message}`);
    log.warn('If running locally, this is expected since ../sc might not exist.');
  }

  await closeSupa();
})();
