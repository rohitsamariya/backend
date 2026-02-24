const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { requireStatus } = require('../middleware/statusGuard');
const rateLimit = require('express-rate-limit');

// Controllers
const {
    getTodayDashboard,
    getMonthlySummary,
    getViolationHistory,
    getAttendanceHistory,
    getLiveStatus,
    getDisciplineSummary
} = require('../controllers/employeeDashboardController');

const {
    getProfile,
    updateProfile,
    updateProfileImage
} = require('../controllers/employeeProfileController');

const {
    getPayrollSummary
} = require('../controllers/employeePayrollController');

const {
    getMyBranch
} = require('../controllers/employeeBranchController');

const {
    getBranchHolidays
} = require('../controllers/employeeHolidayController'); // New Controller

const {
    requestCorrection,
    getMyCorrections
} = require('../controllers/correctionController'); // New Controller

const {
    getNotifications,
    markRead,
    getUnreadCount
} = require('../controllers/notificationController');

const {
    completeOnboarding
} = require('../controllers/employeeController');
const upload = require('../middleware/uploadMiddleware');

// RATE LIMITERS
const notificationLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: 'Too many notification requests, please try again later.'
});

const correctionLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 1 day
    max: 5, // 5 requests per day
    message: 'Daily correction request limit reached.'
});

// MIDDLEWARE: Protect & Base Role
router.use(protect);
router.use(authorize('EMPLOYEE'));

// 1. Onboarding Completion (Strictly for ONBOARDING status)
router.put('/onboarding/complete', requireStatus('ONBOARDING'), upload.fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'aadhaarPhoto', maxCount: 1 }
]), completeOnboarding);

// 2. Strict Guard for all OTHER routes (Must be ACTIVE)
router.use(requireStatus('ACTIVE'));

// ---------------- DASHBOARD ----------------
router.get('/dashboard/today', getTodayDashboard);
router.get('/dashboard/live-status', getLiveStatus);
router.get('/dashboard/monthly-summary', getMonthlySummary);
router.get('/dashboard/discipline-summary', getDisciplineSummary);
router.get('/dashboard/violations', getViolationHistory);
router.get('/dashboard/attendance-history', getAttendanceHistory);

// ---------------- PROFILE ----------------
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/profile/image', upload.single('profileImage'), updateProfileImage);

// ---------------- PAYROLL ----------------
router.get('/payroll', getPayrollSummary);

// ---------------- BRANCH ----------------
router.get('/branch', getMyBranch);

// ---------------- HOLIDAYS ----------------
router.get('/holidays', getBranchHolidays);

// ---------------- CORRECTIONS ----------------
router.post('/attendance/request-correction', correctionLimiter, requestCorrection);
router.get('/attendance/my-corrections', getMyCorrections);

// ---------------- NOTIFICATIONS ----------------
router.get('/notifications', notificationLimiter, getNotifications);
router.get('/notifications/unread-count', notificationLimiter, getUnreadCount);
router.put('/notifications/read/:id', notificationLimiter, markRead);

module.exports = router;
