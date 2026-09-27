const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_MODE = 'host';
process.env.REGION = 'PK';
const topology = require('../src/config/topology');

test('content_id range decides the movie fragment', () => {
  assert.equal(topology.fragmentIndexFor(27205), 0);
  assert.equal(topology.fragmentIndexFor(299999), 0);
  assert.equal(topology.fragmentIndexFor(300000), 1);
  assert.equal(topology.fragmentIndexFor(9000001), 1);
});

test('node names map to the published host ports', () => {
  assert.deepEqual(topology.nodeEndpoint('pk-user-primary'), { host: 'localhost', port: 5501, database: 'user_db' });
  assert.deepEqual(topology.nodeEndpoint('us-movie-f1-replica'), { host: 'localhost', port: 5622, database: 'movie_db' });
  assert.deepEqual(topology.nodeEndpoint('global-directory'), { host: 'localhost', port: 5700, database: 'directory_db' });
});

test('every region has the same full stack of nodes', () => {
  const pk = topology.regionNodes('PK').map((n) => n.name.replace(/^pk-/, ''));
  const us = topology.regionNodes('US').map((n) => n.name.replace(/^us-/, ''));
  assert.deepEqual(pk, us);
  assert.equal(pk.length, 8);
});

test('gateways resolve per region', () => {
  assert.equal(topology.gatewayUrl('PK'), 'http://localhost:4001');
  assert.equal(topology.gatewayUrl('US'), 'http://localhost:4002');
});
