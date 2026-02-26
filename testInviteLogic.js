require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const OfferInvite = require('./models/OfferInvite');
const Branch = require('./models/Branch');
const Shift = require('./models/Shift');
const crypto = require('crypto');

const testInvite = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        // Create a dummy branch and shift if they don't exist
        let branch = await Branch.findOne();
        if (!branch) {
            branch = await Branch.create({ name: 'Test Branch', address: 'Test Address' });
        }
        let shift = await Shift.findOne();
        if (!shift) {
            shift = await Shift.create({ name: 'Test Shift', startTime: '09:00', endTime: '18:00' });
        }

        const name = 'Test User';
        const email = 'test_invite_' + Date.now() + '@example.com';
        const role = 'EMPLOYEE';
        const branchId = branch._id;
        const shiftId = shift._id;

        console.log('Attempting to create invite for:', email);

        // Logic from inviteController.js
        const inviteToken = crypto.randomBytes(32).toString('hex');
        const inviteTokenExpiry = Date.now() + 24 * 60 * 60 * 1000;

        const user = await User.create({
            name,
            email,
            role: role || 'EMPLOYEE',
            branch: branchId,
            shift: shiftId,
            status: 'INVITED',
            inviteToken,
            inviteTokenExpiry,
            onboardingStatus: 'PENDING',
            isActive: true
        });

        console.log('User created:', user._id);

        const hashedToken = crypto.createHash('sha256').update(inviteToken).digest('hex');

        const offerInvite = await OfferInvite.findOneAndUpdate(
            { email },
            {
                name,
                email,
                role: role || 'EMPLOYEE',
                branch: branchId,
                shift: shiftId,
                token: hashedToken,
                rawToken: inviteToken,
                expiresAt: inviteTokenExpiry,
                invitedBy: user._id, // Just for test
                used: false
            },
            { upsert: true, new: true }
        );

        console.log('OfferInvite created/updated:', offerInvite._id);
        console.log('✅ Test Passed!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Test Failed:');
        console.error(error);
        process.exit(1);
    }
};

testInvite();
