const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { checkIn, checkOut, getMyAttendance, getBranchAttendance, getAttendanceByDate } = require('../controllers/attendanceController');

router.post('/check-in', protect, checkIn);
router.post('/check-out', protect, checkOut);
router.get('/my', protect, getMyAttendance);
router.get('/branch/:branchId', protect, authorize('ADMIN', 'HR'), getBranchAttendance);
router.get('/date/:date', protect, authorize('ADMIN', 'HR'), getAttendanceByDate);

module.exports = router;
