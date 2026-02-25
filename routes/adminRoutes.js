const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
    getUsers,
    changeRole,
    changeBranch,
    updateUser,
    reactivateUser,
    deactivateUser,
    getUserById,
    patchUser,
    uploadProfileImage,
    uploadDocument,
    getFakeCheckins
} = require('../controllers/adminController');
const upload = require('../middleware/uploadMiddleware');

// All routes are protected and restricted to minimal roles
router.use(protect);

// Get All Users (ADMIN, HR, MANAGER)
router.get('/users', authorize('ADMIN', 'HR', 'MANAGER'), getUsers);

// Get User By ID (ADMIN)
router.get('/users/:id', authorize('ADMIN'), getUserById);

// Patch User (ADMIN)
router.patch('/users/:id', authorize('ADMIN'), patchUser);

// Change Role (ADMIN, HR, MANAGER - Controller has more logic)
router.put('/role/:id', authorize('ADMIN', 'HR', 'MANAGER'), changeRole);

// Change Branch (ADMIN, HR)
router.put('/branch/:id', authorize('ADMIN', 'HR'), changeBranch);

// Admin Dashboard Endpoints
const {
    getDashboardOverview,
    getBranchPerformance,
    getPayrollSummary,
    getAdminStats
} = require('../controllers/adminController');

router.get('/dashboard/overview', authorize('ADMIN'), getDashboardOverview);
router.get('/dashboard/branch-performance', authorize('ADMIN'), getBranchPerformance);
router.get('/dashboard/payroll-summary', authorize('ADMIN'), getPayrollSummary);
router.get('/stats', authorize('ADMIN'), getAdminStats);
router.get('/fake-checkins', authorize('ADMIN'), getFakeCheckins);

// Violations Report
const { getMonthlyViolations, triggerAllTimeViolations } = require('../controllers/violationsController');
router.get('/violations', authorize('ADMIN', 'HR'), getMonthlyViolations);
router.post('/violations/trigger-email', authorize('ADMIN'), triggerAllTimeViolations);

const {
    createInvite,
    getInvites,
    cancelInvite,
    updateInvite,
    resendInvite
} = require('../controllers/inviteController');

// ... existing routes ...

// Invite Routes
router.post('/invite', authorize('ADMIN', 'HR', 'MANAGER'), createInvite);
router.get('/invites', authorize('ADMIN', 'HR', 'MANAGER'), getInvites);
router.put('/invite/:id', authorize('ADMIN', 'HR', 'MANAGER'), updateInvite);
router.post('/invite/:id/resend', authorize('ADMIN', 'HR', 'MANAGER'), resendInvite);
router.delete('/invite/:id', authorize('ADMIN', 'HR', 'MANAGER'), cancelInvite);

// User Management
router.patch('/users/:id/deactivate', authorize('ADMIN'), deactivateUser);
router.patch('/users/:id/reactivate', authorize('ADMIN'), reactivateUser);

// Full User Edit (ADMIN Only)
router.put('/users/:id', authorize('ADMIN'), updateUser);

// File Uploads
router.post('/users/:id/profile-image', authorize('ADMIN'), upload.single('profileImage'), uploadProfileImage);
router.post('/users/:id/documents', authorize('ADMIN'), upload.single('document'), uploadDocument);

module.exports = router;
