const mongoose = require('mongoose');

const PaymentAllocationSchema =
    new mongoose.Schema(
        {
            payment: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Payment',
                required: true
            },

            invoice: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Invoice',
                required: true
            },

            amount: {
                type: Number,
                required: true,
                min: 0.01
            },

            currency: {
                type: String,
                uppercase: true,
                match: /^[A-Z]{3}$/,
                default: process.env.DEFAULT_CURRENCY || 'EGP'
            },

            exchange_rate: {
                type: Number,
                min: 0,
                default: 1
            }
        },

        {
            timestamps: true
        }
    );


// =====================================================
// Indexes
// =====================================================

PaymentAllocationSchema.index({
    payment: 1
});

PaymentAllocationSchema.index({
    invoice: 1
});

PaymentAllocationSchema.index(
    {
        payment: 1,
        invoice: 1
    },
    {
        unique: true
    }
);


module.exports =
    mongoose.model(
        'PaymentAllocation',
        PaymentAllocationSchema
    );