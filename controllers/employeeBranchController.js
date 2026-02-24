const User = require('../models/User');

// @desc    Get Employee Assigned Branch Details
// @route   GET /api/employee/branch
// @access  EMPLOYEE (Active)
exports.getMyBranch = async (req, res) => {
    try {
        const userId = req.user._id;

        // Fetch User with populated Branch and Shift to provide comprehensive branch info
        const user = await User.findById(userId)
            .populate('branch', 'name timezone radiusInMeters latitude longitude isActive createdAt workingDays')
            .populate('shift', 'name startTime endTime allowedLateMinutes allowedEarlyExitMinutes requiredWorkHours');

        if (!user || user.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, error: 'Unauthorized or inactive user.' });
        }

        if (!user.branch) {
            return res.status(404).json({ success: false, error: 'No branch is currently assigned to your profile.' });
        }

        const branchData = {
            id: user.branch._id,
            name: user.branch.name,
            timezone: user.branch.timezone,
            radius: user.branch.radiusInMeters,
            latitude: user.branch.latitude,
            longitude: user.branch.longitude,
            isActive: user.branch.isActive,
            established: user.branch.createdAt,
            workingDays: user.branch.workingDays,
            // Include their specific assigned shift for context
            shift: user.shift ? {
                name: user.shift.name,
                startTime: user.shift.startTime,
                endTime: user.shift.endTime,
                requiredHours: user.shift.requiredWorkHours,
            } : null
        };

        res.status(200).json({
            success: true,
            data: branchData
        });

    } catch (error) {
        console.error('Fetch Employee Branch Error:', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
