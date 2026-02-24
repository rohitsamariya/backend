const mongoose = require('mongoose');

const leaveLedgerSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    payrollCycle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PayrollCycle'
    },
    month: {
        type: Number,
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['ALLOCATION', 'DEDUCTION', 'CORRECTION', 'REVERSION'],
        required: true
    },
    leaveType: {
        type: String,
        enum: ['PAID', 'UNPAID', 'PROBATION_PENALTY'],
        default: 'PAID'
    },
    days: {
        type: Number,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    referenceId: {
        type: mongoose.Schema.Types.ObjectId,
        required: false // Can be PayrollSummary ID or Attendance ID
    },
    carriedForwardFrom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LeaveLedger'
    },
    payrollRunId: {
        type: String,
        index: true
    }
}, {
    timestamps: true
});

// Unique constraint to prevent duplicate entries for the same reference (e.g. payroll record)
leaveLedgerSchema.index(
    { user: 1, referenceId: 1 },
    { unique: true, partialFilterExpression: { referenceId: { $exists: true, $ne: null } } }
);

// Index for quick YTD lookups
leaveLedgerSchema.index({ user: 1, year: 1, month: 1 });

/**
 * Requirement 3: Source of Truth Balance Calculation
 * Balance = Sum(ALLOCATION) - Sum(DEDUCTION)
 * If excludingSupersededRunId is provided, we skip deductions linked to that run.
 */
leaveLedgerSchema.statics.getBalance = async function (userId, excludingSupersededRunId = null) {
    const aggregate = await this.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        {
            $match: {
                $or: [
                    { type: 'ALLOCATION' },
                    {
                        type: 'DEDUCTION',
                        payrollRunId: { $ne: excludingSupersededRunId }
                    },
                    { type: 'CORRECTION' },
                    { type: 'REVERSION' }
                ]
            }
        },
        {
            $group: {
                _id: null,
                totalAllocated: { $sum: { $cond: [{ $eq: ['$type', 'ALLOCATION'] }, '$days', 0] } },
                totalDeducted: { $sum: { $cond: [{ $eq: ['$type', 'DEDUCTION'] }, '$days', 0] } },
                totalCorrected: { $sum: { $cond: [{ $eq: ['$type', 'CORRECTION'] }, '$days', 0] } },
                totalReverted: { $sum: { $cond: [{ $eq: ['$type', 'REVERSION'] }, '$days', 0] } }
            }
        }
    ]);

    if (!aggregate.length) return 0;
    const { totalAllocated, totalDeducted, totalCorrected, totalReverted } = aggregate[0];
    return (totalAllocated + totalCorrected) - (totalDeducted + totalReverted);
};

module.exports = mongoose.model('LeaveLedger', leaveLedgerSchema);
