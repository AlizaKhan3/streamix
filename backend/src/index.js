// Legacy entrypoint — prefer `npm start` (all microservices) or docker compose.
console.log('Monolith entry deprecated. Starting all microservices via scripts/start-all.js ...');
require('../scripts/start-all');
