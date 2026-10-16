const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const TeacherPayroll = require('../models/TeacherPayroll');
const Invoice = require('../models/Invoice');
const SupervisorPayroll = require('../models/SupervisorPayroll');
const {
    convertAmount,
    convertGroupedAmounts
} = require('./Currency');

// =====================================================
// Helper: Format Billing Month Safely (YYYY-MM)
// =====================================================
const formatBillingMonth = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

// =====================================================
// Calculate Growth Percentage
// =====================================================
const calculateGrowth = (currentAmount, previousAmount) => {
    if (previousAmount === 0) {
        return currentAmount > 0 ? 100 : 0;
    }
    const growth = ((currentAmount - previousAmount) / previousAmount) * 100;
    return Number(growth.toFixed(2));
};

// =====================================================
// Get and Validate Report Period Dates
// =====================================================
const getReportPeriod = (queryParams) => {
    const { startDate, endDate } = queryParams;

    if (!startDate || !endDate) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start, end };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return { error: 'Invalid date format' };
    }

    return { start, end };
};

// =====================================================
// Get Previous Period Dates
// =====================================================
const getPreviousPeriod = (start, end) => {
    const duration = end.getTime() - start.getTime();
    const previousEnd = new Date(start.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - duration);

    return {
        start: previousStart,
        end: previousEnd
    };
};

