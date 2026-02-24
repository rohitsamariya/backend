/**
 * @desc    Middleware to ensure onboarding is completed for employees
 */
exports.requireOnboardingComplete = (req, res, next) => {
    if (req.user && req.user.role === 'EMPLOYEE' && req.user.status !== 'ACTIVE') {
        return res.status(403).json({
            success: false,
            error: 'Onboarding required',
            redirectTo: '/onboarding'
        });
    }
    next();
};
