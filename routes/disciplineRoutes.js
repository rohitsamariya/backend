const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { getDisciplineReport } = require('../controllers/disciplineController');

router.get('/report', protect, authorize('ADMIN', 'HR'), getDisciplineReport);

module.exports = router;
