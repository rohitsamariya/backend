const mongoose = require('mongoose');
const User = require('./models/User');
const salaryEngine = require('./services/payroll/salaryEngine');
require('dotenv').config();

const testPayroll = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const email = 'rsamariya50@gmail.com';
        const user = await User.findOne({ email });

        if (!user) {
            console.error('User not found');
            process.exit(1);
        }

        const month = 2; // February
        const year = 2026;

        console.log(`Processing payroll for ${user.name} for ${month}/${year}...`);
        const result = await salaryEngine.processEmployee(user._id.toString(), month, year);

        if (result.skipped) {
            console.log('Calculation skipped:', result.reason);
        } else {
            const p = result.data;
            console.log('Payroll Result:');
            console.log('- Gross Salary:', p.grossSalary);
            console.log('- Net Salary:', p.netSalary);
            console.log('- LOP Days:', p.lopDays);
            console.log('- LOP Deduction:', p.lopDeduction);
            console.log('- Total Working Days:', p.totalWorkingDays);
            console.log('- Probation Status:', p.probationStatus);
            console.log('- Calculation Log:', JSON.parse(p.calculationLog));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

testPayroll();
