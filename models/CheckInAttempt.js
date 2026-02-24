const mongoose = require('mongoose');

const checkInAttemptSchema = new mongoose.Schema({
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
    date: {
        type: Date,
        default: Date.now,
        required: true
    },
    attemptLocation: {
        latitude: {
            type: Number,
            required: true
        },
        longitude: {
            type: Number,
            required: true
        }
    },
    distanceMeters: {
        type: Number,
        required: true
    },
    failureReason: {
        type: String,
        enum: ['OUT_OF_BOUNDS', 'NULL_ISLAND_SPOOF', 'IMPOSSIBLE_TRAVEL'],
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('CheckInAttempt', checkInAttemptSchema);
