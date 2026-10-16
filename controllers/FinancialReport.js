const AsyncWrapper = require('../middleware/AsyncWrapper');
const app_error = require('../utils/AppError');
const http_status_text = require('../utils/HttpStatusText');
const { getAcademyId } = require('../utils/AccessScope');
const Academy = require('../models/Academy');
const { normalizeCurrency } = require('../utils/Currency');

const {
    getReportPeriod,
    getPreviousPeriod,
    getFinancialData,
    calculateGrowth
} = require('../utils/financialHelpers');

const getFinancialReport = AsyncWrapper(async (req, res, next) => {
    const academy_id = getAcademyId(req);

    if (!academy_id) {
        const error = new app_error();
        error.create('Academy ID is required', 400, http_status_text.FAIL);
        return next(error);
    }

    const academy = await Academy.findById(academy_id).select('currency');
    const defaultCurrency = normalizeCurrency(academy?.currency);
    let displayCurrency;

    try {
        displayCurrency = normalizeCurrency(req.query.currency, defaultCurrency);
    } catch (error) {
        return next(error);
    }

    // Period
    const period = getReportPeriod(req.query);
    if (period.error) {
        const error = new app_error();
        error.create(period.error, 400, http_status_text.FAIL);
        return next(error);
    }

    const { start, end } = period;
    const previousPeriod = getPreviousPeriod(start, end);

    // Current & Previous Financial Data
    const current = await getFinancialData(
        academy_id,
        start,
        end,
        displayCurrency,
        defaultCurrency
    );
    const previous = await getFinancialData(
        academy_id,
        previousPeriod.start,
        previousPeriod.end,
        displayCurrency,
        defaultCurrency
    );

    // Growth Percentage Calculations
    const revenueGrowth = calculateGrowth(current.revenue, previous.revenue);
    const expenseGrowth = calculateGrowth(current.expenses, previous.expenses);
    const profitGrowth = calculateGrowth(current.net_profit, previous.net_profit);

    // Response
    return res.status(200).json({
        status: http_status_text.SUCCESS,
        data: {
            currency: displayCurrency,
            period: {
                from: start,
                to: end
            },
            previous_period: {
                from: previousPeriod.start,
                to: previousPeriod.end
            },
            current: {
                revenue: current.revenue,
                expenses: current.expenses,
                net_profit: current.net_profit,
                profit_margin: current.profit_margin,
                payment_count: current.payment_count,
                expense_count: current.expense_count,
                invoice_count: current.invoice_count,
                invoiced_amount: current.invoiced_amount,
                invoiced_paid_amount: current.invoiced_paid_amount,
                invoiced_remaining_amount: current.invoiced_remaining_amount,
                teacher_payroll: current.teacher_payroll,
                expenses_by_category: current.expenses_by_category
            },
            previous: {
                revenue: previous.revenue,
                expenses: previous.expenses,
                net_profit: previous.net_profit,
                teacher_payroll: previous.teacher_payroll
            },
            growth: {
                revenue: revenueGrowth,
                expenses: expenseGrowth,
                net_profit: profitGrowth
            }
        }
    });
});

module.exports = {
    getFinancialReport
};