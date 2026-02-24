const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    getLiveStatus,
    getTodayAttendance,
    getMonthlySummary,
    getCorrections,
    approveCorrection,
    rejectCorrection,
    getDisciplineReport
} = require('../controllers/hrDashboardController');

// 1. Global HR Security Payer
router.use(protect);
router.use(authorize('HR', 'ADMIN'));

// 2. Strict Branch Ownership Middleware
// This forces HR users to only access their own branch.
// For ADMIN, it requires explicit branchId param.
const restrictToOwnBranch = (req, res, next) => {
    // Check Query Params (GET) or Body (POST/PUT) if needed (for PUT approval)
    // Most APIs here are GET, so check Query.
    // For Approve/Reject (PUT), we might not have branchId in URL. 
    // But we should verify the Record belongs to HR's branch.
    // That needs DB lookup -> expensive middleware? 
    // Better: Helper inside Controller or check here if params available.
    // For Dashboard READ APIs (Live, Today, Summary) -> They obey branchId query.

    if (req.user.role === 'HR') {
        const userBranchId = req.user.branch.toString();
        // Force the query param to be HR's branch
        req.query.branchId = userBranchId;
        // Also if body has branchId for some reason
        if (req.body.branchId) req.body.branchId = userBranchId;
    }

    if (req.user.role === 'ADMIN') {
        // Must provide branchId for context-aware APIs
        // Corrections panel might be "All Branches"? -> If supported.
        // For Live Status / Today / Summary -> we strictly need a branch context.
        if (['/live-status', '/today', '/monthly-summary', '/discipline'].includes(req.path)) {
            if (!req.query.branchId) {
                return res.status(400).json({ success: false, error: 'Admin must provide branchId for this endpoint' });
            }
        }
    }

    next();
};

router.use(restrictToOwnBranch);

router.get('/live-status', getLiveStatus);
router.get('/today', getTodayAttendance);
router.get('/monthly-summary', getMonthlySummary);
router.get('/discipline', getDisciplineReport);

router.get('/corrections', getCorrections);
router.put('/corrections/:id/approve', approveCorrection);
router.put('/corrections/:id/reject', rejectCorrection);

module.exports = router;
