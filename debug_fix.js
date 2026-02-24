const mongoose = require('mongoose');
const User = require('./models/User');
const Branch = require('./models/Branch');
require('dotenv').config();

async function check() {
    await mongoose.connect(process.env.MONGO_URI);
    const user = await User.findOne({ name: /Rohit/i }).populate('branch');
    console.log('User:', JSON.stringify({
        name: user.name,
        status: user.status,
        isActive: user.isActive,
        role: user.role,
        branchName: user.branch.name,
        branchId: user.branch._id,
        createdAt: user.createdAt,
        joiningDate: user.joiningDate
    }, null, 2));

    const branches = await Branch.find();
    console.log('All Branches:', branches.map(b => ({ name: b.name, id: b._id })));
    process.exit();
}
check();
