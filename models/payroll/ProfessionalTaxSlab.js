const mongoose = require('mongoose');

const professionalTaxSlabSchema = new mongoose.Schema({
    state: { type: String, required: true },
    financialYear: { type: String, default: '2025-26' },
    slabs: [{
        from: { type: Number, required: true },
        to: { type: Number, default: null },
        monthly: { type: Number, required: true },     // Monthly PT amount
        february: { type: Number }                       // Some states have different Feb amount
    }],
    maxAnnual: { type: Number, default: 2500 },          // ₹2,500 annual cap for most states
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

professionalTaxSlabSchema.index({ state: 1, financialYear: 1, isActive: 1 });

module.exports = mongoose.model('ProfessionalTaxSlab', professionalTaxSlabSchema);
