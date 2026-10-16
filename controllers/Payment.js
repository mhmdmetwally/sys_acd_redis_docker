const mongoose =
    require('mongoose');

const AsyncWrapper =
    require('../middleware/AsyncWrapper');

const Payment =
    require('../models/Payment');

const Academy =
    require('../models/Academy');

const PaymentAllocation =
    require('../models/PaymentAllocation');

const Invoice =
    require('../models/Invoice');

const app_error =
    require('../utils/AppError');

const http_status_text =
    require('../utils/HttpStatusText');

const {
    getAcademyId
} =
    require('../utils/AccessScope');

const {
    isValidBillingMonth
} =
    require('../utils/Billing');

const {
    normalizeCurrency,
    getExchangeRate
} = require('../utils/Currency');


// =====================================================
// Helper: Create Error
// =====================================================

const createError = (
    message,
    statusCode
) => {

    const error =
        new app_error();

    error.create(
        message,
        statusCode,
        http_status_text.FAIL
    );

    return error;
};


// =====================================================
// Helper: Round Money
// =====================================================

const roundMoney = (
    value
) => {

    return Number(
        Number(value).toFixed(2)
    );

};


// =====================================================
// Helper: Update Invoice Status
// =====================================================

const updateInvoiceStatus = (
    invoice
) => {

    if (
        invoice.status ===
        'cancelled'
    ) {

        return;

    }


    invoice.paid_amount =
        Math.max(
            0,
            roundMoney(
                invoice.paid_amount
            )
        );


    invoice.remaining_amount =
        Math.max(
            0,
            roundMoney(
                Number(
                    invoice.total_amount
                ) -
                Number(
                    invoice.paid_amount
                )
            )
        );


    if (
        invoice.remaining_amount === 0
    ) {

        invoice.status =
            'paid';

    }

    else if (
        invoice.paid_amount > 0
    ) {

        invoice.status =
            'partially_paid';

    }

    else {

        invoice.status =
            'unpaid';

    }

};


// =====================================================
// Helper: Monthly Invoice Summary
// =====================================================

const getMonthlyInvoiceSummary =
    async (
        academy_id,
        family,
        billing_month
    ) => {

        const result =
            await Invoice.aggregate([

                {
                    $match: {

                        academy_id,

                        family,

                        billing_month,

                        status: {
                            $ne:
                                'cancelled'
                        }

                    }
                },

                {
                    $group: {

                        _id: null,

                        invoice_count: {
                            $sum: 1
                        },

                        subtotal_amount: {
                            $sum:
                                '$subtotal_amount'
                        },

                        discount_amount: {
                            $sum:
                                '$discount_amount'
                        },

                        total_amount: {
                            $sum:
                                '$total_amount'
                        },

                        paid_amount: {
                            $sum:
                                '$paid_amount'
                        },

                        remaining_amount: {
                            $sum:
                                '$remaining_amount'
                        }

                    }

                }

            ]);


        if (!result.length) {

            return {

                invoice_count:
                    0,

                subtotal_amount:
                    0,

                discount_amount:
                    0,

                total_amount:
                    0,

                paid_amount:
                    0,

                remaining_amount:
                    0

            };

        }


        return {

            invoice_count:
                result[0].invoice_count,

            subtotal_amount:
                roundMoney(
                    result[0].subtotal_amount
                ),

            discount_amount:
                roundMoney(
                    result[0].discount_amount
                ),

            total_amount:
                roundMoney(
                    result[0].total_amount
                ),

            paid_amount:
                roundMoney(
                    result[0].paid_amount
                ),

            remaining_amount:
                roundMoney(
                    result[0].remaining_amount
                )

        };

    };


// =====================================================
// Create Payment
// =====================================================

