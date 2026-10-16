const mongoose = require('mongoose');


// =====================================================
// Payroll Lesson Snapshot
// =====================================================

const PayrollLessonSchema = new mongoose.Schema(
    {
        lesson: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Lesson',
            required: true
        },

        lesson_date: {
            type: Date,
            required: true
        },

        duration_minutes: {
            type: Number,
            required: true,
            min: 1
        },

        lesson_units: {
            type: Number,
            required: true,
            min: 0
        },

        price_per_lesson: {
            type: Number,
            required: true,
            min: 0
        },

        amount: {
            type: Number,
            required: true,
            min: 0
        }
    },
    {
        _id: false
    }
);


// =====================================================
// Payroll Discount
// =====================================================

const PayrollDiscountSchema = new mongoose.Schema(
    {
        amount: {
            type: Number,
            required: true,
            min: 0
        },

        note: {
            type: String,
            required: true,
            trim: true
        },

        created_at: {
            type: Date,
            default: Date.now
        }
    },
    {
        _id: true
    }
);


// =====================================================
// Payroll Bonus
// =====================================================

const PayrollBonusSchema = new mongoose.Schema(
    {
        amount: {
            type: Number,
            required: true,
            min: 0
        },

        note: {
            type: String,
            required: true,
            trim: true
        },

        created_at: {
            type: Date,
            default: Date.now
        }
    },
    {
        _id: true
    }
);


// =====================================================
// Teacher Payroll
// =====================================================

const TeacherPayrollSchema = new mongoose.Schema(
    {
        academy_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Academy',
            required: true,
            index: true
        },

        currency: {
            type: String,
            uppercase: true,
            match: /^[A-Z]{3}$/,
            default: process.env.DEFAULT_CURRENCY || 'EGP'
        },

        teacher_assignment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TeacherAssignment',
            required: true,
            index: true
        },

        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Teacher',
            required: true,
            index: true
        },

        billing_month: {
            type: String,
            required: true,
            match: /^\d{4}-(0[1-9]|1[0-2])$/,
            index: true
        },

        lessons: {
            type: [PayrollLessonSchema],
            default: []
        },

        total_lessons: {
            type: Number,
            default: 0,
            min: 1
        },

        total_units: {
            type: Number,
            default: 0,
            min: 0
        },

        price_per_lesson: {
            type: Number,
            required: true,
            min: 0
        },

        base_amount: {
            type: Number,
            required: true,
            min: 0
        },

        discounts: {
            type: [PayrollDiscountSchema],
            default: []
        },

        discount_amount: {
            type: Number,
            default: 0,
            min: 0
        },

        bonuses: {
            type: [PayrollBonusSchema],
            default: []
        },

        bonus_amount: {
            type: Number,
            default: 0,
            min: 0
        },

        // Final Salary = base_amount + bonus_amount - discount_amount
        total_amount: {
            type: Number,
            required: true,
            min: 0
        },

        paid_amount: {
            type: Number,
            default: 0,
            min: 0
        },

        remaining_amount: {
            type: Number,
            required: true,
            min: 0
        },

        status: {
            type: String,

            enum: [
                'pending',
                'partially_paid',
                'paid',
                'cancelled'
            ],

            default: 'pending',

            index: true
        },

        paid_at: {
            type: Date,
            default: null
        },

        generated_at: {
            type: Date,
            default: Date.now
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


// =====================================================
// Indexes
// =====================================================

TeacherPayrollSchema.index(
    {
        academy_id: 1,
        teacher_assignment: 1,
        billing_month: 1
    },
    {
        unique: true
    }
);

TeacherPayrollSchema.index({
    academy_id: 1,
    billing_month: 1
});

TeacherPayrollSchema.index({
    academy_id: 1,
    teacher: 1,
    billing_month: 1
});


module.exports = mongoose.model(
    'TeacherPayroll',
    TeacherPayrollSchema
);