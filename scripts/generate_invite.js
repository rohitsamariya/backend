const mongoose = require('mongoose');
const crypto = require('crypto');
const OfferInvite = require('../models/OfferInvite');
const Branch = require('../models/Branch');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hrms_attendance';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

mongoose.connect(MONGO_URI).then(async () => {
    try {
        const email = 'manual_test@example.com';

        // Cleanup old test invite
        await OfferInvite.deleteOne({ email });

        let branch = await Branch.findOne();
        if (!branch) {
            branch = await Branch.create({ name: 'Head Office', address: 'Main St', latitude: 0, longitude: 0, radius: 100 });
        }

        const tokenRaw = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(tokenRaw).digest('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await OfferInvite.create({
            name: 'Manual Tester',
            email,
            branch: branch._id,
            token: hashedToken,
            expiresAt,
            sentBy: branch._id // Mock sender
        });

        console.log('\n=============================================');
        console.log('✅ Invite Created Successfully');
        console.log(`🔗 Registration Link: ${FRONTEND_URL}/register?token=${tokenRaw}&email=${email}`);
        console.log('=============================================\n');

    } catch (error) {
        console.error(error);
    } finally {
        mongoose.disconnect();
    }
});
