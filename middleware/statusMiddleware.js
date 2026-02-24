const protectActiveOnly = (req, res, next) => {
    if (req.user && req.user.status === 'ACTIVE') {
        next();
    } else {
        res.status(403).json({ success: false, error: 'Access denied. Account not active.' });
    }
};

module.exports = { protectActiveOnly };
