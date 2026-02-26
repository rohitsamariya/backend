const mongoose = require('mongoose');
const User = require('./models/User');
const PayrollSummary = require('./models/PayrollSummary');
const salaryEngine = require('./services/payroll/salaryEngine');
require('dotenv').config();

const fixAndRecalculate = async () => {
    try {
        const liveUri = 'mongodb://hrmsuser:j6jTgFYcflQgEq32@ac-gdvbveo-shard-00-02.akr9n7d.mongodb.net:27017/hrms_attendance?ssl=true&authSource=admin&directConnection=true';
        await mongoose.connect(liveUri);
        console.log('Connected to MongoDB');

        const email = 'rsamariya50@gmail.com';
        const user = await User.findOne({ email });

        if (!user) {
            console.error('User not found');
            process.exit(1);
        }

        // Delete existing payroll summaries for Feb 2026 to allow clean recalculation
        const deleted = await PayrollSummary.deleteMany({
            user: user._id,
            month: 2,
            year: 2026
        });
        console.log(`Deleted ${deleted.deletedCount} existing payroll summaries for Feb 2026`);

        // Recalculate
        console.log(`Recalculating payroll for ${user.name} for 2/2026...`);
        const result = await salaryEngine.processEmployee(user._id.toString(), 2, 2026);

        if (result.skipped) {
            console.log('Calculation skipped:', result.reason);
        } else {
            const p = result.data;
            console.log('New Payroll Result:');
            console.log('- Gross Salary:', p.grossSalary);
            console.log('- Net Salary:', p.netSalary);
            console.log('- LOP Days:', p.lopDays);

            // Mark as finalized so it appears in the register correctly
            p.status = 'FINALIZED';
            p.finalizedAt = new Date();
            await p.save();
            console.log('Payroll marked as FINALIZED');

            // Trigger Email
            const emailService = require('./services/payroll/payrollEmailService');
            console.log('Attempting to send payslip email...');
            await emailService.sendPayslipEmail(p._id);
            console.log('Email dispatch triggered');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

fixAndRecalculate();
