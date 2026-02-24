const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['VIOLATION', 'DISCIPLINE', 'AUTO_CHECKOUT', 'APPROVAL', 'SHIFT_CHANGED'],
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    meta: {
        type: Object, // Extra data e.g. { violationId, attendanceId }
        default: {}
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Indexes for performance
notificationSchema.index({ user: 1, createdAt: -1 }); // Newest first
notificationSchema.index({ user: 1, isRead: 1 }); // Unread count

module.exports = mongoose.model('Notification', notificationSchema);
