require('dotenv').config();
const mongoose = require('mongoose');

const PayrollSummary = require('../models/PayrollSummary');
const LeaveLedger = require('../models/payroll/LeaveLedger');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const superseded = await PayrollSummary.find({ status: 'SUPERSEDED' }).select('_id user month year').lean();
  const ids = superseded.map(s => s._id);

  if (!ids.length) {
    console.log('[cleanupSupersededLedger] No superseded payrolls found.');
    await mongoose.disconnect();
    return;
  }

  const del = await LeaveLedger.deleteMany({ referenceId: { $in: ids } });
  console.log(`[cleanupSupersededLedger] Superseded payroll records: ${ids.length}`);
  console.log(`[cleanupSupersededLedger] Leave ledger rows deleted: ${del.deletedCount}`);

  await mongoose.disconnect();
  console.log('[cleanupSupersededLedger] Done');
})().catch(async (e) => {
  console.error('[cleanupSupersededLedger] Failed', e);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
