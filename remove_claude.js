const fs = require('fs');
const content = fs.readFileSync(0, 'utf-8');
const newContent = content.replace(/Co-Authored-By: Claude.*/gi, '');
process.stdout.write(newContent);
