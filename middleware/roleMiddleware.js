const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: `User code ${req.user ? req.user.role : 'Unknown'} is not authorized `
            });
        }
        next();
    };
};

module.exports = { authorize };
