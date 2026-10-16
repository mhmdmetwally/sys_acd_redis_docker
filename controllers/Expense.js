const AsyncWrapper =
    require('../middleware/AsyncWrapper');

const Expense =
    require('../models/Expense');

const Academy =
    require('../models/Academy');

const app_error =
    require('../utils/AppError');

const http_status_text =
    require('../utils/HttpStatusText');

const {
    getAcademyId
} = require('../utils/AccessScope');

const {
    normalizeCurrency,
    getExchangeRate
} = require('../utils/Currency');


// =====================================================
// Create Expense
// =====================================================

const createExpense = AsyncWrapper(

    async (req, res, next) => {

        const academy_id =
            getAcademyId(req);


        const {
            category,
            title,
            amount,
            currency,
            expense_date,
            payment_method,
            reference,
            notes
        } = req.body;


        // =============================================
        // Validation
        // =============================================

        if (
            !category ||
            !title ||
            amount === undefined ||
            amount === null
        ) {

            const error =
                new app_error();

            error.create(
                'category, title and amount are required',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        const expenseAmount =
            Number(amount);


        if (
            !Number.isFinite(expenseAmount) ||
            expenseAmount <= 0
        ) {

            const error =
                new app_error();

            error.create(
                'amount must be greater than 0',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }

        const academy = await Academy.findById(academy_id).select('currency');
        const baseCurrency = normalizeCurrency(academy?.currency);
        let expenseCurrency;

        try {
            expenseCurrency = normalizeCurrency(currency, baseCurrency);
        } catch (error) {
            return next(error);
        }

        const exchangeRate = await getExchangeRate(expenseCurrency, baseCurrency);
        const baseAmount = Number((expenseAmount * exchangeRate).toFixed(2));


        // =============================================
        // Create Expense
        // =============================================

        const expense =
            await Expense.create({

                academy_id,

                category,

                title,

                amount:
                    expenseAmount,

                currency:
                    expenseCurrency,

                base_amount:
                    baseAmount,

                base_currency:
                    baseCurrency,

                exchange_rate:
                    exchangeRate,

                expense_date:
                    expense_date ||
                    Date.now(),

                payment_method:
                    payment_method ||
                    'cash',

                reference,

                notes

            });


        return res.status(201).json({

            status:
                http_status_text.SUCCESS,

            data: {
                expense
            }

        });

    }
);


// =====================================================
// Get Expenses
// =====================================================

const getExpenses = AsyncWrapper(

    async (req, res, next) => {

        const academy_id =
            getAcademyId(req);


        const filter = {
            academy_id
        };


        // =============================================
        // Category Filter
        // =============================================

        if (
            req.query.category
        ) {

            filter.category =
                req.query.category;

        }


        // =============================================
        // Status Filter
        // =============================================

        if (
            req.query.status
        ) {

            filter.status =
                req.query.status;

        }


        // =============================================
        // Date Range
        // =============================================

        if (
            req.query.from ||
            req.query.to
        ) {

            filter.expense_date = {};


            if (
                req.query.from
            ) {

                const from =
                    new Date(
                        `${req.query.from}T00:00:00.000Z`
                    );


                if (
                    Number.isNaN(
                        from.getTime()
                    )
                ) {

                    const error =
                        new app_error();

                    error.create(
                        'invalid from date',
                        400,
                        http_status_text.FAIL
                    );

                    return next(error);
                }


                filter.expense_date.$gte =
                    from;

            }


            if (
                req.query.to
            ) {

                const to =
                    new Date(
                        `${req.query.to}T23:59:59.999Z`
                    );


                if (
                    Number.isNaN(
                        to.getTime()
                    )
                ) {

                    const error =
                        new app_error();

                    error.create(
                        'invalid to date',
                        400,
                        http_status_text.FAIL
                    );

                    return next(error);
                }


                filter.expense_date.$lte =
                    to;

            }

        }


        // =============================================
        // Get Expenses
        // =============================================

        const expenses =
            await Expense.find(filter)
                .sort({
                    expense_date: -1
                });


        return res.status(200).json({

            status:
                http_status_text.SUCCESS,

            data: {
                expenses
            }

        });

    }
);


// =====================================================
// Get Single Expense
// =====================================================

const getSingleExpense = AsyncWrapper(

    async (req, res, next) => {

        const academy_id =
            getAcademyId(req);


        const expense =
            await Expense.findOne({

                _id:
                    req.params.expense_id,

                academy_id

            });


        if (!expense) {

            const error =
                new app_error();

            error.create(
                'expense not found',
                404,
                http_status_text.FAIL
            );

            return next(error);
        }


        return res.status(200).json({

            status:
                http_status_text.SUCCESS,

            data: {
                expense
            }

        });

    }
);


// =====================================================
// Update Expense
// =====================================================

const updateExpense = AsyncWrapper(

    async (req, res, next) => {

        const academy_id =
            getAcademyId(req);


        const expense =
            await Expense.findOne({

                _id:
                    req.params.expense_id,

                academy_id

            });


        if (!expense) {

            const error =
                new app_error();

            error.create(
                'expense not found',
                404,
                http_status_text.FAIL
            );

            return next(error);
        }


        if (
            expense.status ===
            'cancelled'
        ) {

            const error =
                new app_error();

            error.create(
                'cannot update a cancelled expense',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        const allowedFields = [
            'category',
            'title',
            'amount',
            'expense_date',
            'payment_method',
            'reference',
            'notes'
        ];


        for (
            const field
            of allowedFields
        ) {

            if (
                req.body[field] !== undefined
            ) {

                expense[field] =
                    req.body[field];

            }

        }


        if (
            req.body.amount !== undefined
        ) {

            const amount =
                Number(
                    req.body.amount
                );


            if (
                Number.isNaN(amount) ||
                amount <= 0
            ) {

                const error =
                    new app_error();

                error.create(
                    'amount must be greater than 0',
                    400,
                    http_status_text.FAIL
                );

                return next(error);
            }


            expense.amount =
                amount;

        }


        await expense.save();


        return res.status(200).json({

            status:
                http_status_text.SUCCESS,

            data: {
                expense
            }

        });

    }
);


// =====================================================
// Cancel Expense
// =====================================================

const cancelExpense = AsyncWrapper(

    async (req, res, next) => {

        const academy_id =
            getAcademyId(req);


        const expense =
            await Expense.findOne({

                _id:
                    req.params.expense_id,

                academy_id

            });


        if (!expense) {

            const error =
                new app_error();

            error.create(
                'expense not found',
                404,
                http_status_text.FAIL
            );

            return next(error);
        }


        if (
            expense.status ===
            'cancelled'
        ) {

            const error =
                new app_error();

            error.create(
                'expense is already cancelled',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        expense.status =
            'cancelled';


        await expense.save();


        return res.status(200).json({

            status:
                http_status_text.SUCCESS,

            data: {
                expense
            }

        });

    }
);


module.exports = {

    createExpense,

    getExpenses,

    getSingleExpense,

    updateExpense,

    cancelExpense

};