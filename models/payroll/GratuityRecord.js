const mongoose = require('mongoose');

const gratuityRecordSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    dateOfJoining: { type: Date, required: true },
    dateOfExit: Date,
    yearsOfService: { type: Number, default: 0 },

    isEligible: { type: Boolean, default: false },          // 5+ years service
    lastDrawnBasicPlusDa: { type: Number, default: 0 },

    // Formula: (Last Salary × 15 × Years) / 26
    gratuityAmount: { type: Number, default: 0 },

    // Payment of Gratuity Act cap (₹20,00,000)
    cappedAmount: { type: Number, default: 0 },

    status: { type: String, enum: ['ACCRUING', 'ELIGIBLE', 'PAID'], default: 'ACCRUING' },
    paidOn: Date,
    remarks: String
}, { timestamps: true });

gratuityRecordSchema.index({ user: 1 }, { unique: true });

module.exports = mongoose.model('GratuityRecord', gratuityRecordSchema);
