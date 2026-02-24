const Shift = require('../models/Shift');
const User = require('../models/User');

// Helper to convert HH:mm string to minutes from start of day
const toMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

// @desc    Create a new shift
// @route   POST /api/shifts
// @access  ADMIN, HR
exports.createShift = async (req, res) => {
    try {
        const { name, startTime, endTime, allowedLateMinutes, allowedEarlyExitMinutes } = req.body;

        if (!name || !startTime || !endTime) {
            return res.status(400).json({ success: false, error: 'Please provide name, startTime and endTime' });
        }

        // 1. Time Validation
        const startMinutes = toMinutes(startTime);
        const endMinutes = toMinutes(endTime);

        // Note: Overnight shifts (startTime > endTime) are not currently supported.
        if (startMinutes >= endMinutes) {
            return res.status(400).json({
                success: false,
                error: 'Start time must be before end time (Overnight shifts not supported)'
            });
        }

        // 2. Branch Authority
        // ADMIN can create shift for any branch (if provided), HR only for own branch
        let branchId = req.user.branch;
        if (req.user.role === 'ADMIN' && req.body.branch) {
            branchId = req.body.branch;
        }

        const shift = await Shift.create({
            name,
            startTime,
            endTime,
            allowedLateMinutes,
            allowedEarlyExitMinutes,
            branch: branchId,
            createdBy: req.user._id
        });

        res.status(201).json({ success: true, data: shift });
    } catch (error) {
        console.error(error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, error: 'Shift name already exists in this branch' });
        }
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, error: messages.join(', ') });
        }
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get all shifts
// @route   GET /api/shifts
// @access  ADMIN, HR, MANAGER
exports.getShifts = async (req, res) => {
    try {
        // ADMIN can see all shifts or filter by branch query
        // HR/MANAGER restricted to own branch
        let query = {};

        if (req.user.role === 'ADMIN') {
            // If branch query provided, filter by it. Else return all? 
            // Usually safest to default to own branch unless specified.
            if (req.query.branch) {
                query.branch = req.query.branch;
            }
            // If no query, return all shifts for ADMIN? Or maintain scoped view?
            // "ADMIN can manage all branches". Let's show all if no filter.
        } else {
            query.branch = req.user.branch;
        }

        const shifts = await Shift.find(query).populate('branch', 'name');;

        res.status(200).json({ success: true, count: shifts.length, data: shifts });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Update shift
// @route   PUT /api/shifts/:id
// @access  ADMIN, HR
exports.updateShift = async (req, res) => {
    try {
        let shift = await Shift.findById(req.params.id);

        if (!shift) {
            return res.status(404).json({ success: false, error: 'Shift not found' });
        }

        // Branch Authority: HR locked to own branch. ADMIN can update any.
        if (req.user.role !== 'ADMIN' && shift.branch.toString() !== req.user.branch.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to update this shift' });
        }

        const { startTime, endTime } = req.body;

        // Validate time if changing
        let newStartStr = startTime || shift.startTime;
        let newEndStr = endTime || shift.endTime;

        const startMinutes = toMinutes(newStartStr);
        const endMinutes = toMinutes(newEndStr);

        // Note: Overnight shifts (startTime > endTime) are not currently supported.
        if (startMinutes >= endMinutes) {
            return res.status(400).json({
                success: false,
                error: 'Start time must be before end time (Overnight shifts not supported)'
            });
        }

        shift = await Shift.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({ success: true, data: shift });
    } catch (error) {
        console.error(error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, error: messages.join(', ') });
        }
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Assign shift to user
// @route   PUT /api/shifts/assign/:userId
// @access  ADMIN, HR
exports.assignShift = async (req, res) => {
    try {
        const { shiftId } = req.body;

        const user = await User.findById(req.params.userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // 3. Status Check (ACTIVE users only)
        if (user.status !== 'ACTIVE') {
            return res.status(400).json({ success: false, error: `Cannot assign shift to user with status: ${user.status}` });
        }

        const shift = await Shift.findById(shiftId);
        if (!shift) {
            return res.status(404).json({ success: false, error: 'Shift not found' });
        }

        // Ensure Shift & User are in same branch
        // Note: Assigning cross-branch shift is generally invalid unless user moves branch first.
        if (shift.branch.toString() !== user.branch.toString()) {
            return res.status(400).json({ success: false, error: 'Shift & User must belong to the same branch' });
        }

        // Branch Authority: HR locked to own branch. ADMIN can assign any.
        // But the check above (shift.branch === user.branch) mostly covers logic correctly.
        // Just need to ensure the requester has authority over *that* branch.
        if (req.user.role !== 'ADMIN' && shift.branch.toString() !== req.user.branch.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized to assign this shift' });
        }

        user.shift = shiftId;
        await user.save();

        res.status(200).json({ success: true, message: 'Shift assigned', data: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
