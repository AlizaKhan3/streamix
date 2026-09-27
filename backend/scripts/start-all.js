#!/usr/bin/env node
// Spawns all microservices locally (gateway on :4000). Use when DBs run in Docker.
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const services = [
  'user-service',
  'catalog-service',
  'watchlist-service',
  'review-service',
  'recommendation-service',
  'analytics-service',
  'gateway',
];

const kids = services.map((name) => {
  const child = spawn('node', [`services/${name}/index.js`], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => {
    console.error(`[start-all] ${name} exited (${code})`);
    process.exit(code || 1);
  });
  return child;
});

process.on('SIGINT', () => {
  kids.forEach((k) => k.kill('SIGINT'));
  process.exit(0);
});
process.on('SIGTERM', () => {
  kids.forEach((k) => k.kill('SIGTERM'));
  process.exit(0);
});

console.log('[start-all] gateway :4000 + 6 services');
