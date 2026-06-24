const fs = require('fs');
const path = 'src/app/api/sub/[token]/route.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace("includes('dYs?')", "includes('🚀')");
fs.writeFileSync(path, content, 'utf8');
console.log(content.includes('dYs?') ? 'FAILED' : 'SUCCESS');