const createPayment =
    AsyncWrapper(

        async (req, res, next) => {

            const session =
                await mongoose.startSession();


            try {

                await session.withTransaction(
                    async () => {

                        const academy_id =
                            getAcademyId(req);

                        const academy = await Academy.findById(academy_id)
                            .select('currency')
                            .session(session);
                        const baseCurrency = normalizeCurrency(academy?.currency);


                        const {
                            family,
                            invoice,
                            amount,
                            currency,
                            type,
                            method,
                            payment_date,
                            reference,
                            notes
                        } =
                            req.body;


                        // =========================================
                        // Family
                        // =========================================

                        if (!family) {

                            throw createError(
                                'family is required',
                                400
                            );

                        }


                        // =========================================
                        // Amount
                        // =========================================

                        if (
                            amount ===
                            undefined ||
                            amount ===
                            null
                        ) {

                            throw createError(
                                'amount is required',
                                400
                            );

                        }


                        const paymentAmount =
                            Number(amount);


                        if (
                            !Number.isFinite(
                                paymentAmount
                            ) ||
                            paymentAmount <= 0
                        ) {

                            throw createError(
                                'amount must be greater than 0',
                                400
                            );

                        }


                        // =========================================
                        // Type
                        // =========================================

                        if (!type) {

                            throw createError(
                                'type is required',
                                400
                            );

                        }


                        if (
                            ![
                                'invoice_payment',
                                'advance'
                            ].includes(type)
                        ) {

                            throw createError(
                                'invalid payment type',
                                400
                            );

                        }


                        // =========================================
                        // Invoice Payment
                        // =========================================

                        if (
                            type ===
                            'invoice_payment'
                        ) {

                            if (!invoice) {

                                throw createError(
                                    'invoice is required for invoice_payment',
                                    400
                                );

                            }


                            const invoiceDoc =
                                await Invoice.findOne({

                                    _id:
                                        invoice,

                                    academy_id,

                                    family

                                }).session(
                                    session
                                );


                            if (!invoiceDoc) {

                                throw createError(
                                    'invoice not found',
                                    404
                                );

                            }


                            if (
                                invoiceDoc.status ===
                                'cancelled'
                            ) {

                                throw createError(
                                    'cannot pay a cancelled invoice',
                                    400
                                );

                            }

                            const paymentCurrency = normalizeCurrency(
                                currency,
                                invoiceDoc.currency || baseCurrency
                            );
                            const invoiceCurrency = normalizeCurrency(
                                invoiceDoc.currency,
                                baseCurrency
                            );
                            const exchangeRate = await getExchangeRate(
                                paymentCurrency,
                                baseCurrency
                            );
                            const invoiceExchangeRate = await getExchangeRate(
                                paymentCurrency,
                                invoiceCurrency
                            );
                            const invoiceAmount = roundMoney(
                                paymentAmount * invoiceExchangeRate
                            );


                            const remaining =
                                Number(
                                    invoiceDoc.remaining_amount
                                );


                            if (
                                invoiceAmount >
                                remaining
                            ) {

                                throw createError(
                                    `payment amount cannot exceed invoice remaining amount (${remaining})`,
                                    400
                                );

                            }


                            // =====================================
                            // Create Payment
                            // =====================================

                            const payment =
                                new Payment({

                                    academy_id,

                                    family,

                                    invoice:
                                        invoiceDoc._id,

                                    amount:
                                        paymentAmount,

                                    currency:
                                        paymentCurrency,

                                    base_amount:
                                        roundMoney(paymentAmount * exchangeRate),

                                    base_currency:
                                        baseCurrency,

                                    exchange_rate:
                                        exchangeRate,

                                    remaining_amount:
                                        0,

                                    type:
                                        'invoice_payment',

                                    method:
                                        method ||
                                        'cash',

                                    payment_date:
                                        payment_date ||
                                        Date.now(),

                                    reference,

                                    notes

                                });


                            await payment.save({
                                session
                            });


                            // =====================================
                            // Allocation
                            // =====================================

                            const allocation =
                                new PaymentAllocation({

                                    payment:
                                        payment._id,

                                    invoice:
                                        invoiceDoc._id,

                                    amount:
                                        invoiceAmount,

                                    currency:
                                        invoiceCurrency,

                                    exchange_rate:
                                        invoiceExchangeRate

                                });


                            await allocation.save({
                                session
                            });


                            // =====================================
                            // Update Invoice
                            // =====================================

                            invoiceDoc.paid_amount =
                                roundMoney(
                                    Number(
                                        invoiceDoc.paid_amount
                                    ) +
                                    invoiceAmount
                                );


                            updateInvoiceStatus(
                                invoiceDoc
                            );


                            await invoiceDoc.save({
                                session
                            });


                            req.paymentResult = {

                                payment,

                                allocation,

                                invoice:
                                    invoiceDoc

                            };

                        }


                        // =========================================
                        // Advance
                        // =========================================

                        else {

                            if (invoice) {

                                throw createError(
                                    'advance payment cannot have an invoice',
                                    400
                                );

                            }

                            const paymentCurrency = normalizeCurrency(
                                currency,
                                baseCurrency
                            );
                            const exchangeRate = await getExchangeRate(
                                paymentCurrency,
                                baseCurrency
                            );


                            const payment =
                                new Payment({

                                    academy_id,

                                    family,

                                    invoice:
                                        null,

                                    amount:
                                        paymentAmount,

                                    currency:
                                        paymentCurrency,

                                    base_amount:
                                        roundMoney(paymentAmount * exchangeRate),

                                    base_currency:
                                        baseCurrency,

                                    exchange_rate:
                                        exchangeRate,

                                    remaining_amount:
                                        paymentAmount,

                                    type:
                                        'advance',

                                    method:
                                        method ||
                                        'cash',

                                    payment_date:
                                        payment_date ||
                                        Date.now(),

                                    reference,

                                    notes

                                });


                            await payment.save({
                                session
                            });


                            req.paymentResult = {

                                payment

                            };

                        }

                    }
                );


                return res.status(201).json({

                    status:
                        http_status_text.SUCCESS,

                    data:
                        req.paymentResult

                });

            }

            finally {

                await session.endSession();

            }

        }

    );


