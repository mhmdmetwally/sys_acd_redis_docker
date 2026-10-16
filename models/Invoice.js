const mongoose = require('mongoose');


// =====================================================
// Invoice Discount
//
// Snapshot of discount at invoice creation time
// =====================================================

const InvoiceDiscountSchema =
    new mongoose.Schema(
        {
            // =========================================
            // Original Discount ID
            // =========================================

            discount: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'FamilyDiscount',
                required: true
            },


            // =========================================
            // Percentage
            // =========================================

            percentage: {
                type: Number,
                required: true,
                min: 0,
                max: 100
            },


            // =========================================
            // Reason
            // =========================================

            note: {
                type: String,
                required: true,
                trim: true
            },


            // =========================================
            // Actual Discount Amount
            //
            // Example:
            //
            // invoice total = 1000
            // discount = 10%
            //
            // amount = 100
            // =========================================

            amount: {
                type: Number,
                required: true,
                min: 0
            }
        },

        {
            _id: true
        }
    );


// =====================================================
// Invoice Item
// =====================================================

const InvoiceItemSchema =
    new mongoose.Schema(
        {
            student_assignment: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'StudentAssignment',
                required: true
            },

            student_subject: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'StudentSubject',
                required: true
            },

            lessons: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'Lesson'
                }
            ],

            lessons_count: {
                type: Number,
                required: true,
                min: 0
            },

            total_minutes: {
                type: Number,
                required: true,
                min: 0
            },

            billing_hours: {
                type: Number,
                required: true,
                min: 0
            },

            price_per_lesson: {
                type: Number,
                required: true,
                min: 0
            },

            total: {
                type: Number,
                required: true,
                min: 0
            }
        },

        {
            _id: true
        }
    );


// =====================================================
// Invoice
// =====================================================

const InvoiceSchema =
    new mongoose.Schema(
        {
            // =========================================
            // Academy
            // =========================================

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


            // =========================================
            // Family
            // =========================================

            family: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Family',
                required: true
            },


            // =========================================
            // Items
            // =========================================

            items: {
                type: [InvoiceItemSchema],

                required: true,

                validate: {
                    validator: function (value) {
                        return value.length > 0;
                    },

                    message:
                        'invoice must contain at least one item'
                }
            },


            // =========================================
            // Total Before Discount
            // =========================================

            subtotal_amount: {
                type: Number,

                required: true,

                min: 0
            },


            // =========================================
            // Discounts Snapshot
            // =========================================

            discounts: {
                type: [InvoiceDiscountSchema],

                default: []
            },


            // =========================================
            // Total Discount Percentage
            // =========================================

            discount_percentage: {
                type: Number,

                default: 0,

                min: 0,

                max: 100
            },


            // =========================================
            // Total Discount Amount
            // =========================================

            discount_amount: {
                type: Number,

                default: 0,

                min: 0
            },


            // =========================================
            // Final Invoice Total
            //
            // subtotal - discount
            // =========================================

            total_amount: {
                type: Number,

                required: true,

                min: 0
            },


            // =========================================
            // Paid
            // =========================================

            paid_amount: {
                type: Number,

                default: 0,

                min: 0
            },


            // =========================================
            // Remaining
            // =========================================

            remaining_amount: {
                type: Number,

                required: true,

                min: 0
            },


            // =========================================
            // Status
            // =========================================

            status: {
                type: String,

                enum: [
                    'unpaid',
                    'partially_paid',
                    'paid',
                    'cancelled'
                ],

                default: 'unpaid'
            },


            // =========================================
            // Billing Month
            // =========================================

            billing_month: {
                type: String,

                required: true,

                match:
                    /^\d{4}-(0[1-9]|1[0-2])$/
            },


            // =========================================
            // Invoice Date
            // =========================================

            invoice_date: {
                type: Date,

                default: Date.now
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

InvoiceSchema.index({
    academy_id: 1,
    family: 1
});


InvoiceSchema.index({
    academy_id: 1,
    billing_month: 1
});


InvoiceSchema.index({
    academy_id: 1,
    family: 1,
    billing_month: 1
});


module.exports =
    mongoose.model(
        'Invoice',
        InvoiceSchema
    );