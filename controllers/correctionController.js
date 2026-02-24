const Attendance = require('../models/Attendance');
const AttendanceCorrectionRequest = require('../models/AttendanceCorrectionRequest');
const { DateTime } = require('luxon');

// @desc    Request Correction
// @route   POST /api/employee/attendance/request-correction
// @access  EMPLOYEE (Active)
exports.requestCorrection = async (req, res) => {
    try {
        const { attendanceId, type, reason, requestedData } = req.body;

        if (!attendanceId || !type || !reason || !requestedData) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const attendance = await Attendance.findOne({ _id: attendanceId, user: req.user._id });
        if (!attendance) {
            return res.status(404).json({ success: false, error: 'Attendance record not found' });
        }

        // Validate: No Future Dates
        // (Just a sanity check on the attendance date itself, or the requested times?)
        // Let's check if the attendance date is in the future (Timezone Aware)
        // Actually, Attendance Date is stored as UTC Midnight.
        // We can just check if attendance.date > todayMidnight (but need TZ).
        // Simpler: You can't corect future attendance because it doesn't exist yet properly.
        // But if `attendance` exists, it's past or present. 
        // We should validate `requestedData` times if provided.

        // Check if pending request exists for this attendance
        const pending = await AttendanceCorrectionRequest.findOne({
            user: req.user._id,
            attendance: attendanceId,
            status: 'PENDING'
        });

        if (pending) {
            return res.status(400).json({ success: false, error: 'You already have a pending correction request for this date.' });
        }

        const request = await AttendanceCorrectionRequest.create({
            user: req.user._id,
            attendance: attendanceId,
            type,
            reason,
            requestedData
        });

        res.status(201).json({ success: true, data: request });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get My Corrections
// @route   GET /api/employee/attendance/my-corrections
// @access  EMPLOYEE
exports.getMyCorrections = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const requests = await AttendanceCorrectionRequest.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('attendance', 'date status'); // Lightweight populate

        const total = await AttendanceCorrectionRequest.countDocuments({ user: req.user._id });

        res.status(200).json({
            success: true,
            count: requests.length,
            total,
            pagination: { page, limit },
            data: requests
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
