const mongoose = require('mongoose');

const punchSchema = new mongoose.Schema({
    checkIn: {
        type: Date,
        required: true
    },
    checkInLocation: {
        latitude: Number,
        longitude: Number
    },
    checkOut: {
        type: Date
    },
    checkOutLocation: {
        latitude: Number,
        longitude: Number
    },
    autoClosed: {
        type: Boolean,
        default: false
    }
}, { _id: false });

const attendanceSchema = new mongoose.Schema({
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
    shift: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shift',
        required: true
    },
    date: {
        type: Date, // Branch Timezone Midnight
        required: true
    },
    punches: [punchSchema],
    totalWorkingMinutes: {
        type: Number,
        default: 0
    },
    totalBreakMinutes: {
        type: Number,
        default: 0
    },
    lateMarked: {
        type: Boolean,
        default: false
    },
    earlyExitMarked: {
        type: Boolean,
        default: false
    },
    autoClosed: {
        type: Boolean,
        default: false
    },
    isOpen: {
        type: Boolean,
        default: false // Default false (Closed until Punch Created)
    },
    openPunchIndex: {
        type: Number,
        default: null // Tracks exact index of currently open punch
    },
    status: {
        type: String,
        enum: ['PRESENT', 'HALF_DAY', 'ABSENT', 'HOLIDAY', 'WEEK_OFF'],
        default: 'PRESENT'
    },
    suspiciousLocation: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Compound index: One attendance document per user per day
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

// Index for Efficient Open Punch Lookup (Fix 2 & 7)
// Replaces efficient but complex 'punches.checkOut' index
attendanceSchema.index({ branch: 1, date: 1, isOpen: 1 });
// Index for Monthly Summary Aggregation
attendanceSchema.index({ branch: 1, date: 1, status: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
