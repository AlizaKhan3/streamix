// Gateway-to-gateway endpoints (inter-region link). Protected by INTERNAL_SECRET.
const router = require('express').Router();
const { requireInternal } = require('../middleware/auth');
const { runOp } = require('../services/ops');
const { isPartitioned, setPartition } = require('../services/rpc');

router.use(requireInternal);

router.post('/rpc', async (req, res) => {
  const { op, args, from } = req.body || {};
  if (from && isPartitioned(from)) {
    return res.status(503).json({ error: `Region link to ${from} is partitioned (simulated)` });
  }
  res.json({ result: (await runOp(op, args)) ?? null });
});

router.post('/partition', (req, res) => {
  const { from, enabled } = req.body || {};
  setPartition(from, !!enabled);
  res.json({ partitionedFrom: from, enabled: !!enabled });
});

module.exports = router;
