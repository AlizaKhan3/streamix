// Loads .env and lets npm scripts pass settings as CLI flags, which works the
// same on Windows and Linux:  node src/index.js --region=US --port=4002 --db-mode=host
require('dotenv').config();

const FLAG_TO_ENV = { region: 'REGION', port: 'PORT', 'db-mode': 'DB_MODE' };

for (const arg of process.argv.slice(2)) {
  const match = /^--([a-z-]+)=(.*)$/.exec(arg);
  if (match && FLAG_TO_ENV[match[1]]) process.env[FLAG_TO_ENV[match[1]]] = match[2];
}

process.env.JWT_SECRET ||= 'streamix-dev-jwt-secret-change-me';
process.env.INTERNAL_SECRET ||= 'streamix-dev-internal-secret-change-me';
