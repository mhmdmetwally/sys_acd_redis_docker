const mongoose = require('mongoose');
const AsyncWrapper = require('../middleware/AsyncWrapper');
const Invoice = require('../models/Invoice');
const Academy = require('../models/Academy');
const Family = require('../models/Family');
const FamilyDiscount = require('../models/FamilyDiscount');
const StudentAssignment = require('../models/StudentAssignment');
const StudentSubject = require('../models/StudentSubject');
const Lesson = require('../models/Lesson');
const app_error = require('../utils/AppError');
const http_status_text = require('../utils/HttpStatusText');

const {
    isValidBillingMonth,
    getMonthRange
} = require('../utils/Billing');

const {
    getAcademyId,
    getStudentAssignmentForUser
} = require('../utils/AccessScope');

const { normalizeCurrency } = require('../utils/Currency');


// =====================================================
// Helper: Create Error
// =====================================================

const createError = (message, statusCode) => {
    const error = new app_error();
    error.create(message, statusCode, http_status_text.FAIL);
    return error;
};


// =====================================================
// Helper: Round
// =====================================================

const roundMoney = (value) => {
    return Number(Number(value).toFixed(2));
};


// =====================================================
// Helper: Get Monthly Invoice Totals
//
// Gets all non-cancelled invoices for:
// academy + family + billing_month
// =====================================================

const getMonthlyInvoiceTotals = async (
    academy_id,
    family,
    billing_month
) => {

    const result = await Invoice.aggregate([
        {
            $match: {
                // تحويل القيم إلى ObjectId صريح لتفادي مشكلة الـ Aggregation في Mongoose
                academy_id: new mongoose.Types.ObjectId(academy_id),
                family: new mongoose.Types.ObjectId(family),
                billing_month,
                status: {
                    $ne: 'cancelled'
                }
            }
        },
        {
            $group: {
                _id: null,
                subtotal_amount: {
                    $sum: '$subtotal_amount'
                },
                discount_amount: {
                    $sum: '$discount_amount'
                },
                total_amount: {
                    $sum: '$total_amount'
                },
                paid_amount: {
                    $sum: '$paid_amount'
                },
                remaining_amount: {
                    $sum: '$remaining_amount'
                },
                invoice_count: {
                    $sum: 1
                }
            }
        }
    ]);


    if (!result.length) {
        return {
            subtotal_amount: 0,
            discount_amount: 0,
            total_amount: 0,
            paid_amount: 0,
            remaining_amount: 0,
            invoice_count: 0
        };
    }


    return {
        subtotal_amount: roundMoney(result[0].subtotal_amount),
        discount_amount: roundMoney(result[0].discount_amount),
        total_amount: roundMoney(result[0].total_amount),
        paid_amount: roundMoney(result[0].paid_amount),
        remaining_amount: roundMoney(result[0].remaining_amount),
        invoice_count: result[0].invoice_count
    };

};


// =====================================================
// Helper: Calculate Monthly Discount
// =====================================================