// =====================================================
// Get Payments
// =====================================================

const getPayments =
    AsyncWrapper(

        async (req, res, next) => {

            const academy_id =
                getAcademyId(req);


            const filter = {

                academy_id

            };


            if (
                req.query.family
            ) {

                filter.family =
                    req.query.family;

            }


            if (
                req.query.invoice
            ) {

                filter.invoice =
                    req.query.invoice;

            }


            if (
                req.query.type
            ) {

                filter.type =
                    req.query.type;

            }


            if (
                req.query.status
            ) {

                filter.status =
                    req.query.status;

            }


            const payments =
                await Payment.find(
                    filter
                )

                    .populate(
                        'family',
                        'name phone'
                    )

                    .populate(
                        'invoice'
                    )

                    .sort({

                        payment_date:
                            -1

                    });


            // =============================================
            // Total Payments
            // =============================================

            const totalPaid =
                payments.reduce(

                    (
                        total,
                        payment
                    ) => {

                        if (
                            payment.status ===
                            'completed'
                        ) {

                            return (
                                total +
                                Number(
                                    payment.amount
                                )
                            );

                        }

                        return total;

                    },

                    0

                );


            return res.status(200).json({

                status:
                    http_status_text.SUCCESS,

                data: {

                    payments,

                    total_paid:
                        roundMoney(
                            totalPaid
                        )

                }

            });

        }

    );


// =====================================================
// Get Monthly Family Payments
//
// GET:
//
// /payment/monthly?family=XXX&billing_month=2026-08
//
// Returns:
//
// invoices total
// payments total
// remaining total
// =====================================================

const getMonthlyFamilyPayments =
    AsyncWrapper(

        async (req, res, next) => {

            const academy_id =
                getAcademyId(req);


            const {
                family,
                billing_month
            } =
                req.query;


            if (
                !family ||
                !billing_month
            ) {

                return next(
                    createError(
                        'family and billing_month are required',
                        400
                    )
                );

            }


            if (
                !isValidBillingMonth(
                    billing_month
                )
            ) {

                return next(
                    createError(
                        'billing_month must be in YYYY-MM format',
                        400
                    )
                );

            }


            // =============================================
            // Get Invoices
            // =============================================

            const invoices =
                await Invoice.find({

                    academy_id,

                    family,

                    billing_month,

                    status: {
                        $ne:
                            'cancelled'
                    }

                });


            const invoiceIds =
                invoices.map(
                    invoice =>
                        invoice._id
                );


            // =============================================
            // Get Allocations
            // =============================================

            const allocations =
                await PaymentAllocation.find({

                    invoice: {
                        $in:
                            invoiceIds
                    }

                });


            const totalPaid =
                allocations.reduce(

                    (
                        total,
                        allocation
                    ) => {

                        return (
                            total +
                            Number(
                                allocation.amount
                            )
                        );

                    },

                    0

                );


            // =============================================
            // Monthly Summary
            // =============================================

            const invoiceSummary =
                await getMonthlyInvoiceSummary(
                    academy_id,
                    family,
                    billing_month
                );


            return res.status(200).json({

                status:
                    http_status_text.SUCCESS,

                data: {

                    billing_month,

                    invoice_summary:
                        invoiceSummary,

                    payments: {

                        total_paid:
                            roundMoney(
                                totalPaid
                            )

                    }

                }

            });

        }

    );


// =====================================================
// Get Single Payment
// =====================================================

