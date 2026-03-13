const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: require('path').join(__dirname, '.env') });

const uri = process.env.MONGO_URI;

async function checkUserPayroll() {
    try {
        const conn = await mongoose.createConnection(uri).asPromise();
        
        const usersCol = conn.db.collection('users');
        const user = await usersCol.findOne({ name: 'Rohit Samariya', role: 'EMPLOYEE' });

        if (!user) {
            console.log('Employee not found.');
            process.exit(0);
        }
        
        console.log('--- USER DATA ---');
        console.log(`ID: ${user._id}`);
        console.log(`Name: ${user.name}`);
        console.log(`Role: ${user.role}`);
        console.log(`Status: ${user.status}`);
        console.log(`Branch: ${user.branch}`);
        console.log(`Joining Date: ${user.joiningDate || user.createdAt}`);
        console.log(`Profile Image Path: ${user.profileImage}`);
        
        const structureCol = conn.db.collection('salarystructures');
        const structure = await structureCol.findOne({ user: user._id, isActive: true });
        
        console.log('\n--- SALARY STRUCTURE ---');
        if (structure) {
            console.log(`Found Active Structure: Yes`);
            console.log(`Gross Salary: ${structure.grossSalary}`);
            console.log(`Effective From: ${structure.effectiveFrom}`);
        } else {
            console.log(`Found Active Structure: NO`);
        }

        const runCol = conn.db.collection('branchpayrollruns');
        const latestRun = await runCol.findOne({ branch: user.branch }, { sort: { _id: -1 } });
        console.log('\n--- LATEST PAYROLL RUN ---');
        console.log(latestRun);
        
        await conn.close();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkUserPayroll();
