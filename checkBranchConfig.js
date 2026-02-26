const mongoose = require('mongoose');
const User = require('./models/User');
const Branch = require('./models/Branch');
require('dotenv').config();

const checkConfig = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const user = await User.findOne({ email: 'rsamariya50@gmail.com' }).populate('branch');
        if (user && user.branch) {
            console.log('Branch Working Days:', user.branch.workingDays);
        } else {
            console.log('User or Branch not found');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkConfig();