const calculateIncrementalDiscount = (
    oldSubtotal,
    newSubtotal,
    discounts
) => {

    let oldAmount = roundMoney(oldSubtotal);
    let newAmount = roundMoney(oldSubtotal + newSubtotal);

    const snapshots = [];

    for (const discount of discounts) {
        const percentage = Number(discount.percentage);

        if (
            Number.isNaN(percentage) ||
            percentage <= 0 ||
            percentage > 100
        ) {
            throw createError(
                `invalid discount percentage for discount ${discount._id}`,
                400
            );
        }

        const oldBefore = oldAmount;
        const newBefore = newAmount;

        const oldDiscountAmount = roundMoney(oldBefore * percentage / 100);
        oldAmount = roundMoney(oldBefore - oldDiscountAmount);

        const newDiscountAmount = roundMoney(newBefore * percentage / 100);
        newAmount = roundMoney(newBefore - newDiscountAmount);

        const newPortion = roundMoney(newBefore - oldBefore);
        const newDiscountShare = roundMoney(newPortion * percentage / 100);

        snapshots.push({
            discount: discount._id,
            percentage,
            note: discount.note,
            amount: newDiscountShare
        });
    }

    let oldFinal = roundMoney(oldSubtotal);
    let cumulativeFinal = roundMoney(oldSubtotal + newSubtotal);

    for (const discount of discounts) {
        const percentage = Number(discount.percentage);

        oldFinal = roundMoney(
            oldFinal - roundMoney(oldFinal * percentage / 100)
        );

        cumulativeFinal = roundMoney(
            cumulativeFinal - roundMoney(cumulativeFinal * percentage / 100)
        );
    }

    const newInvoiceFinal = roundMoney(cumulativeFinal - oldFinal);
    const actualDiscount = roundMoney(newSubtotal - newInvoiceFinal);

    snapshots.length = 0;

    let oldStage = roundMoney(oldSubtotal);
    let cumulativeStage = roundMoney(oldSubtotal + newSubtotal);

    for (const discount of discounts) {
        const percentage = Number(discount.percentage);

        const oldStageAfter = roundMoney(
            oldStage - roundMoney(oldStage * percentage / 100)
        );

        const cumulativeStageAfter = roundMoney(
            cumulativeStage - roundMoney(cumulativeStage * percentage / 100)
        );

        const oldDiscount = roundMoney(oldStage - oldStageAfter);
        const cumulativeDiscount = roundMoney(cumulativeStage - cumulativeStageAfter);
        const incrementalAmount = roundMoney(cumulativeDiscount - oldDiscount);

        snapshots.push({
            discount: discount._id,
            percentage,
            note: discount.note,
            amount: incrementalAmount
        });

        oldStage = oldStageAfter;
        cumulativeStage = cumulativeStageAfter;
    }

    return {
        discounts: snapshots,
        discountAmount: actualDiscount,
        totalAmount: newInvoiceFinal
    };

};


// =====================================================
// Create Invoice
// =====================================================

