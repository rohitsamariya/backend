const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config({ path: require('path').join(__dirname, '../.env') });

const seedAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        const adminEmail = 'admin@example.com';
        let admin = await User.findOne({ email: adminEmail });

        if (admin) {
            console.log('Admin user found. Updating role and status...');
            admin.role = 'ADMIN';
            admin.status = 'ACTIVE';
            admin.password = 'admin123';
            await admin.save();
            console.log('Admin updated successfully.');
        } else {
            console.log('Creating new Admin user...');
            admin = await User.create({
                name: 'Admin User',
                email: adminEmail,
                password: 'admin123',
                role: 'ADMIN',
                status: 'ACTIVE',
                branch: null,
                shift: null
            });
            console.log('Admin created successfully.');
        }

        console.log('Email: admin@example.com');
        console.log('Password: admin123');


        process.exit();
    } catch (error) {
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            console.error('Validation Error:', messages);
        } else {
            console.error('Error:', error);
        }
        process.exit(1);
    }
};

seedAdmin();
