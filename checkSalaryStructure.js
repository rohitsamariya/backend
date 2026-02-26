const mongoose = require('mongoose');
const User = require('./models/User');
const SalaryStructure = require('./models/payroll/SalaryStructure');
require('dotenv').config();

const checkStructure = async () => {
    try {
        const liveUri = 'mongodb://hrmsuser:j6jTgFYcflQgEq32@ac-gdvbveo-shard-00-02.akr9n7d.mongodb.net:27017/hrms_attendance?ssl=true&authSource=admin&directConnection=true';
        await mongoose.connect(liveUri);
        const email = 'rsamariya50@gmail.com';
        const user = await User.findOne({ email });
        if (user) {
            const structures = await SalaryStructure.find({ user: user._id });
            console.log(`Found ${structures.length} salary structures for ${user.name}`);
            structures.forEach(s => {
                console.log(`- ID: ${s._id}, Version: ${s.version}, EffectiveFrom: ${s.effectiveFrom.toISOString()}, isActive: ${s.isActive}, monthlyCTC: ${s.monthlyCTC}`);
            });
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkStructure();