const createInvoice = AsyncWrapper(
    async (req, res, next) => {

        const academy_id = getAcademyId(req);
        const academy = await Academy.findById(academy_id).select('currency');
        const currency = normalizeCurrency(academy?.currency);

        const {
            family,
            billing_month,
            notes
        } = req.body;


        if (!family || !billing_month) {
            return next(
                createError('family and billing_month are required', 400)
            );
        }

        if (!isValidBillingMonth(billing_month)) {
            return next(
                createError('billing_month must be in YYYY-MM format', 400)
            );
        }

        const familyDoc = await Family.findById(family);

        if (!familyDoc) {
            return next(createError('family not found', 404));
        }

        if (familyDoc.is_active === false) {
            return next(createError('family is inactive', 400));
        }

        const { monthStart, nextMonth } = getMonthRange(billing_month);

        const studentAssignments = await StudentAssignment.find({
            academy_id,
            family,
            is_active: true
        });

        if (!studentAssignments.length) {
            return next(
                createError(
                    'no active students found for this family in this academy',
                    400
                )
            );
        }

        const invoiceItems = [];
        let subtotalAmount = 0;

        for (const studentAssignment of studentAssignments) {

            const accessibleStudent = await getStudentAssignmentForUser(
                req,
                studentAssignment._id
            );

            if (!accessibleStudent) {
                continue;
            }

            const studentSubjects = await StudentSubject.find({
                academy_id,
                student_assignment: studentAssignment._id,
                is_active: true
            });

            for (const studentSubject of studentSubjects) {

                const lessons = await Lesson.find({
                    academy_id,
                    student_assignment: studentAssignment._id,
                    student_subject: studentSubject._id,
                    status: 'completed',
                    lesson_date: {
                        $gte: monthStart,
                        $lt: nextMonth
                    }
                }).sort({ lesson_date: 1 });

                if (!lessons.length) {
                    continue;
                }

                const previousInvoices = await Invoice.find({
                    academy_id,
                    family,
                    'items.lessons': {
                        $in: lessons.map(lesson => lesson._id)
                    },
                    status: {
                        $ne: 'cancelled'
                    }
                }).select('items.lessons');

                const invoicedLessonIds = new Set();

                for (const previousInvoice of previousInvoices) {
                    for (const invoiceItem of previousInvoice.items) {
                        for (const lessonId of invoiceItem.lessons) {
                            invoicedLessonIds.add(String(lessonId));
                        }
                    }
                }

                const uninvoicedLessons = lessons.filter(
                    lesson => !invoicedLessonIds.has(String(lesson._id))
                );

                if (!uninvoicedLessons.length) {
                    continue;
                }

                let totalMinutes = 0;

                for (const lesson of uninvoicedLessons) {
                    totalMinutes += Number(lesson.duration_minutes || 0);
                }

                const billingHours = totalMinutes / 60;
                const pricePerLesson = Number(studentSubject.price_per_lesson);

                if (Number.isNaN(pricePerLesson) || pricePerLesson < 0) {
                    return next(
                        createError(
                            `invalid price_per_lesson for student subject ${studentSubject._id}`,
                            400
                        )
                    );
                }

                const itemTotal = roundMoney(billingHours * pricePerLesson);

                invoiceItems.push({
                    student_assignment: studentAssignment._id,
                    student_subject: studentSubject._id,
                    lessons: uninvoicedLessons.map(lesson => lesson._id),
                    lessons_count: uninvoicedLessons.length,
                    total_minutes: totalMinutes,
                    billing_hours: Number(billingHours.toFixed(4)),
                    price_per_lesson: pricePerLesson,
                    total: itemTotal
                });

                subtotalAmount += itemTotal;
            }
        }

        if (!invoiceItems.length) {
            return next(
                createError(
                    'no unbilled completed lessons found for this family in this billing month',
                    400
                )
            );
        }

        subtotalAmount = roundMoney(subtotalAmount);

        const previousMonthlyTotals = await getMonthlyInvoiceTotals(
            academy_id,
            family,
            billing_month
        );

        const familyDiscounts = await FamilyDiscount.find({
            academy_id,
            family,
            billing_month,
            status: 'active'
        }).sort({ createdAt: 1 });

        const discountResult = calculateIncrementalDiscount(
            previousMonthlyTotals.subtotal_amount,
            subtotalAmount,
            familyDiscounts
        );

        const totalAmount = roundMoney(discountResult.totalAmount);
        const discountAmount = roundMoney(discountResult.discountAmount);

        const discountPercentage = subtotalAmount === 0
            ? 0
            : Number((discountAmount / subtotalAmount * 100).toFixed(4));

        const status = totalAmount === 0 ? 'paid' : 'unpaid';

        const invoice = await Invoice.create({
            academy_id,
            currency,
            family,
            items: invoiceItems,
            subtotal_amount: subtotalAmount,
            discounts: discountResult.discounts,
            discount_percentage: discountPercentage,
            discount_amount: discountAmount,
            total_amount: totalAmount,
            paid_amount: 0,
            remaining_amount: totalAmount,
            status,
            billing_month,
            notes
        });

        const monthlyTotals = await getMonthlyInvoiceTotals(
            academy_id,
            family,
            billing_month
        );

        return res.status(201).json({
            status: http_status_text.SUCCESS,
            data: {
                invoice,
                monthly_summary: monthlyTotals
            }
        });
    }
);


// =====================================================
// Get Invoices
// =====================================================

const getInvoices = AsyncWrapper(
    async (req, res, next) => {

        const academy_id = getAcademyId(req);
        const filter = { academy_id };

        if (req.query.family) {
            filter.family = req.query.family;
        }

        if (req.query.billing_month) {
            if (!isValidBillingMonth(req.query.billing_month)) {
                return next(
                    createError('billing_month must be in YYYY-MM format', 400)
                );
            }
            filter.billing_month = req.query.billing_month;
        }

        if (req.query.status) {
            filter.status = req.query.status;
        }

        const invoices = await Invoice.find(filter)
            .populate('family', 'name phone is_active')
            .populate('items.student_assignment')
            .populate('items.student_subject')
            .populate('items.lessons')
            .sort({ invoice_date: -1 });

        const totals = invoices.reduce(
            (acc, invoice) => {
                if (invoice.status !== 'cancelled') {
                    acc.subtotal_amount += Number(invoice.subtotal_amount);
                    acc.discount_amount += Number(invoice.discount_amount);
                    acc.total_amount += Number(invoice.total_amount);
                    acc.paid_amount += Number(invoice.paid_amount);
                    acc.remaining_amount += Number(invoice.remaining_amount);
                    acc.invoice_count++;
                }
                return acc;
            },
            {
                subtotal_amount: 0,
                discount_amount: 0,
                total_amount: 0,
                paid_amount: 0,
                remaining_amount: 0,
                invoice_count: 0
            }
        );

        totals.subtotal_amount = roundMoney(totals.subtotal_amount);
        totals.discount_amount = roundMoney(totals.discount_amount);
        totals.total_amount = roundMoney(totals.total_amount);
        totals.paid_amount = roundMoney(totals.paid_amount);
        totals.remaining_amount = roundMoney(totals.remaining_amount);

        return res.status(200).json({
            status: http_status_text.SUCCESS,
            data: {
                invoices,
                totals
            }
        });
    }
);


