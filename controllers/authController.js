const User = require('../models/User');
const Branch = require('../models/Branch');
const OfferInvite = require('../models/OfferInvite');
const { generateResetPasswordEmail } = require('../services/emailTemplates/resetPasswordTemplate');
const { generateOTP } = require('../services/otpService');
const sendEmail = require('../services/emailService');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const crypto = require('crypto');

const { sendLifecycleEmail } = require('../services/emailService');

// @desc    Register user (Invite Only)
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
    try {
        const { token, email, password } = req.body;

        // 1. Validate Basic Fields
        if (!password || !token) {
            return res.status(400).json({
                success: false,
                error: 'Registration is invite-only. Missing token or registration details.'
            });
        }

        // 2. Validate Password Strength (Basic)
        if (password.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long.' });
        }

        // 3. Find User by Invite Token (selecting select fields)
        const user = await User.findOne({
            inviteToken: token,
            status: 'INVITED'
        }).select('+inviteToken');

        if (!user) {
            return res.status(400).json({ success: false, error: 'Invalid or already used registration token.' });
        }

        // 4. Check Expiry (24h)
        if (user.inviteTokenExpiry && user.inviteTokenExpiry < Date.now()) {
            return res.status(400).json({ success: false, error: 'Registration token has expired. Please request a new invite.' });
        }

        // 5. Update User Status & Password
        user.password = password;
        user.status = 'ONBOARDING';
        user.inviteToken = undefined;
        user.inviteTokenExpiry = undefined;
        user.onboardingStep = 1;
        user.onboardingStatus = 'PENDING';
        await user.save();

        // 5.5 Update OfferInvite legacy status
        await OfferInvite.findOneAndUpdate({ email: user.email }, { used: true });

        // 6. Send Confirmation Email
        try {
            const loginLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
            const { generateRegistrationEmail } = require('../services/emailTemplates/registrationTemplate');
            const html = generateRegistrationEmail(user.name, loginLink);

            await sendLifecycleEmail(user, 'REGISTRATION', 'Account Created Successfully', html);
        } catch (err) {
            console.error('Registration email failed:', err);
        }

        // 7. Generate Auth Token
        const generateToken = require('../utils/generateToken');
        const authToken = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: 'Registration successful. Please complete your onboarding.',
            token: authToken,
            redirectTo: '/onboarding/step/1',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                branch: user.branch
            }
        });

    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ success: false, error: 'Server Error during registration.' });
    }
};

// @desc    Verify OTP and Login
// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        // 1. Validate fields
        if (!email || !otp) {
            return res.status(400).json({ success: false, error: 'Please provide email and OTP' });
        }

        // 2. Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // 3. Check Status (Must be PENDING_VERIFICATION)
        if (user.status !== 'PENDING_VERIFICATION') {
            return res.status(400).json({ success: false, error: 'User already verified or invalid status' });
        }

        // 4. Check Expiry
        if (user.otpExpires < Date.now()) {
            return res.status(400).json({ success: false, error: 'OTP expired' });
        }

        // 5. Compare OTP
        const isMatch = await bcrypt.compare(otp, user.otp);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Invalid OTP' });
        }

        // 6. Success: Update User
        user.status = 'ONBOARDING';
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        // 7. Generate Token
        const generateToken = require('../utils/generateToken');
        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully',
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                branch: user.branch
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};


// @desc    Verify Invite Token (Public)
// @route   GET /api/auth/invite/:token
// @access  Public
exports.verifyInvite = async (req, res) => {
    try {
        const { token } = req.params;
        const { email } = req.query;

        if (!token) {
            return res.status(400).json({ success: false, error: 'Token is required' });
        }


        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        const invite = await OfferInvite.findOne({
            token: hashedToken,
            used: false,
            expiresAt: { $gt: new Date() }
        })
            .populate('branch', 'name')
            .populate('shift', 'name startTime endTime');

        if (!invite) {
            return res.status(400).json({ success: false, error: 'Invalid or expired invite token' });
        }

        if (email && invite.email.toLowerCase() !== email.toLowerCase()) {
            return res.status(400).json({ success: false, error: 'Email mismatch' });
        }

        res.status(200).json({
            success: true,
            data: {
                name: invite.name,
                email: invite.email,
                branch: invite.branch,
                shift: invite.shift,
                role: invite.role
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error verifying invite' });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
    try {
        const { password } = req.body;
        const email = (req.body.email || '').toLowerCase().trim();

        // 1. Validate fields
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Please provide email and password' });
        }

        // 2. Find user (Using case-insensitive findOne more robustly)
        const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        console.log(`[Auth] Login attempt for: ${email}`);

        const user = await User.findOne({ email: new RegExp('^' + escapedEmail + '$', 'i') }).select('+password');

        if (!user) {
            console.log(`[Auth] User not found: ${email}`);
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // 3. Match Password
        if (!user.password) {
            console.error(`[Auth] User ${email} has no password set in database.`);
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            console.log(`[Auth] Password mismatch for: ${email}`);
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        console.log(`[Auth] Login successful for: ${email} (Role: ${user.role})`);

        // 4. Check Activity & Status
        if (user.status === 'DEACTIVATED' || user.isActive === false) {
            return res.status(403).json({ success: false, error: 'Account deactivated. Please contact support.' });
        }

        if (user.status === 'INVITED') {
            return res.status(401).json({ success: false, error: 'Please set your password first' });
        }

        // 5. Success
        const generateToken = require('../utils/generateToken');
        const token = generateToken(user._id);

        // Determine Redirect based on Status
        let redirectTo = null;

        const getRoleDashboard = (role) => {
            if (role === 'ADMIN') return '/admin/dashboard';
            if (role === 'HR') return '/hr/dashboard';
            if (role === 'MANAGER') return '/manager/dashboard';
            return '/employee/dashboard';
        };

        if (user.status === 'ONBOARDING') {
            // Check for completion transition
            if (user.onboardingStatus === 'COMPLETED') {
                user.status = 'ACTIVE';
                await user.save();
                redirectTo = getRoleDashboard(user.role);
            } else {
                redirectTo = `/onboarding/step/${user.onboardingStep || 1}`;
            }
        } else if (user.status === 'ACTIVE') {
            redirectTo = getRoleDashboard(user.role);
        }

        res.status(200).json({
            success: true,
            token,
            redirectTo,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status,
                onboardingStep: user.onboardingStep,
                branch: user.branch,
                profileImage: user.profileImage
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Forgot Password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, error: 'Please provide an email' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // For security, don't reveal that the user doesn't exist
            return res.status(200).json({ success: true, message: 'If an account exists with this email, a reset link has been sent.' });
        }

        // Generate Token
        const resetToken = user.getResetPasswordToken();
        await user.save({ validateBeforeSave: false });

        // Create Reset URL
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;

        // Send Email
        try {
            const html = generateResetPasswordEmail(user.name, resetUrl);
            await sendLifecycleEmail(user, 'RESET_PASSWORD', 'Password Reset Request', html);

            res.status(200).json({ success: true, message: 'Email sent' });
        } catch (err) {
            console.error('Reset Email Error:', err);
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;
            await user.save({ validateBeforeSave: false });

            res.status(500).json({ success: false, error: 'Email could not be sent' });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Reset Password
// @route   PUT /api/auth/reset-password/:resetToken
// @access  Public
exports.resetPassword = async (req, res) => {
    try {
        // Hash token from URL
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(req.params.resetToken)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
        }

        // Set new password
        user.password = req.body.password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password reset successful. You can now login with your new password.'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
