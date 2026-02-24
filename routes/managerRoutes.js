const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    getManagerLiveDashboard,
    getTeamStatus,
    getRiskReport
} = require('../controllers/managerDashboardController');

router.use(protect);
router.use(authorize('MANAGER'));

// Live Status
router.get('/dashboard/live', getManagerLiveDashboard);

// Team List (Paginated)
router.get('/dashboard/team', getTeamStatus);

// Risk Report
router.get('/dashboard/risk-report', getRiskReport);

module.exports = router;
