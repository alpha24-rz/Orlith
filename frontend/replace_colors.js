const fs = require('fs');
const path = '/home/alpha/Documents/documind-ai/frontend/app/dashboard/layout.tsx';
let content = fs.readFileSync(path, 'utf-8');

const replacements = {
  'bg-\\[#0A0A0F\\]': 'bg-background',
  'bg-\\[#0E0E16\\]': 'bg-bg-sidebar',
  'bg-\\[#16161F\\]': 'bg-bg-panel',
  'bg-\\[#111118\\]': 'bg-bg-input',
  'bg-\\[#1C1C28\\]': 'bg-bg-hover',
  'border-\\[#1E1E2E\\]': 'border-border-subtle',
  'border-\\[#2A2A3A\\]': 'border-border-strong',
  'border-\\[#3A3A4E\\]': 'border-border-strong',
  'text-\\[#9090A8\\]': 'text-text-subtle',
  'text-\\[#5A5A72\\]': 'text-text-muted',
  'text-white': 'text-foreground',
  'ring-white': 'ring-foreground',
  'ring-offset-\\[#16161F\\]': 'ring-offset-bg-panel'
};

for (const [key, value] of Object.entries(replacements)) {
  content = content.replace(new RegExp(key, 'g'), value);
}

// Restore button text-white
content = content.replace('bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-foreground text-sm', 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm');

fs.writeFileSync(path, content);
console.log('Replaced successfully');
