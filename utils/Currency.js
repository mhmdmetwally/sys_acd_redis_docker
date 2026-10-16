const {
    getCachedValue,
    setCachedValue
} = require('./RedisClient');

const RATE_CACHE_SECONDS = 12 * 60 * 60;

const normalizeCurrency = (currency, fallback = process.env.DEFAULT_CURRENCY || 'EGP') => {
    const normalized = String(currency || fallback).trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(normalized)) {
        const error = new Error('currency must be a 3-letter currency code');
        error.status_code = 400;
        throw error;
    }

    return normalized;
};

const getRates = async (baseCurrency) => {
    const cacheKey = `exchange-rates:${baseCurrency}`;
    const cachedRates = await getCachedValue(cacheKey);

    if (cachedRates) {
        try {
            return JSON.parse(cachedRates);
        } catch {
            // Ignore malformed cache entries and refresh from the provider.
        }
    }

    let response;

    try {
        response = await fetch(
            `https://open.er-api.com/v6/latest/${baseCurrency}`,
            { signal: AbortSignal.timeout(10000) }
        );
    } catch {
        const error = new Error('Exchange rates are temporarily unavailable');
        error.status_code = 503;
        throw error;
    }

    if (!response.ok) {
        const error = new Error('Exchange rates are temporarily unavailable');
        error.status_code = 503;
        throw error;
    }

    const payload = await response.json();

    if (payload.result !== 'success' || !payload.rates) {
        const error = new Error('Exchange rates are temporarily unavailable');
        error.status_code = 503;
        throw error;
    }

    await setCachedValue(
        cacheKey,
        JSON.stringify(payload.rates),
        RATE_CACHE_SECONDS
    );

    return payload.rates;
};

const getExchangeRate = async (source, target) => {
    const sourceCurrency = normalizeCurrency(source);
    const targetCurrency = normalizeCurrency(target);

    if (sourceCurrency === targetCurrency) {
        return 1;
    }

    const rates = await getRates(sourceCurrency);
    const rate = Number(rates[targetCurrency]);

    if (!Number.isFinite(rate) || rate <= 0) {
        const error = new Error(
            `Exchange rate is unavailable for ${sourceCurrency} to ${targetCurrency}`
        );
        error.status_code = 400;
        throw error;
    }

    return rate;
};

const convertAmount = async (amount, source, target) => {
    const rate = await getExchangeRate(source, target);
    return Number((Number(amount) * rate).toFixed(2));
};

const convertGroupedAmounts = async (groups, targetCurrency, fields) => {
    const converted = await Promise.all(groups.map(async (group) => {
        const sourceCurrency = normalizeCurrency(group._id);
        const rate = await getExchangeRate(sourceCurrency, targetCurrency);

        return fields.reduce((result, field) => {
            result[field] = Number(group[field] || 0) * rate;
            return result;
        }, {});
    }));

    return fields.reduce((totals, field) => {
        totals[field] = Number(
            converted.reduce((sum, group) => sum + group[field], 0).toFixed(2)
        );
        return totals;
    }, {});
};

module.exports = {
    normalizeCurrency,
    getExchangeRate,
    convertAmount,
    convertGroupedAmounts
};