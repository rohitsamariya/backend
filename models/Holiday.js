const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a holiday name'],
        trim: true
    },
    date: {
        type: Date,
        required: [true, 'Please add a date'],
        unique: true
    },
    type: {
        type: String,
        enum: ['National', 'Regional', 'Optional', 'Company', 'Festival'],
        default: 'National'
    },
    description: {
        type: String,
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Prevent duplicate dates
holidaySchema.index({ date: 1 }, { unique: true });

module.exports = mongoose.model('Holiday', holidaySchema);