// =====================================================
// Get Monthly Family Summary
// =====================================================

const getMonthlyFamilySummary = AsyncWrapper(
    async (req, res, next) => {

        const academy_id = getAcademyId(req);
        const { family, billing_month } = req.query;

        if (!family || !billing_month) {
            return next(
                createError('family and billing_month are required', 400)
            );
        }

        if (!isValidBillingMonth(billing_month)) {
            return next(
                createError('billing_month must be in YYYY-MM format', 400)
            );
        }

        const familyDoc = await Family.findOne({ _id: family });

        if (!familyDoc) {
            return next(createError('family not found', 404));
        }

        const invoices = await Invoice.find({
            academy_id,
            family,
            billing_month
        }).sort({ invoice_date: 1 });

        const totals = await getMonthlyInvoiceTotals(
            academy_id,
            family,
            billing_month
        );

        return res.status(200).json({
            status: http_status_text.SUCCESS,
            data: {
                family: {
                    _id: familyDoc._id,
                    name: familyDoc.name,
                    phone: familyDoc.phone
                },
                billing_month,
                invoices,
                totals
            }
        });
    }
);


// =====================================================
// Get Single Invoice
// =====================================================

const getSingleInvoice = AsyncWrapper(
    async (req, res, next) => {

        const academy_id = getAcademyId(req);

        const invoice = await Invoice.findOne({
            _id: req.params.invoice_id,
            academy_id
        })
            .populate('family', 'name phone is_active')
            .populate('items.student_assignment')
            .populate('items.student_subject')
            .populate('items.lessons');

        if (!invoice) {
            return next(createError('invoice not found', 404));
        }

        const monthlyTotals = await getMonthlyInvoiceTotals(
            academy_id,
            invoice.family._id || invoice.family,
            invoice.billing_month
        );

        return res.status(200).json({
            status: http_status_text.SUCCESS,
            data: {
                invoice,
                monthly_summary: monthlyTotals
            }
        });
    }
);


// =====================================================
// Cancel Invoice
// =====================================================

const cancelInvoice = AsyncWrapper(
    async (req, res, next) => {

        const academy_id = getAcademyId(req);

        const invoice = await Invoice.findOne({
            _id: req.params.invoice_id,
            academy_id
        });

        if (!invoice) {
            return next(createError('invoice not found', 404));
        }

        if (invoice.status === 'cancelled') {
            return next(createError('invoice is already cancelled', 400));
        }

        if (Number(invoice.paid_amount) > 0) {
            return next(
                createError('cannot cancel an invoice that has payments', 400)
            );
        }

        invoice.status = 'cancelled';
        invoice.remaining_amount = 0;

        await invoice.save();

        const monthlyTotals = await getMonthlyInvoiceTotals(
            academy_id,
            invoice.family,
            invoice.billing_month
        );

        return res.status(200).json({
            status: http_status_text.SUCCESS,
            data: {
                invoice,
                monthly_summary: monthlyTotals
            }
        });
    }
);


// =====================================================
// Exports
// =====================================================

module.exports = {
    createInvoice,
    getInvoices,
    getMonthlyFamilySummary,
    getSingleInvoice,
    cancelInvoice
};