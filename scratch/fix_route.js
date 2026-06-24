const fs = require('fs');
const path = 'src/app/api/sub/[token]/route.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace("s.name?.includes('dYs?')", "s.name?.includes('🚀')");
fs.writeFileSync(path, content, 'utf8');
console.log('Fixed');
