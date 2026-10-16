const mongoose = require('mongoose');

const AsyncWrapper =
    require('../middleware/AsyncWrapper');

const TeacherPayroll =
    require('../models/TeacherPayroll');

const Academy =
    require('../models/Academy');

const TeacherAssignment = 
    require('../models/TeacherAssignment');

const Supervisor = 
    require('../models/Supervisor');
    
const Lesson =
    require('../models/Lesson');

const Expense =
    require('../models/Expense');

const app_error =
    require('../utils/AppError');

const http_status_text =
    require('../utils/HttpStatusText');

const user_role =
    require('../utils/UserRole');
    
const {
    getAcademyId,
    getTeacherAssignmentForUser,
    getSupervisor
} = require('../utils/AccessScope');



// =====================================================
// Helpers
// =====================================================

const isValidBillingMonth = (month) => {

    return /^\d{4}-(0[1-9]|1[0-2])$/.test(
        month
    );

};


const getMonthDateRange = (
    billing_month
) => {

    const [
        year,
        month
    ] =
        billing_month
            .split('-')
            .map(Number);

    const from =
        new Date(
            Date.UTC(
                year,
                month - 1,
                1,
                0,
                0,
                0,
                0
            )
        );

    const to =
        new Date(
            Date.UTC(
                year,
                month,
                0,
                23,
                59,
                59,
                999
            )
        );

    return {
        from,
        to
    };

};


const roundMoney = (value) => {

    return Math.round(
        (Number(value) + Number.EPSILON) * 100
    ) / 100;

};


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
// Generate Payroll
// =====================================================

