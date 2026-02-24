const mongoose = require('mongoose');

const violationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true
    },
    attendance: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Attendance',
        required: true
    },
    type: {
        type: String,
        enum: ['LATE', 'EARLY_EXIT', 'AUTO_CHECKOUT'],
        required: true
    },
    date: {
        type: Date, // Midnight UTC of the occurrence
        required: true
    },
    month: {
        type: Number, // 1-12
        required: true
    },
    year: {
        type: Number, // YYYY
        required: true
    }
}, {
    timestamps: true
});

// Compound index for efficient monthly aggregation
violationSchema.index({ user: 1, month: 1, year: 1 });
// Compound index for Branch Discipline Report
violationSchema.index({ branch: 1, month: 1, year: 1 });

module.exports = mongoose.model('Violation', violationSchema);
