const express = require('express');
const router = express.Router();
const { register, verifyOtp, login, verifyInvite, getMe, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const { authLimiter } = require('../middleware/rateLimitMiddleware');

router.post('/register', authLimiter, register);
router.post('/verify-otp', authLimiter, verifyOtp);
router.get('/invite/:token', verifyInvite);
router.post('/login', login);
router.post('/forgot-password', authLimiter, forgotPassword);
router.put('/reset-password/:resetToken', authLimiter, resetPassword);
router.get('/me', protect, getMe);

module.exports = router;
