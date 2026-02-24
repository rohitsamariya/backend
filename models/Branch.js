const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a branch name'],
        unique: true,
        trim: true,
        lowercase: true, // Auto-convert to lowercase
        index: true
    },
    timezone: {
        type: String,
        required: [true, 'Please add a timezone'],
        // No default value as per requirement
    },
    state: {
        type: String,
        required: [true, 'Please add a branch state (e.g., Maharashtra)'],
        default: 'Maharashtra'
    },
    latitude: {
        type: Number,
        required: [true, 'Please add latitude'],
        min: [-90, 'Latitude must be between -90 and 90'],
        max: [90, 'Latitude must be between -90 and 90']
    },
    longitude: {
        type: Number,
        required: [true, 'Please add longitude'],
        min: [-180, 'Longitude must be between -180 and 180'],
        max: [180, 'Longitude must be between -180 and 180']
    },
    radiusInMeters: {
        type: Number,
        required: [true, 'Please add radius'],
        min: [10, 'Radius must be at least 10 meters']
    },
    isActive: {
        type: Boolean,
        default: true
    },
    workingDays: {
        type: [String],
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Branch', branchSchema);
