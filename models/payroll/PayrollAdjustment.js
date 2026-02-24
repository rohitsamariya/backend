const mongoose = require('mongoose');

/**
 * Payroll Adjustment — Arrears, Deductions, Bonuses
 * 
 * When salary structure changes mid-FY, arrears are computed
 * for months already processed at the old rate.
 */
const payrollAdjustmentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },

    adjustmentType: {
        type: String,
        enum: ['ARREAR', 'DEDUCTION', 'BONUS', 'REIMBURSEMENT'],
        required: true
    },

    // Arrears details
    monthsCovered: [{ month: Number, year: Number }],  // Months this adjustment covers
    oldGross: { type: Number, default: 0 },            // Previous monthly gross
    newGross: { type: Number, default: 0 },            // New monthly gross
    amount: { type: Number, required: true },           // Total adjustment amount

    // Linkage
    salaryStructureVersion: { type: Number },
    appliedInMonth: { type: Number },
    appliedInYear: { type: Number },
    appliedInPayrollId: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollSummary' },

    // Status
    status: {
        type: String,
        enum: ['PENDING', 'APPLIED', 'CANCELLED'],
        default: 'PENDING'
    },

    reason: { type: String },
    generatedAt: { type: Date, default: Date.now },
    appliedAt: { type: Date }
}, { timestamps: true });

payrollAdjustmentSchema.index({ user: 1, status: 1 });
payrollAdjustmentSchema.index({ user: 1, appliedInMonth: 1, appliedInYear: 1 });

module.exports = mongoose.model('PayrollAdjustment', payrollAdjustmentSchema);
