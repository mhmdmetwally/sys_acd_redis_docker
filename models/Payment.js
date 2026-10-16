const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema(
    {
        academy_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Academy',
            required: true
        },

        family: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Family',
            required: true
        },

        /*
        Direct invoice payment.

        null when payment is an advance.
        */

        invoice: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Invoice',
            default: null
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

        base_amount: {
            type: Number,
            min: 0
        },

        base_currency: {
            type: String,
            uppercase: true,
            match: /^[A-Z]{3}$/,
            default: process.env.DEFAULT_CURRENCY || 'EGP'
        },

        exchange_rate: {
            type: Number,
            min: 0,
            default: 1
        },

        /*
        Amount that has not been allocated
        to invoices yet.
        */

        remaining_amount: {
            type: Number,
            required: true,
            min: 0
        },

        type: {
            type: String,

            enum: [
                'invoice_payment',
                'advance'
            ],

            required: true
        },

        method: {
            type: String,

            enum: [
                'cash',
                'bank_transfer',
                'wallet',
                'card',
                'other'
            ],

            default: 'cash'
        },

        payment_date: {
            type: Date,
            default: Date.now
        },

        reference: {
            type: String,
            trim: true
        },

        notes: {
            type: String,
            trim: true
        },

        status: {
            type: String,

            enum: [
                'completed',
                'cancelled'
            ],

            default: 'completed'
        }
    },

    {
        timestamps: true
    }
);


// =====================================================
// Indexes
// =====================================================

PaymentSchema.index({
    academy_id: 1,
    family: 1
});

PaymentSchema.index({
    academy_id: 1,
    invoice: 1
});

PaymentSchema.index({
    academy_id: 1,
    payment_date: 1
});

PaymentSchema.index({
    academy_id: 1,
    family: 1,
    payment_date: 1
});


module.exports =
    mongoose.model(
        'Payment',
        PaymentSchema
    );