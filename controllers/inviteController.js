const crypto = require('crypto');
const OfferInvite = require('../models/OfferInvite');
const User = require('../models/User');
const { sendEmail, sendOfferInvite, sendLifecycleEmail } = require('../services/emailService');
const Branch = require('../models/Branch');
const Shift = require('../models/Shift');
const { generateInviteEmail } = require('../services/emailTemplates/inviteTemplate');

exports.createInvite = async (req, res) => {
    try {
        const { name, email, role, branchId, shiftId } = req.body;

        // 1. Check if user already exists and is already ACTIVE or ONBOARDING
        const existingUser = await User.findOne({ email });
        if (existingUser && (existingUser.status === 'ACTIVE' || existingUser.status === 'ONBOARDING')) {
            return res.status(400).json({ success: false, error: 'User already exists and is active/onboarding.' });
        }

        // 2. Generate Secure Token (JWT-like or Crypto) - requested 24h expiry
        const inviteToken = crypto.randomBytes(32).toString('hex');
        const inviteTokenExpiry = Date.now() + 24 * 60 * 60 * 1000;

        // 3. Create or Update User with INVITED status
        let user;
        if (existingUser) {
            existingUser.status = 'INVITED';
            existingUser.inviteToken = inviteToken;
            existingUser.inviteTokenExpiry = inviteTokenExpiry;
            existingUser.role = role || 'EMPLOYEE';
            existingUser.branch = branchId;
            existingUser.shift = shiftId;
            existingUser.onboardingStatus = 'PENDING';
            user = await existingUser.save();
        } else {
            user = await User.create({
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
        }

        // 4. Create/Update OfferInvite record
        const hashedToken = crypto.createHash('sha256').update(inviteToken).digest('hex');

        await OfferInvite.findOneAndUpdate(
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
                invitedBy: req.user.id,
                used: false
            },
            { upsert: true, new: true }
        );

        // 5. Build Registration Link
        const registrationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/register?token=${inviteToken}&email=${encodeURIComponent(email)}`;

        // 6. Respond Immediately to make UI faster
        res.status(201).json({
            success: true,
            data: user,
            registrationLink
        });

        // 7. Send Email in Background
        setImmediate(async () => {
            try {
                const position = role || 'Employee';
                const html = generateInviteEmail(name, position, registrationLink);
                await sendLifecycleEmail(user, 'INVITE', `You’re Invited to Join ${process.env.FROM_NAME || 'HRMS Company'}`, html);
            } catch (err) {
                console.error('Background Invite Email Dispatch Failed:', err);
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error creating invite' });
    }
};

exports.getInvites = async (req, res) => {
    try {
        const invites = await OfferInvite.find({ used: false, expiresAt: { $gt: Date.now() } })
            .select('+rawToken') // Explicitly select for admin view
            .populate('branch', 'name')
            .populate('shift', 'name')
            .sort('-createdAt');

        res.status(200).json({ success: true, count: invites.length, data: invites });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error fetching invites' });
    }
};

exports.cancelInvite = async (req, res) => {
    try {
        const invite = await OfferInvite.findById(req.params.id);
        if (!invite) {
            return res.status(404).json({ success: false, error: 'Invite not found' });
        }

        // Also delete the User record if they are still in INVITED status
        await User.findOneAndDelete({ email: invite.email, status: 'INVITED' });

        // Hard delete the OfferInvite record
        await invite.deleteOne();

        res.status(200).json({ success: true, message: 'Invite cancelled' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error cancelling invite' });
    }
};

exports.updateInvite = async (req, res) => {
    try {
        const { name, email, role, branchId, shiftId } = req.body;

        let invite = await OfferInvite.findById(req.params.id);
        if (!invite) {
            return res.status(404).json({ success: false, error: 'Invite not found' });
        }

        // Update fields
        invite.name = name || invite.name;
        invite.email = email || invite.email;
        invite.role = role || invite.role;
        invite.branch = branchId || invite.branch;
        invite.shift = shiftId || invite.shift;

        await invite.save();

        res.status(200).json({ success: true, data: invite });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error updating invite' });
    }
};

exports.resendInvite = async (req, res) => {
    try {
        const invite = await OfferInvite.findById(req.params.id);
        if (!invite) return res.status(404).json({ success: false, error: 'Invite not found' });

        const user = await User.findOne({ email: invite.email });
        if (!user) return res.status(404).json({ success: false, error: 'Corresponding user record not found' });

        const registrationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/register?token=${invite.rawToken || user.inviteToken}&email=${encodeURIComponent(invite.email)}`;

        // Respond immediately
        res.status(200).json({ success: true, message: 'Resend triggered' });

        // Background send
        setImmediate(async () => {
            try {
                const html = generateInviteEmail(invite.name, invite.role || 'Employee', registrationLink);
                await sendLifecycleEmail(user, 'INVITE', `Reminder: You’re Invited to Join ${process.env.FROM_NAME || 'HRMS Company'}`, html);
            } catch (e) {
                console.error('Resend invite failed:', e);
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
