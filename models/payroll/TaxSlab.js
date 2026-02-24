const mongoose = require('mongoose');

const taxSlabSchema = new mongoose.Schema({
    regime: { type: String, enum: ['OLD', 'NEW'], required: true },
    financialYear: { type: String, required: true, default: '2025-26' },
    slabs: [{
        from: { type: Number, required: true },    // Lower bound (inclusive)
        to: { type: Number, default: null },        // Upper bound (null = no limit)
        rate: { type: Number, required: true }      // Tax rate in %
    }],
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

taxSlabSchema.index({ regime: 1, financialYear: 1, isActive: 1 });

module.exports = mongoose.model('TaxSlab', taxSlabSchema);
