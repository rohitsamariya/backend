const Branch = require('../models/Branch');
const User = require('../models/User'); // Required for delete check
const { DateTime } = require('luxon');
const attendanceUpdater = require('../services/attendanceUpdater');

// @desc    Create new branch
// @route   POST /api/branch
// @access  ADMIN
exports.createBranch = async (req, res) => {
    try {
        let { name, timezone, latitude, longitude, radiusInMeters } = req.body;

        // 1. Mandatory Fields Check
        if (!name || !timezone || latitude === undefined || longitude === undefined || radiusInMeters === undefined) {
            return res.status(400).json({ success: false, error: 'Please provide all required fields: name, timezone, latitude, longitude, radiusInMeters' });
        }

        // 2. Validate Timezone
        const dt = DateTime.local().setZone(timezone);
        if (!dt.isValid) {
            return res.status(400).json({ success: false, error: `Invalid timezone: ${timezone}` });
        }

        // 3. Name Lowercase
        name = name.toLowerCase();

        // 4. Create Branch (Duplicate handled by Mongoose 11000)
        const branch = await Branch.create({
            name,
            timezone,
            latitude,
            longitude,
            radiusInMeters
        });

        res.status(201).json({ success: true, data: branch });

    } catch (error) {
        console.error(error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, error: 'Branch name already exists' });
        }
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Get all branches
// @route   GET /api/branch
// @access  ADMIN, HR
exports.getBranches = async (req, res) => {
    try {
        let query = {};
        const { status } = req.query;

        if (status === 'active') {
            query.isActive = true;
        } else if (status === 'inactive') {
            query.isActive = false;
        }
        // If status is 'all', query stays empty {} (returns both active and inactive)
        // Default behavior (if no status provided) -> Active only?
        // User request: "Default: status=active"
        else if (!status) {
            query.isActive = true;
        }

        const branches = await Branch.find(query);

        res.status(200).json({ success: true, count: branches.length, data: branches });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Reactivate branch
// @route   PUT /api/branch/:id/reactivate
// @access  ADMIN
exports.reactivateBranch = async (req, res) => {
    try {
        const branch = await Branch.findById(req.params.id);
        if (!branch) {
            return res.status(404).json({ success: false, error: 'Branch not found' });
        }

        if (branch.isActive) {
            return res.status(400).json({ success: false, error: 'Branch is already active' });
        }

        branch.isActive = true;
        await branch.save();

        res.status(200).json({ success: true, message: 'Branch reactivated successfully', data: branch });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Update branch
// @route   PUT /api/branch/:id
// @access  ADMIN
exports.updateBranch = async (req, res) => {
    try {
        let { name, timezone, latitude, longitude, radiusInMeters, workingDays } = req.body;

        let branch = await Branch.findById(req.params.id);
        if (!branch) {
            return res.status(404).json({ success: false, error: 'Branch not found' });
        }

        // Validate Timezone if provided
        if (timezone) {
            const dt = DateTime.local().setZone(timezone);
            if (!dt.isValid) {
                return res.status(400).json({ success: false, error: `Invalid timezone: ${timezone}` });
            }
            branch.timezone = timezone;
        }

        // Validate Name Duplication if name changing
        if (name) {
            name = name.toLowerCase();
            if (name !== branch.name) {
                // Check duplicate manually
                const duplicate = await Branch.findOne({ name });
                if (duplicate) {
                    return res.status(400).json({ success: false, error: 'Branch name already exists' });
                }
                branch.name = name;
            }
        }

        // Update fields with strict checks
        if (latitude !== undefined) branch.latitude = latitude;
        if (longitude !== undefined) branch.longitude = longitude;
        if (radiusInMeters !== undefined) branch.radiusInMeters = radiusInMeters;
        if (workingDays !== undefined) branch.workingDays = workingDays;

        await branch.save();

        res.status(200).json({ success: true, data: branch });

        // Trigger retroactive update if workingDays changed
        if (workingDays !== undefined) {
            attendanceUpdater.updateAttendanceForWorkingDays(branch);
        }

    } catch (error) {
        console.error(error);
        res.status(400).json({ success: false, error: error.message });
    }
};

// @desc    Delete branch (Soft Delete)
// @route   DELETE /api/branch/:id
// @access  ADMIN
exports.deleteBranch = async (req, res) => {
    try {
        const branch = await Branch.findById(req.params.id);
        if (!branch) {
            return res.status(404).json({ success: false, error: 'Branch not found' });
        }

        // Check if any ACTIVE users exist in this branch
        const activeUsers = await User.countDocuments({ branch: branch._id, status: 'ACTIVE' });
        if (activeUsers > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot deactivate branch. There are ${activeUsers} active users assigned to it.`
            });
        }

        // Soft Delete
        branch.isActive = false;
        await branch.save();

        res.status(200).json({ success: true, message: 'Branch deactivated successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
