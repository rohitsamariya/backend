const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const uri = process.env.MONGO_URI;

async function seedSalary() {
    try {
        const conn = await mongoose.createConnection(uri).asPromise();
        const usersCol = conn.db.collection('users');
        const structureCol = conn.db.collection('salarystructures');

        const user = await usersCol.findOne({ name: 'Rohit Samariya', role: 'EMPLOYEE' });

        if (!user) {
            console.log('Employee Rohit Samariya not found.');
            process.exit(0);
        }

        // Check if structure exists
        const existing = await structureCol.findOne({ user: user._id, isActive: true });
        if (existing) {
            console.log('Active salary structure already exists.');
        } else {
            const structure = {
                user: user._id,
                basic: 15000,
                da: 1000,
                hra: 5000,
                specialAllowance: 4000,
                otherAllowances: 0,
                grossSalary: 25000,
                annualCTC: 300000,
                monthlyCTC: 25000,
                pfOptedOut: false,
                taxRegime: 'NEW',
                effectiveFrom: new Date('2025-01-01'),
                isActive: true,
                version: 1,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await structureCol.insertOne(structure);
            await usersCol.updateOne({ _id: user._id }, { $set: { monthlyCTC: 25000 } });
            console.log('Default salary structure seeded for Rohit Samariya.');
        }

        await conn.close();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

seedSalary();
