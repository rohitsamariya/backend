require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const testValidation = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const email = 'test_val_' + Date.now() + '@example.com';

        // Create user with empty string for PF (this might happen if someone manually edited DB or old code did it)
        // Actually, let's see if we can create it
        try {
            const user = await User.create({
                name: 'Test Validation',
                email: email,
                pfAccountNumber: '123', // Failing string
                role: 'EMPLOYEE'
            });
            console.log('User created with empty PF');
        } catch (e) {
            console.log('User creation failed as expected with empty string PF:', e.message);
        }

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

testValidation();
