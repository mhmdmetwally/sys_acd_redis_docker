const mongoose = require('mongoose');

// =====================================================
// Expense
// =====================================================

const ExpenseSchema = new mongoose.Schema(
    {
        // =========================================
        // Academy
        // =========================================

        academy_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Academy',
            required: true,
            index: true
        },

        // =========================================
        // Payroll
        //
        // موجود فقط عندما يكون المصروف
        // خاص براتب مدرس
        // =========================================

        payroll: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TeacherPayroll',
            default: null,
            index: true
        },

        // =========================================
        // Category
        // =========================================

        category: {
            type: String,
            required: true,
            trim: true,
            index: true
        },

        // =========================================
        // Title
        // =========================================

        title: {
            type: String,
            required: true,
            trim: true
        },

        // =========================================
        // Amount
        // =========================================

        amount: {
            type: Number,
            required: true,
            min: 0
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

        // =========================================
        // Expense Date
        // =========================================

        expense_date: {
            type: Date,
            default: Date.now,
            index: true
        },

        // =========================================
        // Payment Method
        // =========================================

        payment_method: {
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

        // =========================================
        // Reference
        // =========================================

        reference: {
            type: String,
            trim: true
        },

        // =========================================
        // Status
        // =========================================

        status: {
            type: String,

            enum: [
                'completed',
                'cancelled'
            ],

            default: 'completed',

            index: true
        },

        // =========================================
        // Notes
        // =========================================

        notes: {
            type: String,
            trim: true
        }
    },

    {
        timestamps: true
    }
);

// =====================================================
// Indexes
// =====================================================

ExpenseSchema.index({
    academy_id: 1,
    expense_date: 1
});

ExpenseSchema.index({
    academy_id: 1,
    category: 1,
    expense_date: 1
});

ExpenseSchema.index({
    academy_id: 1,
    payroll: 1
});

module.exports = mongoose.model(
    'Expense',
    ExpenseSchema
);