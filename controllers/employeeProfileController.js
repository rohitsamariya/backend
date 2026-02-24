const User = require('../models/User');
const Shift = require('../models/Shift'); // Ensure Shift model is available
const Violation = require('../models/Violation');
const { DateTime } = require('luxon');

// @desc    Get Employee Profile
// @route   GET /api/employee/profile
// @access  EMPLOYEE (Active)
exports.getProfile = async (req, res) => {
    try {
        const userId = req.user._id;
        const Attendance = require('../models/Attendance');

        // 1. Fetch User with Branch and Shift
        const user = await User.findById(userId)
            .populate('branch', 'name timezone radiusInMeters isActive')
            .populate('shift', 'name startTime endTime allowedLateMinutes allowedEarlyExitMinutes')
            .select('-password -otp -otpExpires -inviteToken'); // Security: No credentials

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (user.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, error: 'User is not active' });
        }

        // 2. Attendance Summary Aggregation (Lifetime)
        const attendanceSummary = await Attendance.aggregate([
            { $match: { user: user._id } },
            {
                $group: {
                    _id: null,
                    totalPresent: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
                    totalHalfDays: { $sum: { $cond: [{ $eq: ['$status', 'HALF_DAY'] }, 1, 0] } },
                    totalAbsent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } },
                    lateCount: { $sum: { $cond: ['$isLate', 1, 0] } },
                    earlyExitCount: { $sum: { $cond: ['$isEarlyExit', 1, 0] } }
                }
            }
        ]);

        const stats = attendanceSummary[0] || {
            totalPresent: 0,
            totalHalfDays: 0,
            totalAbsent: 0,
            lateCount: 0,
            earlyExitCount: 0
        };

        const violationCount = await Violation.countDocuments({ user: user._id });

        // Collect documents from unified array or legacy fields
        let normalizedDocs = [...(user.documents || [])];

        const legacyMap = {
            'AADHAAR': user.get('aadhaarPhoto'),
            'PAN': user.get('panPhoto'),
            'BANK_PROOF': user.get('bankProof')
        };

        Object.entries(legacyMap).forEach(([type, fileUrl]) => {
            if (fileUrl && !normalizedDocs.find(d => d.type === type)) {
                normalizedDocs.push({
                    type,
                    fileUrl,
                    originalName: `${type} (Legacy).jpg`,
                    uploadedAt: user.createdAt
                });
            }
        });

        // Determine Probation Status & Leaves Logic
        const joinDateJS = user.joiningDate ? new Date(user.joiningDate) : new Date(user.createdAt);
        const joinMeta = DateTime.fromJSDate(joinDateJS);
        const probationEndDate = joinMeta.plus({ months: 6 }).endOf('day');
        const now = DateTime.now();
        const isPostProbation = now > probationEndDate;

        if (isPostProbation && !user.probationLeavesAllocated) {
            user.probationLeavesAllocated = true;
            user.availableLeaves = 18;
            user.leavesTaken = 0;
            user.lateCount = 0;
            user.earlyExitCount = 0;
            await User.updateOne({ _id: user._id }, {
                $set: {
                    probationLeavesAllocated: true,
                    availableLeaves: 18,
                    leavesTaken: 0,
                    lateCount: 0,
                    earlyExitCount: 0
                }
            }).catch(e => console.error("Error auto-allocating leaves:", e));
        }

        // Structure Response Payload
        res.status(200).json({
            success: true,
            data: {
                profile: user,
                attendance: {
                    totalPresent: stats.totalPresent,
                    totalHalfDays: stats.totalHalfDays,
                    totalAbsent: stats.totalAbsent,
                    totalViolations: violationCount,
                    isPostProbation: isPostProbation,
                    // Balance Leaves and Leaves Taken for UI
                    balanceLeaves: user.availableLeaves || 0,
                    leavesTaken: user.leavesTaken || 0,
                    // Legacy fields for UI compatibility if needed
                    lateCount: isPostProbation ? user.availableLeaves || 0 : stats.lateCount || 0,
                    earlyExitCount: isPostProbation ? user.leavesTaken || 0 : stats.earlyExitCount || 0
                },
                documents: normalizedDocs
            }
        });
    } catch (error) {
        console.error("Employee Profile Fetch Error:", error);
        res.status(500).json({ success: false, error: 'Failed to retrieve profile' });
    }
};

// @desc    Update Employee Profile (Restricted Fields)
// @route   PUT /api/employee/profile
// @access  EMPLOYEE (Active)
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user._id;
        const { phoneNumber, address, emergencyContact } = req.body;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (user.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, error: 'User is not active' });
        }

        // Only update allowed fields
        if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;

        // Nested Object Updates (Merge to prevent wiping)
        if (address) {
            user.address = { ...user.address, ...address };
        }
        if (emergencyContact) {
            user.emergencyContact = { ...user.emergencyContact, ...emergencyContact };
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                phoneNumber: user.phoneNumber,
                address: user.address,
                emergencyContact: user.emergencyContact
            }
        });

    } catch (error) {
        console.error("Profile Update Error:", error);
        res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
};

// @desc    Update Profile Image
// @route   PUT /api/employee/profile/image
// @access  EMPLOYEE (Active)
exports.updateProfileImage = async (req, res) => {
    try {
        const userId = req.user._id;

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Please upload an image' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Save relative path (without /api or full hostname)
        const relativePath = `/uploads/profile-images/${req.file.filename}`;
        user.profileImage = relativePath;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Profile image updated successfully',
            data: {
                profileImage: relativePath
            }
        });

    } catch (error) {
        console.error("Update Profile Image Error:", error);
        res.status(500).json({ success: false, error: 'Server Error during image upload' });
    }
};