// =====================================================
// Fetch Financial Aggregation Data from MongoDB
// =====================================================
const getFinancialData = async (
    academyId,
    start,
    end,
    displayCurrency,
    defaultCurrency = process.env.DEFAULT_CURRENCY || 'EGP'
) => {
    const academyObjectId = new mongoose.Types.ObjectId(academyId);
    const startDate = new Date(start);
    const endDate = new Date(end);

    const startBillingMonth = formatBillingMonth(startDate);
    const endBillingMonth = formatBillingMonth(endDate);

    // 1. Total Revenue Aggregation
    const revenueAgg = await Payment.aggregate([
        {
            $match: {
                academy_id: academyObjectId,
                status: 'completed',
                payment_date: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: { $ifNull: ['$base_currency', defaultCurrency] },
                totalRevenue: {
                    $sum: { $ifNull: ['$base_amount', '$amount'] }
                },
                count: { $sum: 1 },
                invoicedPaidAmount: {
                    $sum: {
                        $cond: [
                            { $eq: ['$type', 'invoice_payment'] },
                            { $ifNull: ['$base_amount', '$amount'] },
                            0
                        ]
                    }
                }
            }
        }
    ]);

    // 2. Total Expenses & Categories Aggregation
    const expensesAgg = await Expense.aggregate([
        {
            $match: {
                academy_id: academyObjectId,
                status: 'completed',
                expense_date: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $facet: {
                total: [
                    {
                        $group: {
                            _id: { $ifNull: ['$base_currency', defaultCurrency] },
                            totalExpenses: {
                                $sum: { $ifNull: ['$base_amount', '$amount'] }
                            },
                            count: { $sum: 1 }
                        }
                    }
                ],
                byCategory: [
                    {
                        $group: {
                            _id: {
                                category: '$category',
                                currency: { $ifNull: ['$base_currency', defaultCurrency] }
                            },
                            amount: {
                                $sum: { $ifNull: ['$base_amount', '$amount'] }
                            },
                            count: { $sum: 1 }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            category: '$_id.category',
                            currency: '$_id.currency',
                            amount: 1,
                            count: 1
                        }
                    }
                ]
            }
        }
    ]);

    // 3. Teacher Payroll Aggregation
    const teacherPayrollAgg = await TeacherPayroll.aggregate([
        {
            $match: {
                academy_id: academyObjectId,
                billing_month: { $gte: startBillingMonth, $lte: endBillingMonth }
            }
        },
        {
            $group: {
                _id: { $ifNull: ['$currency', defaultCurrency] },
                total: { $sum: '$total_amount' },
                paid: { $sum: '$paid_amount' },
                remaining: { $sum: '$remaining_amount' },
                pending: {
                    $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                },
                partially_paid: {
                    $sum: { $cond: [{ $eq: ['$status', 'partially_paid'] }, 1, 0] }
                },
                paid_payrolls: {
                    $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
                },
                cancelled: {
                    $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                },
                count: { $sum: 1 }
            }
        }
    ]);

    // 4. Invoices Aggregation
    const invoicesAgg = await Invoice.aggregate([
        {
            $match: {
                academy_id: academyObjectId,
                status: { $ne: 'cancelled' },
                invoice_date: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: { $ifNull: ['$currency', defaultCurrency] },
                count: { $sum: 1 },
                totalAmount: { $sum: '$total_amount' },
                remainingAmount: { $sum: '$remaining_amount' }
            }
        }
    ]);

    // 5. Supervisor Payroll Aggregation
    const supervisorPayrollAgg = await SupervisorPayroll.aggregate([
        {
            $match: {
                academy_id: academyObjectId,
                billing_month: { $gte: startBillingMonth, $lte: endBillingMonth }
            }
        },
        {
            $group: {
                _id: { $ifNull: ['$currency', defaultCurrency] },
                total: { $sum: '$net_salary' },
                paid: {
                    $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$net_salary', 0] }
                },
                remaining: {
                    $sum: { $cond: [{ $ne: ['$status', 'paid'] }, '$net_salary', 0] }
                },
                draft: {
                    $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] }
                },
                approved: {
                    $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
                },
                paid_payrolls: {
                    $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
                },
                cancelled: {
                    $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
                },
                count: { $sum: 1 }
            }
        }
    ]);

    // Convert each currency group before combining amounts.
    const revenueTotals = await convertGroupedAmounts(
        revenueAgg,
        displayCurrency,
        ['totalRevenue', 'invoicedPaidAmount']
    );
    const revenue = revenueTotals.totalRevenue;
    const invoicedPaidAmount = revenueTotals.invoicedPaidAmount;
    const paymentCount = revenueAgg.reduce((sum, item) => sum + item.count, 0);

    const expenseGroups = expensesAgg[0]?.total || [];
    const expenseTotals = await convertGroupedAmounts(
        expenseGroups,
        displayCurrency,
        ['totalExpenses']
    );
    const expenses = expenseTotals.totalExpenses;
    const expenseCount = expenseGroups.reduce((sum, item) => sum + item.count, 0);

    const categoryGroups = expensesAgg[0]?.byCategory || [];
    const convertedCategories = await Promise.all(categoryGroups.map(async (item) => ({
        category: item.category,
        amount: await convertAmount(item.amount, item.currency, displayCurrency),
        count: item.count
    })));
    const categoryTotals = new Map();
    for (const item of convertedCategories) {
        const total = categoryTotals.get(item.category) || { amount: 0, count: 0 };
        total.amount = Number((total.amount + item.amount).toFixed(2));
        total.count += item.count;
        categoryTotals.set(item.category, total);
    }
    const expensesByCategory = Array.from(categoryTotals, ([category, totals]) => ({
        category,
        ...totals
    }));

    const netProfit = revenue - expenses;
    const profitMargin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(2) : '0.00';

    const teacherAmounts = await convertGroupedAmounts(
        teacherPayrollAgg,
        displayCurrency,
        ['total', 'paid', 'remaining']
    );
    const teacherData = teacherPayrollAgg.reduce((totals, item) => {
        for (const field of ['pending', 'partially_paid', 'paid_payrolls', 'cancelled', 'count']) {
            totals[field] += item[field] || 0;
        }
        return totals;
    }, { pending: 0, partially_paid: 0, paid_payrolls: 0, cancelled: 0, count: 0 });
    const teacherPayroll = {
        total: teacherAmounts.total,
        paid: teacherAmounts.paid,
        remaining: teacherAmounts.remaining,
        pending: teacherData.pending || 0,
        partially_paid: teacherData.partially_paid || 0,
        paid_payrolls: teacherData.paid_payrolls || 0,
        cancelled: teacherData.cancelled || 0,
        count: teacherData.count || 0
    };

    const supervisorAmounts = await convertGroupedAmounts(
        supervisorPayrollAgg,
        displayCurrency,
        ['total', 'paid', 'remaining']
    );
    const supervisorData = supervisorPayrollAgg.reduce((totals, item) => {
        for (const field of ['draft', 'approved', 'paid_payrolls', 'cancelled', 'count']) {
            totals[field] += item[field] || 0;
        }
        return totals;
    }, { draft: 0, approved: 0, paid_payrolls: 0, cancelled: 0, count: 0 });
    const supervisorPayroll = {
        total: supervisorAmounts.total,
        paid: supervisorAmounts.paid,
        remaining: supervisorAmounts.remaining,
        draft: supervisorData.draft || 0,
        approved: supervisorData.approved || 0,
        paid_payrolls: supervisorData.paid_payrolls || 0,
        cancelled: supervisorData.cancelled || 0,
        count: supervisorData.count || 0
    };

    const invoiceAmounts = await convertGroupedAmounts(
        invoicesAgg,
        displayCurrency,
        ['totalAmount', 'remainingAmount']
    );
    const invoiceCount = invoicesAgg.reduce((sum, item) => sum + item.count, 0);
    const invoicedAmount = invoiceAmounts.totalAmount;
    const invoicedRemainingAmount = invoiceAmounts.remainingAmount;

    return {
        revenue,
        currency: displayCurrency,
        expenses,
        net_profit: netProfit,
        profit_margin: profitMargin,
        payment_count: paymentCount,
        expense_count: expenseCount,
        invoice_count: invoiceCount,
        invoiced_amount: invoicedAmount,
        invoiced_paid_amount: invoicedPaidAmount,
        invoiced_remaining_amount: invoicedRemainingAmount,
        teacher_payroll: teacherPayroll,
        supervisor_payroll: supervisorPayroll,
        expenses_by_category: expensesByCategory
    };
};

module.exports = {
    getReportPeriod,
    getPreviousPeriod,
    getFinancialData,
    calculateGrowth
};