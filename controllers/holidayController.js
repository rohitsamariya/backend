const Holiday = require('../models/Holiday');
const attendanceUpdater = require('../services/attendanceUpdater');

// @desc    Get all holidays
// @route   GET /api/holidays
// @access  Public (Authenticated)
exports.getHolidays = async (req, res) => {
    try {
        const holidays = await Holiday.find().sort({ date: 1 });
        res.status(200).json({ success: true, count: holidays.length, data: holidays });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Create a holiday
// @route   POST /api/holidays
// @access  Private (Admin)
exports.createHoliday = async (req, res) => {
    try {
        const { name, date, type, description } = req.body;

        // Check duplicates
        const existing = await Holiday.findOne({ date: new Date(date) });
        if (existing) {
            return res.status(400).json({ success: false, error: 'Holiday already exists on this date' });
        }

        const holiday = await Holiday.create({
            name,
            date,
            type,
            description
        });

        res.status(201).json({ success: true, data: holiday });

        // Trigger retroactive update asynchronously
        attendanceUpdater.updateAttendanceForHoliday(holiday);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Update a holiday
// @route   PUT /api/holidays/:id
// @access  Private (Admin)
exports.updateHoliday = async (req, res) => {
    try {
        let holiday = await Holiday.findById(req.params.id);
        if (!holiday) {
            return res.status(404).json({ success: false, error: 'Holiday not found' });
        }

        const oldHoliday = { ...holiday.toObject() }; // Keep copy of old data

        holiday = await Holiday.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({ success: true, data: holiday });

        // Trigger updates properly
        // If date changed, revert old date's status
        if (oldHoliday.date.toISOString() !== holiday.date.toISOString()) {
            attendanceUpdater.revertAttendanceForHoliday(oldHoliday);
        }

        // Always apply new date status
        attendanceUpdater.updateAttendanceForHoliday(holiday);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Delete a holiday
// @route   DELETE /api/holidays/:id
// @access  Private (Admin)
exports.deleteHoliday = async (req, res) => {
    try {
        const holiday = await Holiday.findById(req.params.id);
        if (!holiday) {
            return res.status(404).json({ success: false, error: 'Holiday not found' });
        }

        await holiday.deleteOne();
        res.status(200).json({ success: true, data: {} });

        // Trigger revert for deleted holiday
        attendanceUpdater.revertAttendanceForHoliday(holiday);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
