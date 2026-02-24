/**
 * @desc    Middleware to ensure user has a specific status
 * @param   {string} status - Required status (e.g., 'ACTIVE', 'ONBOARDING')
 */
exports.requireStatus = (status) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, error: 'Not authorized' });
        }

        if (req.user.status !== status) {
            let error = `Access denied. Requirement: ${status} status.`;
            let redirectTo = null;

            if (status === 'ACTIVE' && req.user.status === 'ONBOARDING') {
                error = 'Please complete your onboarding first.';
                redirectTo = '/onboarding';
            }

            return res.status(403).json({
                success: false,
                error,
                redirectTo
            });
        }

        next();
    };
};
