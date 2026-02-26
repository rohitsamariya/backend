const mongoose = require('mongoose');

const offerInviteSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Please add an email'],
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ],
        lowercase: true
    },
    name: {
        type: String,
        required: [true, 'Please add a name']
    },
    role: {
        type: String,
        enum: ['EMPLOYEE', 'ADMIN', 'HR', 'MANAGER', 'TEAM_LEADER'],
        default: 'EMPLOYEE'
    },
    branch: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch'
    },
    shift: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shift'
    },
    token: {
        type: String,
        required: true // We will store hashed token here
    },
    rawToken: {
        type: String,
        select: false // Only for internal use/admin viewing immediately, usually not stored but useful for dev
    },
    expiresAt: {
        type: Date,
        required: true
    },
    used: {
        type: Boolean,
        default: false
    },
    invitedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('OfferInvite', offerInviteSchema);
