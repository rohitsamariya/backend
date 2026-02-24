require('dotenv').config();
const mongoose = require('mongoose');
const { DateTime } = require('luxon');

const Salary = require('../models/payroll/SalaryStructure');
const Payroll = require('../models/PayrollSummary');
const User = require('../models/User');
const eng = require('../services/payroll/salaryEngine');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const userId = '6996e899b991503c970be9b7';
  const user = await User.findById(userId).select('joiningDate createdAt name').lean();
  if (!user) throw new Error('User not found');

  const effectiveFrom = DateTime.fromJSDate(user.joiningDate || user.createdAt).startOf('month').toJSDate();

  const active = await Salary.findOne({ user: userId, isActive: true }).sort({ effectiveFrom: -1, version: -1 });
  if (!active) throw new Error('No active salary structure');

  console.log('Before update active structure:', {
    id: active._id,
    version: active.version,
    effectiveFrom: active.effectiveFrom,
    grossSalary: active.grossSalary
  });

  active.effectiveFrom = effectiveFrom;
  await active.save();

  console.log('After update active structure:', {
    id: active._id,
    version: active.version,
    effectiveFrom: active.effectiveFrom,
    grossSalary: active.grossSalary
  });

  const months = await Payroll.find({ user: userId }).select('month year').lean();
  const uniqMap = new Map();
  for (const m of months) uniqMap.set(`${m.year}-${m.month}`, m);
  const uniq = [...uniqMap.values()].sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year));

  console.log('Reprocessing months:', uniq);

  for (const m of uniq) {
    const runId = `manual-fix-${Date.now()}-${m.year}-${m.month}`;
    const res = await eng.processEmployee(userId, m.month, m.year, { payrollRunId: runId });

    if (!res.skipped && res.data) {
      await Payroll.findByIdAndUpdate(res.data._id, { status: 'FINALIZED', finalizedAt: new Date() });
      console.log(`Reprocessed ${m.month}/${m.year}: payroll=${res.data._id}`);
    } else {
      console.log(`Skipped ${m.month}/${m.year}: ${res.reason}`);
    }
  }

  const check = await Payroll.find({ user: userId })
    .sort({ year: 1, month: 1, createdAt: 1 })
    .select('month year grossSalary lopDeduction status salaryStructureVersion createdAt')
    .lean();

  console.log('Post-fix payrolls:', check);

  await mongoose.disconnect();
  console.log('Hotfix completed');
})().catch(async (e) => {
  console.error('HOTFIX FAILED', e);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
