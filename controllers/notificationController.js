const Notification = require('../models/Notification');

// @desc    Get Notifications (Paginated)
// @route   GET /api/employee/notifications
// @access  EMPLOYEE (Active)
exports.getNotifications = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Notification.countDocuments({ user: req.user._id });
        const unread = await Notification.countDocuments({ user: req.user._id, isRead: false });

        res.status(200).json({
            success: true,
            count: notifications.length,
            total,
            unread,
            pagination: { page, limit, pages: Math.ceil(total / limit) },
            data: notifications
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Mark Notification as Read
// @route   PUT /api/employee/notifications/read/:id
// @access  EMPLOYEE
exports.markRead = async (req, res) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!notification) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        notification.isRead = true;
        await notification.save();

        res.status(200).json({ success: true, data: notification });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};

// @desc    Get Unread Count
// @route   GET /api/employee/notifications/unread-count
// @access  EMPLOYEE
exports.getUnreadCount = async (req, res) => {
    try {
        const count = await Notification.countDocuments({
            user: req.user._id,
            isRead: false
        });
        res.status(200).json({ success: true, count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
};