const getSinglePayment =
    AsyncWrapper(

        async (req, res, next) => {

            const academy_id =
                getAcademyId(req);


            const payment =
                await Payment.findOne({

                    _id:
                        req.params.payment_id,

                    academy_id

                })

                    .populate(
                        'family',
                        'name phone'
                    )

                    .populate(
                        'invoice'
                    );


            if (!payment) {

                return next(
                    createError(
                        'payment not found',
                        404
                    )
                );

            }


            const allocations =
                await PaymentAllocation.find({

                    payment:
                        payment._id

                })

                    .populate(
                        'invoice'
                    );


            return res.status(200).json({

                status:
                    http_status_text.SUCCESS,

                data: {

                    payment,

                    allocations

                }

            });

        }

    );


// =====================================================
// Get Invoice Payments
// =====================================================

const getInvoicePayments =
    AsyncWrapper(

        async (req, res, next) => {

            const academy_id =
                getAcademyId(req);


            const invoice =
                await Invoice.findOne({

                    _id:
                        req.params.invoice_id,

                    academy_id

                });


            if (!invoice) {

                return next(
                    createError(
                        'invoice not found',
                        404
                    )
                );

            }


            const allocations =
                await PaymentAllocation.find({

                    invoice:
                        invoice._id

                })

                    .populate({

                        path:
                            'payment',

                        populate: {

                            path:
                                'family',

                            select:
                                'name phone'

                        }

                    })

                    .sort({

                        createdAt:
                            -1

                    });


            return res.status(200).json({

                status:
                    http_status_text.SUCCESS,

                data: {

                    invoice,

                    allocations

                }

            });

        }

    );


// =====================================================
// Allocate Advance Payment
// =====================================================

const allocateAdvancePayment =
    AsyncWrapper(

        async (req, res, next) => {

            const session =
                await mongoose.startSession();


            try {

                await session.withTransaction(
                    async () => {

                        const academy_id =
                            getAcademyId(req);


                        const {
                            invoice,
                            amount
                        } =
                            req.body;


                        if (!invoice) {

                            throw createError(
                                'invoice is required',
                                400
                            );

                        }


                        if (
                            amount ===
                            undefined ||
                            amount ===
                            null
                        ) {

                            throw createError(
                                'amount is required',
                                400
                            );

                        }


                        const allocationAmount =
                            Number(amount);


                        if (
                            !Number.isFinite(
                                allocationAmount
                            ) ||
                            allocationAmount <= 0
                        ) {

                            throw createError(
                                'amount must be greater than 0',
                                400
                            );

                        }


                        // =========================================
                        // Payment
                        // =========================================

                        const payment =
                            await Payment.findOne({

                                _id:
                                    req.params.payment_id,

                                academy_id,

                                type:
                                    'advance',

                                status:
                                    'completed'

                            }).session(
                                session
                            );


                        if (!payment) {

                            throw createError(
                                'advance payment not found',
                                404
                            );

                        }


                        // =========================================
                        // Payment Balance
                        // =========================================

                        if (
                            allocationAmount >
                            payment.remaining_amount
                        ) {

                            throw createError(
                                'allocation amount exceeds payment remaining amount',
                                400
                            );

                        }


                        // =========================================
                        // Invoice
                        // =========================================

                        const invoiceDoc =
                            await Invoice.findOne({

                                _id:
                                    invoice,

                                academy_id,

                                family:
                                    payment.family

                            }).session(
                                session
                            );


                        if (!invoiceDoc) {

                            throw createError(
                                'invoice not found or does not belong to this family',
                                404
                            );

                        }


                        if (
                            invoiceDoc.status ===
                            'cancelled'
                        ) {

                            throw createError(
                                'cannot allocate payment to a cancelled invoice',
                                400
                            );

                        }

                        const paymentCurrency = normalizeCurrency(
                            payment.currency,
                            payment.base_currency
                        );
                        const invoiceCurrency = normalizeCurrency(
                            invoiceDoc.currency,
                            payment.base_currency
                        );
                        const invoiceExchangeRate = await getExchangeRate(
                            paymentCurrency,
                            invoiceCurrency
                        );
                        const invoiceAllocationAmount = roundMoney(
                            allocationAmount * invoiceExchangeRate
                        );


                        // =========================================
                        // Invoice Balance
                        // =========================================

                        if (
                            invoiceAllocationAmount >
                            invoiceDoc.remaining_amount
                        ) {

                            throw createError(
                                'allocation amount exceeds invoice remaining amount',
                                400
                            );

                        }


                        // =========================================
                        // Existing Allocation
                        // =========================================

                        let allocation =
                            await PaymentAllocation.findOne({

                                payment:
                                    payment._id,

                                invoice:
                                    invoiceDoc._id

                            }).session(
                                session
                            );


                        if (allocation) {

                            allocation.amount =
                                roundMoney(
                                    Number(
                                        allocation.amount
                                    ) +
                                    invoiceAllocationAmount
                                );

                            allocation.currency = invoiceCurrency;
                            allocation.exchange_rate = invoiceExchangeRate;

                        }

                        else {

                            allocation =
                                new PaymentAllocation({

                                    payment:
                                        payment._id,

                                    invoice:
                                        invoiceDoc._id,

                                    amount:
                                        invoiceAllocationAmount,

                                    currency:
                                        invoiceCurrency,

                                    exchange_rate:
                                        invoiceExchangeRate

                                });

                        }


                        await allocation.save({
                            session
                        });


                        // =========================================
                        // Update Payment
                        // =========================================

                        payment.remaining_amount =
                            roundMoney(
                                Number(
                                    payment.remaining_amount
                                ) -
                                    invoiceAllocationAmount
                            );


                        await payment.save({
                            session
                        });


                        // =========================================
                        // Update Invoice
                        // =========================================

                        invoiceDoc.paid_amount =
                            roundMoney(
                                Number(
                                    invoiceDoc.paid_amount
                                ) +
                                allocationAmount
                            );


                        updateInvoiceStatus(
                            invoiceDoc
                        );


                        await invoiceDoc.save({
                            session
                        });


                        req.paymentResult = {

                            payment,

                            allocation,

                            invoice:
                                invoiceDoc

                        };

                    }
                );


                return res.status(200).json({

                    status:
                        http_status_text.SUCCESS,

                    data:
                        req.paymentResult

                });

            }

            finally {

                await session.endSession();

            }

        }

    );


