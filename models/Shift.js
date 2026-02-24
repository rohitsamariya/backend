const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a shift name'],
        trim: true
    },
    startTime: {
        type: String,
        required: [true, 'Please add start time (HH:mm)'],
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please use HH:mm format']
    },
    endTime: {
        type: String,
        required: [true, 'Please add end time (HH:mm)'],
        match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please use HH:mm format']
    },
    allowedLateMinutes: {
        type: Number,
        default: 0,
        min: 0
    },
    allowedEarlyExitMinutes: {
        type: Number,
        default: 0,
        min: 0
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Prevent duplicate shift names within the same branch
shiftSchema.index({ branch: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Shift', shiftSchema);
