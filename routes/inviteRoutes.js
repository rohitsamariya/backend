const express = require('express');
const { sendInvite, verifyInviteToken } = require('../controllers/inviteController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

const { authLimiter } = require('../middleware/rateLimitMiddleware');

router.post('/send', protect, authorize('ADMIN', 'HR'), sendInvite);
router.get('/verify/:token', authLimiter, verifyInviteToken);

module.exports = router;
