const mongoose = require('mongoose');
const AsyncWrapper = require('../middleware/AsyncWrapper');
const SupervisorPayroll = require('../models/SupervisorPayroll');
const Academy = require('../models/Academy');
const Expense = require('../models/Expense');
const Supervisor = require('../models/Supervisor');
const User = require('../models/User');
const app_error = require('../utils/AppError');
const http_status_text = require('../utils/HttpStatusText');
const { getAcademyId } = require('../utils/AccessScope');


// =====================================================
// Calculate Supervisor Payroll
// =====================================================

const calculateSupervisorPayroll = AsyncWrapper(
    async (req, res, next) => {

        const academy_id =
            getAcademyId(req);

        const {
            supervisor_id,
            billing_month,
            bonuses = [],
            deductions = [],
            notes
        } = req.body;


        // =====================================================
        // Validate Required Fields
        // =====================================================

        if (
            !supervisor_id ||
            !billing_month
        ) {

            const error =
                new app_error();

            error.create(
                'supervisor_id and billing_month are required',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        // =====================================================
        // Validate Billing Month
        // =====================================================

        if (
            !/^\d{4}-(0[1-9]|1[0-2])$/.test(
                billing_month
            )
        ) {

            const error =
                new app_error();

            error.create(
                'billing_month must be in YYYY-MM format',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        // =====================================================
        // Validate Bonuses
        // =====================================================

        if (!Array.isArray(bonuses)) {

            const error =
                new app_error();

            error.create(
                'bonuses must be an array',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        for (const bonus of bonuses) {

            if (
                bonus.amount === undefined ||
                bonus.amount === null ||
                Number(bonus.amount) < 0
            ) {

                const error =
                    new app_error();

                error.create(
                    'Each bonus must have a valid amount',
                    400,
                    http_status_text.FAIL
                );

                return next(error);
            }


            if (
                !bonus.reason ||
                !String(bonus.reason).trim()
            ) {

                const error =
                    new app_error();

                error.create(
                    'Each bonus must have a reason',
                    400,
                    http_status_text.FAIL
                );

                return next(error);
            }
        }


        // =====================================================
        // Validate Deductions
        // =====================================================

        if (!Array.isArray(deductions)) {

            const error =
                new app_error();

            error.create(
                'deductions must be an array',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        for (const deduction of deductions) {

            if (
                deduction.amount === undefined ||
                deduction.amount === null ||
                Number(deduction.amount) < 0
            ) {

                const error =
                    new app_error();

                error.create(
                    'Each deduction must have a valid amount',
                    400,
                    http_status_text.FAIL
                );

                return next(error);
            }


            if (
                !deduction.reason ||
                !String(deduction.reason).trim()
            ) {

                const error =
                    new app_error();

                error.create(
                    'Each deduction must have a reason',
                    400,
                    http_status_text.FAIL
                );

                return next(error);
            }
        }


        // =====================================================
        // Check Supervisor
        // =====================================================

        const supervisor =
            await Supervisor.findOne({
                _id: supervisor_id,
                academy_id
            });


        if (!supervisor) {

            const error =
                new app_error();

            error.create(
                'Supervisor not found in this academy',
                404,
                http_status_text.FAIL
            );

            return next(error);
        }


        // =====================================================
        // Check Existing Payroll
        // =====================================================

        const existingPayroll =
            await SupervisorPayroll.findOne({
                academy_id,
                supervisor: supervisor_id,
                billing_month
            });


        if (existingPayroll) {

            const error =
                new app_error();

            error.create(
                'Payroll already exists for this supervisor in this billing month',
                409,
                http_status_text.FAIL
            );

            return next(error);
        }


        // =====================================================
        // Base Salary
        // =====================================================

        const baseSalary =
            Number(
                supervisor.base_salary || 0
            );


        // =====================================================
        // Calculate Total Bonuses
        // =====================================================

        let totalBonuses =
            bonuses.reduce(
                (total, bonus) => {

                    return total +
                        Number(
                            bonus.amount || 0
                        );

                },
                0
            );


        // =====================================================
        // Calculate Total Deductions
        // =====================================================

        let totalDeductions =
            deductions.reduce(
                (total, deduction) => {

                    return total +
                        Number(
                            deduction.amount || 0
                        );

                },
                0
            );


        // =====================================================
        // Calculate Net Salary
        // =====================================================

        let netSalary =
            baseSalary +
            totalBonuses -
            totalDeductions;


        // =====================================================
        // Prevent Negative Salary
        // =====================================================

        if (netSalary < 0) {
            netSalary = 0;
        }


        // =====================================================
        // Round Numbers
        // =====================================================

        totalBonuses =
            Math.round(
                totalBonuses * 100
            ) / 100;


        totalDeductions =
            Math.round(
                totalDeductions * 100
            ) / 100;


        netSalary =
            Math.round(
                netSalary * 100
            ) / 100;


        // =====================================================
        // Create Payroll
        // =====================================================

        const academy = await Academy.findById(academy_id).select('currency');
        const currency = academy?.currency || process.env.DEFAULT_CURRENCY || 'EGP';

        const payroll =
            await SupervisorPayroll.create({

                academy_id,

            currency,

                supervisor:
                    supervisor_id,

                billing_month,

                base_salary:
                    baseSalary,

                bonuses,

                total_bonuses:
                    totalBonuses,

                deductions,

                total_deductions:
                    totalDeductions,

                net_salary:
                    netSalary,

                notes

            });


        // =====================================================
        // Response
        // =====================================================

        return res.status(201).json({

            status:
                http_status_text.SUCCESS,

            data: {
                payroll
            }

        });

    }
);

// =====================================================
// 2. إضافة مكافأة (Bonus) لسجل مرتب مشرف
// =====================================================
const addBonusToSupervisorPayroll = AsyncWrapper(async (req, res, next) => {
    const academy_id = getAcademyId(req);
    const { payroll_id } = req.params;
    const { amount, reason } = req.body;

    if (!amount || amount <= 0 || !reason) {
        const error = new app_error();
        error.create('Amount (greater than 0) and reason are required for bonus', 400, http_status_text.FAIL);
        return next(error);
    }

    const payroll = await SupervisorPayroll.findOne({ _id: payroll_id, academy_id });

    if (!payroll) {
        const error = new app_error();
        error.create('Supervisor payroll record not found', 404, http_status_text.FAIL);
        return next(error);
    }

    if (payroll.status === 'paid') {
        const error = new app_error();
        error.create('Cannot modify a payroll that has already been paid', 400, http_status_text.FAIL);
        return next(error);
    }

    payroll.bonuses.push({ amount: Number(amount), reason });
    payroll.total_bonuses = payroll.bonuses.reduce((acc, b) => acc + Number(b.amount), 0);

    let netSalary = payroll.base_salary + payroll.total_bonuses - payroll.total_deductions;
    payroll.net_salary = Math.max(0, Math.round(netSalary * 100) / 100);

    await payroll.save();

    return res.status(200).json({
        status: http_status_text.SUCCESS,
        data: { payroll }
    });
});

// =====================================================
// 3. إضافة خصم (Deduction) لسجل مرتب مشرف
// =====================================================
const addDeductionToSupervisorPayroll = AsyncWrapper(async (req, res, next) => {
    const academy_id = getAcademyId(req);
    const { payroll_id } = req.params;
    const { amount, reason } = req.body;

    if (!amount || amount <= 0 || !reason) {
        const error = new app_error();
        error.create('Amount (greater than 0) and reason are required for deduction', 400, http_status_text.FAIL);
        return next(error);
    }

    const payroll = await SupervisorPayroll.findOne({ _id: payroll_id, academy_id });

    if (!payroll) {
        const error = new app_error();
        error.create('Supervisor payroll record not found', 404, http_status_text.FAIL);
        return next(error);
    }

    if (payroll.status === 'paid') {
        const error = new app_error();
        error.create('Cannot modify a payroll that has already been paid', 400, http_status_text.FAIL);
        return next(error);
    }

    payroll.deductions.push({ amount: Number(amount), reason });
    payroll.total_deductions = payroll.deductions.reduce((acc, d) => acc + Number(d.amount), 0);

    let netSalary = payroll.base_salary + payroll.total_bonuses - payroll.total_deductions;
    payroll.net_salary = Math.max(0, Math.round(netSalary * 100) / 100);

    await payroll.save();

    return res.status(200).json({
        status: http_status_text.SUCCESS,
        data: { payroll }
    });
});

// =====================================================
// 4. تغيير حالة المرتب إلى مدفوع (Paid) وإنشاء سند صرف
// =====================================================
const markPayrollAsPaid = AsyncWrapper(async (req, res, next) => {
    const academy_id = getAcademyId(req);
    const { payroll_id } = req.params;
    const session = await mongoose.startSession();
    let payroll;

    try {
        await session.withTransaction(async () => {
            payroll = await SupervisorPayroll.findOne({ _id: payroll_id, academy_id })
                .session(session)
                .populate('supervisor', 'name');

            if (!payroll) {
                const error = new app_error();
                error.create('Supervisor payroll record not found', 404, http_status_text.FAIL);
                throw error;
            }

            if (payroll.status === 'paid') {
                const error = new app_error();
                error.create('Payroll is already marked as paid', 400, http_status_text.FAIL);
                throw error;
            }

            payroll.status = 'paid';
            payroll.payment_date = new Date();
            await payroll.save({ session });

            const supervisorName = payroll.supervisor?.name || 'Supervisor';
            await Expense.create([{
                academy_id,
                category: 'Salaries',
                title: `Supervisor Salary - ${supervisorName} (${payroll.billing_month})`,
                amount: payroll.net_salary,
                currency: payroll.currency,
                base_amount: payroll.net_salary,
                base_currency: payroll.currency,
                exchange_rate: 1,
                expense_date: payroll.payment_date,
                payment_method: 'cash',
                notes: `Automated expense generated from supervisor payroll ID: ${payroll._id}`
            }], { session });
        });

        return res.status(200).json({
            status: http_status_text.SUCCESS,
            data: { payroll }
        });
    } finally {
        await session.endSession();
    }
});

// =====================================================
// 5. استعلام عن سجلات المرتبات
// =====================================================
const getSupervisorPayrolls = AsyncWrapper(async (req, res, next) => {
    const academy_id = getAcademyId(req);
    const { supervisor_id, billing_month, status } = req.query;

    const filter = { academy_id };
    if (supervisor_id) filter.supervisor = supervisor_id;
    if (billing_month) filter.billing_month = billing_month;
    if (status) filter.status = status;

    const payrolls = await SupervisorPayroll.find(filter)
        .populate({
            path: 'supervisor',
            populate: {
                path: 'user',
                select: 'name phone'
            }
            })
        .sort({ createdAt: -1 });
        
    return res.status(200).json({
        status: http_status_text.SUCCESS,
        data: { payrolls }
    });
});

const updateSupervisorPayrollSalary = AsyncWrapper(
    async (req, res, next) => {

        const academy_id =
            getAcademyId(req);

        const { payroll_id } =
            req.params;

        const { base_salary } =
            req.body;


        if (
            base_salary === undefined ||
            base_salary === null
        ) {
            const error =
                new app_error();

            error.create(
                'base_salary is required',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        const salary =
            Number(base_salary);


        if (
            !Number.isFinite(salary) ||
            salary < 0
        ) {
            const error =
                new app_error();

            error.create(
                'base_salary must be a valid number greater than or equal to 0',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        const payroll =
            await SupervisorPayroll.findOne({
                _id: payroll_id,
                academy_id
            });


        if (!payroll) {
            const error =
                new app_error();

            error.create(
                'Supervisor payroll record not found',
                404,
                http_status_text.FAIL
            );

            return next(error);
        }


        if (payroll.status === 'paid') {
            const error =
                new app_error();

            error.create(
                'Cannot modify a payroll that has already been paid',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        if (payroll.status === 'cancelled') {
            const error =
                new app_error();

            error.create(
                'Cannot modify a cancelled payroll',
                400,
                http_status_text.FAIL
            );

            return next(error);
        }


        payroll.base_salary =
            Math.round(salary * 100) / 100;


        payroll.net_salary =
            Math.max(
                0,
                Math.round(
                    (
                        payroll.base_salary +
                        Number(payroll.total_bonuses || 0) -
                        Number(payroll.total_deductions || 0)
                    ) * 100
                ) / 100
            );


        await payroll.save();


        return res.status(200).json({

            status:
                http_status_text.SUCCESS,

            data: {
                payroll
            }

        });

    }
);


module.exports = {
    calculateSupervisorPayroll,
    addBonusToSupervisorPayroll,
    addDeductionToSupervisorPayroll,
    markPayrollAsPaid,
    getSupervisorPayrolls,
    updateSupervisorPayrollSalary
};