const generatePayroll =
    AsyncWrapper(
        async (
            req,
            res,
            next
        ) => {

            const academy_id =
                getAcademyId(req);

            const {
                teacher_assignment_id,
                billing_month,
                notes
            } =
                req.body;


            if (
                !teacher_assignment_id ||
                !billing_month
            ) {

                return next(
                    createError(
                        'teacher_assignment_id and billing_month are required',
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


            const teacherAssignment =
                await getTeacherAssignmentForUser(
                    req,
                    teacher_assignment_id
                );


            if (!teacherAssignment) {

                return next(
                    createError(
                        'teacher assignment not found or you cannot access it',
                        404
                    )
                );

            }


            if (
                String(
                    teacherAssignment.academy_id
                ) !==
                String(academy_id)
            ) {

                return next(
                    createError(
                        'teacher does not belong to this academy',
                        403
                    )
                );

            }


            const existingPayroll =
                await TeacherPayroll.findOne({

                    academy_id,

                    teacher_assignment:
                        teacher_assignment_id,

                    billing_month

                });


            if (existingPayroll) {

                return next(
                    createError(
                        'payroll already exists for this teacher and month',
                        409
                    )
                );

            }


            const {
                from,
                to
            } =
                getMonthDateRange(
                    billing_month
                );


            const lessons =
                await Lesson.find({

                    academy_id,

                    teacher:
                        teacher_assignment_id,

                    lesson_date: {
                        $gte: from,
                        $lte: to
                    },

                    status:
                        'completed'

                })
                    .sort({
                        lesson_date: 1
                    });


            if (
                lessons.length === 0
            ) {

                return next(
                    createError(
                        'cannot generate payroll because this teacher has no completed lessons in this month',
                        400
                    )
                );

            }


            const pricePerLesson =
                Number(
                    teacherAssignment.price_per_lesson
                );


            if (
                Number.isNaN(
                    pricePerLesson
                ) ||
                pricePerLesson < 0
            ) {

                return next(
                    createError(
                        'teacher price per lesson is invalid',
                        400
                    )
                );

            }


            const lessonSnapshots = [];

            let totalUnits = 0;

            let baseAmount = 0;


            for (
                const lesson
                of lessons
            ) {

                const lessonUnits =
                    Number(
                        lesson.duration_minutes
                    ) / 60;


                const lessonAmount =
                    roundMoney(
                        lessonUnits *
                        pricePerLesson
                    );


                totalUnits +=
                    lessonUnits;


                baseAmount +=
                    lessonAmount;


                lessonSnapshots.push({

                    lesson:
                        lesson._id,

                    lesson_date:
                        lesson.lesson_date,

                    duration_minutes:
                        lesson.duration_minutes,

                    lesson_units:
                        Number(
                            lessonUnits.toFixed(4)
                        ),

                    price_per_lesson:
                        pricePerLesson,

                    amount:
                        lessonAmount

                });

            }


            totalUnits =
                Number(
                    totalUnits.toFixed(4)
                );


            baseAmount =
                roundMoney(
                    baseAmount
                );


            try {

                const academy = await Academy.findById(academy_id).select('currency');
                const currency = academy?.currency || process.env.DEFAULT_CURRENCY || 'EGP';

                const payroll =
                    await TeacherPayroll.create({

                        academy_id,

                        currency,

                        teacher_assignment:
                            teacherAssignment._id,

                        teacher:
                            teacherAssignment.teacher,

                        billing_month,

                        lessons:
                            lessonSnapshots,

                        total_lessons:
                            lessons.length,

                        total_units:
                            totalUnits,

                        price_per_lesson:
                            pricePerLesson,

                        base_amount:
                            baseAmount,

                        discounts:
                            [],

                        discount_amount:
                            0,

                        bonuses:
                            [],

                        bonus_amount:
                            0,

                        total_amount:
                            baseAmount,

                        paid_amount:
                            0,

                        remaining_amount:
                            baseAmount,

                        status:
                            'pending',

                        paid_at:
                            null,

                        generated_at:
                            new Date(),

                        notes

                    });


                return res.status(201).json({

                    status:
                        http_status_text.SUCCESS,

                    data: {
                        payroll
                    }

                });

            } catch (error) {

                if (
                    error &&
                    error.code === 11000
                ) {

                    return next(
                        createError(
                            'payroll already exists for this teacher and month',
                            409
                        )
                    );

                }

                return next(error);

            }

        }
    );


// =====================================================
// Add Discount
// =====================================================

const addDiscount =
    AsyncWrapper(
        async (
            req,
            res,
            next
        ) => {

            const academy_id =
                getAcademyId(req);


            const payroll =
                await TeacherPayroll.findOne({

                    _id:
                        req.params.payroll_id,

                    academy_id

                });


            if (!payroll) {

                return next(
                    createError(
                        'payroll not found',
                        404
                    )
                );

            }


            const teacherAssignment =
                await getTeacherAssignmentForUser(
                    req,
                    payroll.teacher_assignment
                );


            if (!teacherAssignment) {

                return next(
                    createError(
                        'you cannot access this payroll',
                        403
                    )
                );

            }


            if (
                payroll.status ===
                'cancelled'
            ) {

                return next(
                    createError(
                        'cannot add discount to a cancelled payroll',
                        400
                    )
                );

            }


            if (
                Number(
                    payroll.paid_amount
                ) > 0
            ) {

                return next(
                    createError(
                        'cannot add discount after payment has started',
                        400
                    )
                );

            }


            const {
                amount,
                note
            } =
                req.body;


            if (
                amount === undefined ||
                amount === null ||
                !note
            ) {

                return next(
                    createError(
                        'amount and note are required',
                        400
                    )
                );

            }


            const discountAmount =
                Number(amount);


            if (
                !Number.isFinite(
                    discountAmount
                ) ||
                discountAmount <= 0
            ) {

                return next(
                    createError(
                        'discount amount must be greater than 0',
                        400
                    )
                );

            }


            const roundedDiscount =
                roundMoney(
                    discountAmount
                );


            const currentMaxDiscountAllowed =
                roundMoney(
                    Number(payroll.base_amount) +
                    Number(payroll.bonus_amount || 0) -
                    Number(payroll.discount_amount || 0)
                );


            if (
                roundedDiscount > currentMaxDiscountAllowed
            ) {

                return next(
                    createError(
                        'discount cannot be greater than the remaining salary before discount',
                        400
                    )
                );

            }


            payroll.discounts.push({

                amount:
                    roundedDiscount,

                note:
                    String(note).trim(),

                created_at:
                    new Date()

            });


            payroll.discount_amount =
                roundMoney(
                    Number(
                        payroll.discount_amount || 0
                    ) +
                    roundedDiscount
                );


            payroll.total_amount =
                roundMoney(
                    Number(
                        payroll.base_amount
                    ) +
                    Number(
                        payroll.bonus_amount || 0
                    ) -
                    Number(
                        payroll.discount_amount
                    )
                );


            payroll.remaining_amount =
                roundMoney(
                    Number(
                        payroll.total_amount
                    ) -
                    Number(
                        payroll.paid_amount
                    )
                );


            if (
                payroll.remaining_amount <= 0
            ) {

                payroll.remaining_amount =
                    0;

                payroll.status =
                    'paid';

                payroll.paid_at =
                    new Date();

            } else {

                payroll.status =
                    'pending';

                payroll.paid_at =
                    null;

            }


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


// =====================================================
// Add Bonus
// =====================================================

const addBonus =
    AsyncWrapper(
        async (
            req,
            res,
            next
        ) => {

            const academy_id =
                getAcademyId(req);


            const payroll =
                await TeacherPayroll.findOne({

                    _id:
                        req.params.payroll_id,

                    academy_id

                });


            if (!payroll) {

                return next(
                    createError(
                        'payroll not found',
                        404
                    )
                );

            }


            const teacherAssignment =
                await getTeacherAssignmentForUser(
                    req,
                    payroll.teacher_assignment
                );


            if (!teacherAssignment) {

                return next(
                    createError(
                        'you cannot access this payroll',
                        403
                    )
                );

            }


            if (
                payroll.status ===
                'cancelled'
            ) {

                return next(
                    createError(
                        'cannot add bonus to a cancelled payroll',
                        400
                    )
                );

            }


            if (
                Number(
                    payroll.paid_amount
                ) > 0
            ) {

                return next(
                    createError(
                        'cannot add bonus after payment has started',
                        400
                    )
                );

            }


            const {
                amount,
                note
            } =
                req.body;


            if (
                amount === undefined ||
                amount === null ||
                !note
            ) {

                return next(
                    createError(
                        'amount and note are required',
                        400
                    )
                );

            }


            const bonusAmount =
                Number(amount);


            if (
                !Number.isFinite(
                    bonusAmount
                ) ||
                bonusAmount <= 0
            ) {

                return next(
                    createError(
                        'bonus amount must be greater than 0',
                        400
                    )
                );

            }


            const roundedBonus =
                roundMoney(
                    bonusAmount
                );


            payroll.bonuses.push({

                amount:
                    roundedBonus,

                note:
                    String(note).trim(),

                created_at:
                    new Date()

            });


            payroll.bonus_amount =
                roundMoney(
                    Number(
                        payroll.bonus_amount || 0
                    ) +
                    roundedBonus
                );


            payroll.total_amount =
                roundMoney(
                    Number(
                        payroll.base_amount
                    ) +
                    Number(
                        payroll.bonus_amount
                    ) -
                    Number(
                        payroll.discount_amount || 0
                    )
                );


            payroll.remaining_amount =
                roundMoney(
                    Number(
                        payroll.total_amount
                    ) -
                    Number(
                        payroll.paid_amount
                    )
                );


            if (
                payroll.remaining_amount <= 0
            ) {

                payroll.remaining_amount =
                    0;

                payroll.status =
                    'paid';

                payroll.paid_at =
                    new Date();

            } else {

                payroll.status =
                    'pending';

                payroll.paid_at =
                    null;

            }


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


// =====================================================
// Get Payrolls 
// =====================================================
const getPayrolls = AsyncWrapper(async (req, res, next) => {
    const academy_id = getAcademyId(req);

    if (!academy_id) {
        return next(createError('بيانات التوثيق غير مكتملة', 401));
    }

    const filter = { academy_id };

    // 1. فلترة الشهر
    if (req.query.billing_month) {
        if (!isValidBillingMonth(req.query.billing_month)) {
            return next(createError('billing_month must be in YYYY-MM format', 400));
        }
        filter.billing_month = req.query.billing_month;
    }

    // 2. فلترة الحالة
    if (req.query.status) {
        const allowedStatuses = ['pending', 'partially_paid', 'paid', 'cancelled'];
        if (!allowedStatuses.includes(req.query.status)) {
            return next(createError('invalid payroll status', 400));
        }
        filter.status = req.query.status;
    }

    // 3. فلترة نطاق الوصول حسب دور المستخدم (Supervisor vs Admin)
    if (req.user.role === user_role.supervisor) {
        const supervisor = await getSupervisor(req);
        if (!supervisor) {
            return res.status(200).json({
                status: http_status_text.SUCCESS,
                data: { payrolls: [] }
            });
        }

        // جلب جميع تكليفات المعلمين التابعة لهذا المشرف
        const supervisorAssignments = await TeacherAssignment.find({
            supervisor: supervisor._id,
            academy_id
        }).select('_id');

        const assignmentIds = supervisorAssignments.map(a => a._id);
        filter.teacher_assignment = { $in: assignmentIds };
    } else if (req.query.teacher_assignment_id) {
        const teacherAssignment = await getTeacherAssignmentForUser(
            req,
            req.query.teacher_assignment_id
        );

        if (!teacherAssignment) {
            return next(createError('teacher assignment not found or you cannot access it', 404));
        }

        filter.teacher_assignment = req.query.teacher_assignment_id;
    }

    // 4. استعلام واحد مباشر لقاعدة البيانات
    const payrolls = await TeacherPayroll.find(filter)
        .populate('teacher', 'user is_active')
        .populate({
            path: 'teacher_assignment',
            populate: { path: 'teacher' }
        })
        .sort({ billing_month: -1, createdAt: -1 });

    return res.status(200).json({
        status: http_status_text.SUCCESS,
        data: { payrolls }
    });
});
// =====================================================
// Get Single Payroll
// =====================================================

const getSinglePayroll =
    AsyncWrapper(
        async (
            req,
            res,
            next
        ) => {

            const academy_id =
                getAcademyId(req);


            const payroll =
                await TeacherPayroll.findOne({

                    _id:
                        req.params.payroll_id,

                    academy_id

                })
                    .populate(
                        'teacher',
                        'user is_active'
                    )
                    .populate({
                        path:
                            'teacher_assignment',

                        populate: {
                            path:
                                'teacher'
                        }
                    })
                    .populate({
                        path:
                            'lessons.lesson'
                    });


            if (!payroll) {

                return next(
                    createError(
                        'payroll not found',
                        404
                    )
                );

            }


            const teacherAssignmentId =
                payroll.teacher_assignment &&
                payroll.teacher_assignment._id
                    ?
                    payroll.teacher_assignment._id
                    :
                    payroll.teacher_assignment;


            const teacherAssignment =
                await getTeacherAssignmentForUser(
                    req,
                    teacherAssignmentId
                );


            if (!teacherAssignment) {

                return next(
                    createError(
                        'you cannot access this payroll',
                        403
                    )
                );

            }


            return res.status(200).json({

                status:
                    http_status_text.SUCCESS,

                data: {
                    payroll
                }

            });

        }
    );


// =====================================================
// Pay Payroll
// =====================================================

const payPayroll =
    AsyncWrapper(
        async (
            req,
            res,
            next
        ) => {

            const academy_id =
                getAcademyId(req);


            const {
                amount,
                payment_method,
                reference,
                notes
            } =
                req.body;


            if (
                amount === undefined ||
                amount === null
            ) {

                return next(
                    createError(
                        'amount is required',
                        400
                    )
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

                return next(
                    createError(
                        'amount must be greater than 0',
                        400
                    )
                );

            }


            const roundedPaymentAmount =
                roundMoney(
                    paymentAmount
                );


            const allowedPaymentMethods = [
                'cash',
                'bank_transfer',
                'wallet',
                'card',
                'other'
            ];


            const finalPaymentMethod =
                payment_method ||
                'cash';


            if (
                !allowedPaymentMethods.includes(
                    finalPaymentMethod
                )
            ) {

                return next(
                    createError(
                        'invalid payment_method',
                        400
                    )
                );

            }


            const session =
                await mongoose.startSession();


            try {

                session.startTransaction();


                const payroll =
                    await TeacherPayroll.findOne({

                        _id:
                            req.params.payroll_id,

                        academy_id

                    }).session(session);


                if (!payroll) {

                    await session.abortTransaction();

                    return next(
                        createError(
                            'payroll not found',
                            404
                        )
                    );

                }


                const teacherAssignment =
                    await getTeacherAssignmentForUser(
                        req,
                        payroll.teacher_assignment
                    );


                if (!teacherAssignment) {

                    await session.abortTransaction();

                    return next(
                        createError(
                            'you cannot access this payroll',
                            403
                        )
                    );

                }


                if (
                    payroll.status ===
                    'cancelled'
                ) {

                    await session.abortTransaction();

                    return next(
                        createError(
                            'cannot pay a cancelled payroll',
                            400
                        )
                    );

                }


                if (
                    payroll.remaining_amount <= 0
                ) {

                    await session.abortTransaction();

                    return next(
                        createError(
                            'payroll is already fully paid',
                            400
                        )
                    );

                }


                if (
                    roundedPaymentAmount >
                    payroll.remaining_amount
                ) {

                    await session.abortTransaction();

                    return next(
                        createError(
                            'payment amount cannot be greater than remaining amount',
                            400
                        )
                    );

                }


                payroll.paid_amount =
                    roundMoney(
                        Number(
                            payroll.paid_amount
                        ) +
                        roundedPaymentAmount
                    );


                payroll.remaining_amount =
                    roundMoney(
                        Number(
                            payroll.total_amount
                        ) -
                        Number(
                            payroll.paid_amount
                        )
                    );


                if (
                    payroll.remaining_amount <= 0
                ) {

                    payroll.remaining_amount =
                        0;

                    payroll.status =
                        'paid';

                    payroll.paid_at =
                        new Date();

                } else {

                    payroll.status =
                        'partially_paid';

                }


                const expense =
                    await Expense.create(
                        [
                            {
                                academy_id,

                                payroll:
                                    payroll._id,

                                category:
                                    'teacher_salary',

                                title:
                                    `Teacher Salary - ${payroll.billing_month}`,

                                amount:
                                    roundedPaymentAmount,

                                currency:
                                    payroll.currency,

                                base_amount:
                                    roundedPaymentAmount,

                                base_currency:
                                    payroll.currency,

                                exchange_rate:
                                    1,

                                expense_date:
                                    new Date(),

                                payment_method:
                                    finalPaymentMethod,

                                reference,

                                status:
                                    'completed',

                                notes

                            }
                        ],
                        {
                            session
                        }
                    );


                await payroll.save({
                    session
                });


                await session.commitTransaction();


                return res.status(200).json({

                    status:
                        http_status_text.SUCCESS,

                    data: {

                        payroll,

                        expense:
                            expense[0]

                    }

                });

            } catch (error) {

                await session.abortTransaction();

                return next(error);

            } finally {

                await session.endSession();

            }

        }
    );


// =====================================================
// Cancel Payroll
// =====================================================

const cancelPayroll =
    AsyncWrapper(
        async (
            req,
            res,
            next
        ) => {

            const academy_id =
                getAcademyId(req);


            const payroll =
                await TeacherPayroll.findOne({

                    _id:
                        req.params.payroll_id,

                    academy_id

                });


            if (!payroll) {

                return next(
                    createError(
                        'payroll not found',
                        404
                    )
                );

            }


            const teacherAssignment =
                await getTeacherAssignmentForUser(
                    req,
                    payroll.teacher_assignment
                );


            if (!teacherAssignment) {

                return next(
                    createError(
                        'you cannot access this payroll',
                        403
                    )
                );

            }


            if (
                payroll.status ===
                'cancelled'
            ) {

                return next(
                    createError(
                        'payroll is already cancelled',
                        400
                    )
                );

            }


            if (
                payroll.paid_amount > 0
            ) {

                return next(
                    createError(
                        'cannot cancel a payroll that has payments',
                        400
                    )
                );

            }


            payroll.status =
                'cancelled';


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


// =====================================================
// Module Exports
// =====================================================

module.exports = {

    generatePayroll,

    addDiscount,

    addBonus,

    getPayrolls,

    getSinglePayroll,

    payPayroll,

    cancelPayroll

};