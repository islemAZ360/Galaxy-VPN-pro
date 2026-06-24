import fs from 'node:fs';
import path from 'node:path';
import { supa, closeSupa } from './supa.js';
import { log } from './log.js';

(async () => {
  log.step('Generating dynamic SourceCraft ci.yaml...');

  // 1. Get the number of alive servers from candidates
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
  // Since Russia DPI is slower and more intensive, let's target ~1000 servers per task
  // Max out at 20 tasks just in case
  const CHUNKS_PER_TASK = 1000;
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

  // Add tasks definitions
  for (let i = 0; i < targetTasks; i++) {
    yaml += `  - name: discovery-task-${i + 1}
    cubes:
      - name: test russia part${i + 1}
        image: docker.io/library/node:22
        env:
          SUPABASE_URL: \${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: \${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          XRAY_KNIFE_CORE: auto
          SUPA_PAGE_SIZE: "1000"
          SUPA_CONCURRENCY: "10"
          TEST_CHUNKS_TOTAL: "${targetTasks}"
          TEST_CHUNK_INDEX: "${i}"
`;
  }

  // 4. Write to the cloned repo directory
  // The github action will clone the repo into "../sc" relative to worker dir
  const repoPath = path.resolve(process.cwd(), '../sc');
  const ciYamlPath = path.join(repoPath, '.sourcecraft', 'ci.yaml');

  try {
    fs.mkdirSync(path.join(repoPath, '.sourcecraft'), { recursive: true });
    fs.writeFileSync(ciYamlPath, yaml, 'utf8');
    log.ok(`Successfully wrote dynamic ci.yaml with ${targetTasks} tasks to ${ciYamlPath}`);
  } catch (writeErr) {
    log.err(`Failed to write ci.yaml: ${writeErr.message}`);
    await closeSupa();
    process.exit(1);
  }

  await closeSupa();
})();
