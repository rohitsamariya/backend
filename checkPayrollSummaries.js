const mongoose = require('mongoose');
const User = require('./models/User');
const PayrollSummary = require('./models/PayrollSummary');
require('dotenv').config();

const checkPayroll = async () => {
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

        const payrolls = await PayrollSummary.find({ user: user._id, month: 2, year: 2026 });
        console.log(`Found ${payrolls.length} payroll summaries for Feb 2026`);
        payrolls.forEach(p => {
            console.log(`- ID: ${p._id}, Status: ${p.status}, Net Salary: ${p.netSalary}, Gross: ${p.grossSalary}, LOP Days: ${p.lopDays}, Email Sent: ${p.emailSent}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkPayroll();
