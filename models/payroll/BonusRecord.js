const mongoose = require('mongoose');

const bonusRecordSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    financialYear: { type: String, required: true },

    basicSalary: { type: Number, required: true },
    isEligible: { type: Boolean, default: false },          // Salary ≤ ₹21,000
    bonusRate: { type: Number, default: 8.33 },             // 8.33% to 20%
    bonusAmount: { type: Number, default: 0 },

    // Calculation basis
    calculationBase: { type: Number, default: 0 },          // Min(actual salary, ₹7,000) as per Payment of Bonus Act
    monthsWorked: { type: Number, default: 12 },

    paidOn: Date,
    status: { type: String, enum: ['PENDING', 'APPROVED', 'PAID'], default: 'PENDING' }
}, { timestamps: true });

bonusRecordSchema.index({ user: 1, financialYear: 1 }, { unique: true });

module.exports = mongoose.model('BonusRecord', bonusRecordSchema);
