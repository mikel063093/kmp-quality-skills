#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isGlobal = args.includes('--global');
const isList = args.includes('list');

const skillsDir = path.join(__dirname, '..', 'skills');
const skills = fs.readdirSync(skillsDir).filter(f =>
  fs.statSync(path.join(skillsDir, f)).isDirectory()
);

if (isList) {
  console.log('\nkmp-quality-skills — Available skills:\n');
  skills.forEach(skill => {
    const skillPath = path.join(skillsDir, skill, 'SKILL.md');
    const content = fs.readFileSync(skillPath, 'utf-8');
    const descMatch = content.match(/## Description\n([^\n]+)/);
    const desc = descMatch ? descMatch[1] : '';
    console.log(`  ${skill.padEnd(28)} ${desc}`);
  });
  console.log('\nInstall: npx kmp-quality-skills');
  process.exit(0);
}

const targetBase = isGlobal
  ? path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'skills')
  : path.join(process.cwd(), '.claude', 'skills');

fs.mkdirSync(targetBase, { recursive: true });

let installed = 0;
skills.forEach(skill => {
  const src = path.join(skillsDir, skill);
  const dest = path.join(targetBase, skill);
  fs.mkdirSync(dest, { recursive: true });
  const skillFile = path.join(src, 'SKILL.md');
  fs.copyFileSync(skillFile, path.join(dest, 'SKILL.md'));
  installed++;
  console.log(`  ✓ ${skill}`);
});

console.log(`\nInstalled ${installed} KMP quality skills to ${targetBase}`);
console.log('Your AI coding agent will now use these skills automatically.\n');
