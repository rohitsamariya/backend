const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    phone: {
        type: String,
        required: [true, 'Please add phone number']
    },
    address: {
        type: String,
        required: [true, 'Please add address']
    },
    emergencyContact: {
        type: String,
        required: [true, 'Please add emergency contact']
    },
    designation: {
        type: String,
        required: [true, 'Please add designation']
    },
    department: {
        type: String,
        required: [true, 'Please add department']
    },
    joiningDate: {
        type: Date,
        required: [true, 'Please add joining date']
    },
    documents: {
        type: [String], // Array of document URLs
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Profile', profileSchema);