// =====================================================
// Cancel Payment
// =====================================================

const cancelPayment =
    AsyncWrapper(

        async (req, res, next) => {

            const session =
                await mongoose.startSession();


            try {

                await session.withTransaction(
                    async () => {

                        const academy_id =
                            getAcademyId(req);


                        const payment =
                            await Payment.findOne({

                                _id:
                                    req.params.payment_id,

                                academy_id

                            }).session(
                                session
                            );


                        if (!payment) {

                            throw createError(
                                'payment not found',
                                404
                            );

                        }


                        if (
                            payment.status ===
                            'cancelled'
                        ) {

                            throw createError(
                                'payment is already cancelled',
                                400
                            );

                        }


                        // =========================================
                        // Allocations
                        // =========================================

                        const allocations =
                            await PaymentAllocation.find({

                                payment:
                                    payment._id

                            }).session(
                                session
                            );


                        // =========================================
                        // Reverse Allocations
                        // =========================================

                        for (
                            const allocation
                            of allocations
                        ) {

                            const invoice =
                                await Invoice.findOne({

                                    _id:
                                        allocation.invoice,

                                    academy_id

                                }).session(
                                    session
                                );


                            if (!invoice) {

                                throw createError(
                                    'invoice related to payment was not found',
                                    404
                                );

                            }


                            invoice.paid_amount =
                                Math.max(

                                    0,

                                    roundMoney(

                                        Number(
                                            invoice.paid_amount
                                        ) -
                                        Number(
                                            allocation.amount
                                        )

                                    )

                                );


                            updateInvoiceStatus(
                                invoice
                            );


                            await invoice.save({
                                session
                            });

                        }


                        // =========================================
                        // Delete Allocations
                        // =========================================

                        await PaymentAllocation.deleteMany({

                            payment:
                                payment._id

                        }).session(
                            session
                        );


                        // =========================================
                        // Cancel Payment
                        // =========================================

                        payment.status =
                            'cancelled';


                        payment.remaining_amount =
                            0;


                        await payment.save({
                            session
                        });


                        req.paymentResult = {

                            payment

                        };

                    }
                );


                return res.status(200).json({

                    status:
                        http_status_text.SUCCESS,

                    data:
                        req.paymentResult

                });

            }

            finally {

                await session.endSession();

            }

        }

    );


// =====================================================
// Exports
// =====================================================

module.exports = {

    createPayment,

    getPayments,

    getMonthlyFamilyPayments,

    getSinglePayment,

    getInvoicePayments,

    allocateAdvancePayment,

    cancelPayment

};