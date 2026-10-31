const fs = require('fs');
const content = fs.readFileSync('google_apps_script/Index.html', 'utf8');

const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const stack = [];
let pos = 0;
let line = 1;

const re = /<!--[\s\S]*?-->|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<([a-zA-Z0-9\-]+)([^>]*)>|<\/([a-zA-Z0-9\-]+)>/gi;
let match;
let errors = [];

while ((match = re.exec(content)) !== null) {
  const full = match[0];
  const tagOpen = match[1];
  const tagAttrs = match[2];
  const tagClose = match[3];

  const sub = content.substring(pos, match.index);
  const newlines = (sub.match(/\n/g) || []).length;
  line += newlines;
  pos = match.index;

  if (full.startsWith('<!--') || full.startsWith('<script') || full.startsWith('<style')) {
    continue;
  }

  if (tagOpen) {
    const tagName = tagOpen.toLowerCase();
    const isSelfClosing = tagAttrs && tagAttrs.trim().endsWith('/');
    if (!voidTags.has(tagName) && !isSelfClosing) {
      stack.push({ tag: tagName, line: line });
    }
  } else if (tagClose) {
    const tagName = tagClose.toLowerCase();
    if (stack.length === 0) {
      errors.push(`Unexpected closing tag </${tagName}> at line ${line}`);
    } else {
      const top = stack.pop();
      if (top.tag !== tagName) {
        errors.push(`Mismatched tag: expected </${top.tag}> (from line ${top.line}), got </${tagName}> at line ${line}`);
      }
    }
  }
}

if (stack.length > 0) {
  stack.forEach(s => errors.push(`Unclosed tag <${s.tag}> opened at line ${s.line}`));
}

if (errors.length === 0) {
  console.log('✅ HTML tags are 100% valid and properly nested!');
} else {
  console.error(`❌ Found ${errors.length} tag errors:`);
  errors.slice(0, 15).forEach(e => console.error('  ', e));
  process.exit(1);
}
