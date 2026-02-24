const mongoose = require('mongoose');

const correctionRequestSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    attendance: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Attendance',
        required: true,
        index: true
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['MISSED_CHECKIN', 'MISSED_CHECKOUT', 'WRONG_TIME', 'GPS_FAILURE'],
        required: true
    },
    reason: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500
    },
    requestedData: {
        type: Object, // Flexible to store { checkIn: Date, checkOut: Date } etc.
        required: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED'],
        default: 'PENDING',
        index: true
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Compound Index: User + Status (for "My Pending Requests")
correctionRequestSchema.index({ user: 1, status: 1 });
// Compound Index: Branch + Status (for HR Dashboard)
correctionRequestSchema.index({ branch: 1, status: 1 });

module.exports = mongoose.model('AttendanceCorrectionRequest', correctionRequestSchema);
