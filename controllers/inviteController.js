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

        if (!name || !email) {
            return res.status(400).json({ success: false, error: 'Name and Email are required.' });
        }

        // Defensive: convert empty strings or non-hex strings to null for ObjectId fields to prevent CastErrors
        const bId = (branchId && branchId.trim() && branchId.length === 24) ? branchId : null;
        const sId = (shiftId && shiftId.trim() && shiftId.length === 24) ? shiftId : null;

        // 1. Check if user already exists and is already ACTIVE or ONBOARDING
        const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
        if (existingUser && (existingUser.status === 'ACTIVE' || existingUser.status === 'ONBOARDING')) {
            return res.status(400).json({ success: false, error: 'User already exists and is active/onboarding.' });
        }

        // 2. Generate Secure Token
        const inviteToken = crypto.randomBytes(32).toString('hex');
        const inviteTokenExpiry = Date.now() + 24 * 60 * 60 * 1000;

        // 3. Create or Update User with INVITED status
        let user;
        if (existingUser) {
            existingUser.status = 'INVITED';
            existingUser.inviteToken = inviteToken;
            existingUser.inviteTokenExpiry = inviteTokenExpiry;
            existingUser.role = role || 'EMPLOYEE';
            existingUser.branch = bId || existingUser.branch;
            existingUser.shift = sId || existingUser.shift;
            existingUser.onboardingStatus = 'PENDING';
            user = await existingUser.save();
        } else {
            user = await User.create({
                name,
                email: email.toLowerCase().trim(),
                role: role || 'EMPLOYEE',
                branch: bId,
                shift: sId,
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
            { email: email.toLowerCase().trim() },
            {
                name,
                email: email.toLowerCase().trim(),
                role: role || 'EMPLOYEE',
                branch: bId || user.branch,
                shift: sId || user.shift,
                token: hashedToken,
                rawToken: inviteToken,
                expiresAt: inviteTokenExpiry,
                invitedBy: req.user._id || req.user.id,
                used: false
            },
            { upsert: true, new: true, runValidators: true }
        );

        // 5. Build Registration Link
        const registrationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/register?token=${inviteToken}&email=${encodeURIComponent(email.toLowerCase().trim())}`;

        // 6. Respond Immediately
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
        console.error('Create Invite Error Details:', error);

        // Handle Mongoose Validation/Cast Errors specifically
        let errorMessage = 'Server Error creating invite';
        if (error.name === 'ValidationError') {
            errorMessage = Object.values(error.errors).map(val => val.message).join(', ');
        } else if (error.name === 'CastError') {
            errorMessage = `Invalid format for field: ${error.path}`;
        } else if (error.code === 11000) {
            errorMessage = 'Duplicate field error (likely email already in use)';
        } else if (error.message) {
            errorMessage = error.message;
        }

        res.status(error.name === 'ValidationError' || error.name === 'CastError' || error.code === 11000 ? 400 : 500)
            .json({ success: false, error: errorMessage });
    }
};

exports.getInvites = async (req, res) => {
    try {
        const invites = await OfferInvite.find({ used: false, expiresAt: { $gt: Date.now() } })
            .select('+rawToken')
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
        await User.findOneAndDelete({ email: invite.email, status: 'INVITED' });
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

        const bId = (branchId && branchId.trim() && branchId.length === 24) ? branchId : null;
        const sId = (shiftId && shiftId.trim() && shiftId.length === 24) ? shiftId : null;

        invite.name = name || invite.name;
        invite.email = email ? email.toLowerCase().trim() : invite.email;
        invite.role = role || invite.role;
        if (bId) invite.branch = bId;
        if (sId) invite.shift = sId;

        await invite.save();

        res.status(200).json({ success: true, data: invite });
    } catch (error) {
        console.error('Update Invite Error:', error);
        let errorMessage = 'Server Error updating invite';
        if (error.name === 'ValidationError') {
            errorMessage = Object.values(error.errors).map(val => val.message).join(', ');
        }
        res.status(400).json({ success: false, error: errorMessage });
    }
};

exports.resendInvite = async (req, res) => {
    try {
        const invite = await OfferInvite.findById(req.params.id);
        if (!invite) return res.status(404).json({ success: false, error: 'Invite not found' });

        const user = await User.findOne({ email: invite.email });
        if (!user) return res.status(404).json({ success: false, error: 'Corresponding user record not found' });

        const registrationLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/register?token=${invite.rawToken || user.inviteToken}&email=${encodeURIComponent(invite.email)}`;

        res.status(200).json({ success: true, message: 'Resend triggered' });

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
