const mongoose = require('mongoose');

const BonusSchema = new mongoose.Schema(
    {
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        reason: {
            type: String,
            trim: true,
            required: true
        }
    },
    { _id: true }
);

const DeductionSchema = new mongoose.Schema(
    {
        amount: {
            type: Number,
            required: true,
            min: 0
        },
        reason: {
            type: String,
            trim: true,
            required: true
        }
    },
    { _id: true }
);

const SupervisorPayrollSchema = new mongoose.Schema(
    {
        academy_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Academy',
            required: true
        },

        currency: {
            type: String,
            uppercase: true,
            match: /^[A-Z]{3}$/,
            default: process.env.DEFAULT_CURRENCY || 'EGP'
        },

        supervisor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Supervisor',
            required: true
        },

        // الشهر بصيغة YYYY-MM
        billing_month: {
            type: String,
            required: true,
            match: /^\d{4}-(0[1-9]|1[0-2])$/
        },

        // الراتب الأساسي الثابت
        base_salary: {
            type: Number,
            required: true,
            min: 0
        },

        // المكافآت والبونس
        bonuses: [BonusSchema],

        total_bonuses: {
            type: Number,
            default: 0,
            min: 0
        },

        // الخصومات والجزاءات
        deductions: [DeductionSchema],

        total_deductions: {
            type: Number,
            default: 0,
            min: 0
        },

        // إجمالي الصافي المستحق = الأساسي + المكافآت - الخصومات
        net_salary: {
            type: Number,
            required: true,
            min: 0
        },

        status: {
            type: String,
            enum: ['draft', 'approved', 'paid', 'cancelled'],
            default: 'draft'
        },

        payment_date: {
            type: Date
        },

        notes: {
            type: String,
            trim: true
        }
    },
    {
        timestamps: true
    }
);

// منع تكرار مسودة/سجل مرتب لنفس المشرف في نفس الشهر داخل نفس الأكاديمية
SupervisorPayrollSchema.index(
    { academy_id: 1, supervisor: 1, billing_month: 1 },
    { unique: true }
);

module.exports = mongoose.model('SupervisorPayroll', SupervisorPayrollSchema);
