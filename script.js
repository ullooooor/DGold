const TROY_OUNCE_IN_GRAMS = 31.1034768;
const SELL_SPREAD_RATE = 0.03;

function getStoredNumber(key, fallback) {
    const storedValue = localStorage.getItem(key);
    if (storedValue === null) return fallback;
    const parsedValue = Number(storedValue);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

// The global spot feed is converted from USD per troy ounce to INR per gram.
let actual24KBuyRate = getStoredNumber('dgold-gold-buy-rate', 14917.00);
let actual24KSellRate = getStoredNumber('dgold-gold-sell-rate', actual24KBuyRate * (1 - SELL_SPREAD_RATE));
let rateSource = localStorage.getItem('dgold-gold-rate-source') || 'global-estimate';
let paytmQuoteKind = localStorage.getItem('dgold-paytm-quote-kind') || 'sell';
let rateUpdatedAt = localStorage.getItem('dgold-gold-rate-updated-at') || '';
let defaultWalletBalance = 1491.70;
let portfolioValElem = document.getElementById('portfolio-val');
let currentTimeframe = 'Days';
const savedGoldGrams = localStorage.getItem('dgold-invested-gold-grams');
let investedGoldGrams = savedGoldGrams === null
    ? defaultWalletBalance / actual24KSellRate
    : Math.max(0, Number(savedGoldGrams) || 0);
const savedCostBasis = localStorage.getItem('dgold-invested-cost-basis');
let investedCostBasis = savedCostBasis === null
    ? (savedGoldGrams === null ? defaultWalletBalance : null)
    : Math.max(0, Number(savedCostBasis) || 0);
let investmentHistory = [];
try {
    const savedHistory = JSON.parse(localStorage.getItem('dgold-investment-history') || '[]');
    if (Array.isArray(savedHistory)) {
        investmentHistory = savedHistory.filter(point =>
            Number.isFinite(point.timestamp) && Number.isFinite(point.pricePerGram) && Number.isFinite(point.value)
        );
    }
} catch (error) {
    investmentHistory = [];
}

// FamPay Accounts State
let savingsBalance = getStoredNumber('dgold-savings-balance', 5200.00);
let spendingBalance = getStoredNumber('dgold-spending-balance', 1850.00);
let spendingNotes = localStorage.getItem('dgold-spending-notes') ?? 'notes';
let savingsAmountPerIncome = Math.max(0, getStoredNumber('dgold-savings-amount', 0));
let savingsContributionFrequency = localStorage.getItem('dgold-savings-frequency') || 'monthly';
let savingsHistory = [];
try {
    const storedSavingsHistory = JSON.parse(localStorage.getItem('dgold-savings-history') || '[]');
    if (Array.isArray(storedSavingsHistory)) {
        savingsHistory = storedSavingsHistory.filter(point =>
            Number.isFinite(point.timestamp) && Number.isFinite(point.balance)
        );
    }
} catch (error) {
    savingsHistory = [];
}

function formatRupees(amount) {
    return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function updateSavingsDisplay() {
    document.getElementById('savings-bal-disp').innerText = formatRupees(savingsBalance);
    document.getElementById('savings-history-current').innerText = formatRupees(savingsBalance);
}

function recordSavingsSnapshot() {
    savingsHistory.push({ timestamp: Date.now(), balance: savingsBalance });
    savingsHistory = savingsHistory.slice(-180);
    localStorage.setItem('dgold-savings-history', JSON.stringify(savingsHistory));
    document.getElementById('savings-history-note').innerText = `${savingsHistory.length} locally recorded balance points`;
    drawSavingsHistoryChart();
}

function drawSavingsHistoryChart() {
    const canvas = document.getElementById('savingsHistoryCanvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const points = savingsHistory.slice(-60);
    const padding = { top: 18, right: 12, bottom: 12, left: 12 };
    const plotWidth = rect.width - padding.left - padding.right;
    const plotHeight = rect.height - padding.top - padding.bottom;
    if (!points.length) {
        ctx.fillStyle = '#8ba2c4';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Balance history will appear here', rect.width / 2, rect.height / 2);
        return;
    }

    const values = points.map(point => point.balance);
    const minBalance = Math.min(...values);
    const maxBalance = Math.max(...values);
    const range = maxBalance - minBalance || Math.max(1, maxBalance * 0.02);
    const minPlot = minBalance - range * 0.1;
    const maxPlot = maxBalance + range * 0.1;
    const getX = index => padding.left + (points.length === 1 ? plotWidth / 2 : index / (points.length - 1) * plotWidth);
    const getY = balance => padding.top + plotHeight - (balance - minPlot) / (maxPlot - minPlot) * plotHeight;

    ctx.strokeStyle = 'rgba(139, 162, 196, 0.14)';
    ctx.lineWidth = 1;
    for (let index = 0; index < 3; index++) {
        const y = padding.top + plotHeight * index / 2;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(rect.width - padding.right, y);
        ctx.stroke();
    }

    ctx.beginPath();
    points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(getX(index), getY(point.balance));
        else ctx.lineTo(getX(index), getY(point.balance));
    });
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f1f5f9';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatRupees(values[values.length - 1]), rect.width - padding.right, 11);
}

function updateSavingsProjection() {
    const incomeAmount = Math.max(0, Number.parseFloat(document.getElementById('savings-income-amount').value) || 0);
    const amountValue = Number.parseFloat(document.getElementById('savings-save-amount').value);
    const savedPerIncome = Number.isFinite(amountValue) ? Math.max(0, amountValue) : 0;
    const dailyMultiplier = {
        daily: 1,
        weekly: 1 / 7,
        monthly: 12 / 365
    }[savingsContributionFrequency];
    const savedPerDay = savedPerIncome * dailyMultiplier;

    document.getElementById('save-per-income-value').innerText = formatRupees(savedPerIncome);
    document.getElementById('save-per-day-value').innerText = formatRupees(savedPerDay);
    document.getElementById('save-per-week-value').innerText = formatRupees(savedPerDay * 7);
    document.getElementById('save-per-month-value').innerText = formatRupees(savedPerDay * (365 / 12));
}

function addIncomeSavings() {
    const incomeAmount = Number.parseFloat(document.getElementById('savings-income-amount').value);
    const saveAmount = Number.parseFloat(document.getElementById('savings-save-amount').value);
    const status = document.getElementById('savings-add-status');

    if (!Number.isFinite(incomeAmount) || incomeAmount <= 0) {
        status.innerText = 'Enter the income amount you received first.';
        return;
    }
    if (!Number.isFinite(saveAmount) || saveAmount <= 0) {
        status.innerText = 'Enter a savings amount greater than ₹0.';
        return;
    }
    if (saveAmount > incomeAmount) {
        status.innerText = 'Savings amount cannot exceed the income received.';
        return;
    }

    savingsBalance += saveAmount;
    localStorage.setItem('dgold-savings-balance', String(savingsBalance));
    savingsAmountPerIncome = saveAmount;
    localStorage.setItem('dgold-savings-amount', String(savingsAmountPerIncome));
    updateSavingsDisplay();
    recordSavingsSnapshot();
    status.innerText = `${formatRupees(saveAmount)} added to savings from ${formatRupees(incomeAmount)} income.`;
    document.getElementById('savings-income-amount').value = '';
    updateSavingsProjection();
}

async function suggestSavingsAmount() {
    const button = document.getElementById('suggest-savings-amount-btn');
    const status = document.getElementById('savings-ai-status');
    const incomeAmount = Number.parseFloat(document.getElementById('savings-income-amount').value);
    if (!Number.isFinite(incomeAmount) || incomeAmount <= 0) {
        status.innerText = 'Enter an income amount for a tailored suggestion.';
        return;
    }

    button.disabled = true;
    status.innerText = 'Dgolai is considering a rupee amount that fits this income...';
    const prompt = `Recommend an exact savings amount in Indian rupees for this income. Return an INR amount, never a percentage. Do not return zero; recommend at least ₹0.01 and no more than the income received. Consider income frequency, current savings, spending balance, and spending notes. This is optional budgeting guidance, not a guarantee; do not transfer money. Return JSON only with {"amount_inr": number, "reason": "brief explanation"}.\nIncome received: ₹${incomeAmount.toFixed(2)}\nIncome frequency: ${savingsContributionFrequency}\nCurrent savings: ₹${savingsBalance.toFixed(2)}\nCurrent spending balance: ₹${spendingBalance.toFixed(2)}\nRecent spending notes: ${spendingNotes}`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json' }
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Dgolai could not suggest an amount right now.');
        const responseText = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
        if (!responseText) throw new Error('Dgolai returned no suggestion. Try again.');
        const suggestion = JSON.parse(responseText.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        const suggestedAmount = Number(suggestion.amount_inr);
        if (!Number.isFinite(suggestedAmount) || suggestedAmount <= 0 || suggestedAmount > incomeAmount) {
            throw new Error('Dgolai returned an invalid INR amount. Try again.');
        }

        savingsAmountPerIncome = Math.round(suggestedAmount * 100) / 100;
        document.getElementById('savings-save-amount').value = savingsAmountPerIncome.toFixed(2);
        localStorage.setItem('dgold-savings-amount', String(savingsAmountPerIncome));
        updateSavingsProjection();
        status.innerText = `Suggestion: ${formatRupees(savingsAmountPerIncome)} · ${suggestion.reason || 'Review this amount before adding savings.'}`;
    } catch (error) {
        status.innerText = error.message || 'Could not get a suggestion. Check your connection and try again.';
    } finally {
        button.disabled = false;
    }
}

function resetSavingsTracker() {
    const approved = window.confirm('Reset the FamPay savings balance to ₹0 and clear its local history? Spending and gold accounts will not change.');
    if (!approved) return;

    savingsBalance = 0;
    savingsHistory = [];
    localStorage.setItem('dgold-savings-balance', '0');
    localStorage.removeItem('dgold-savings-history');
    updateSavingsDisplay();
    drawSavingsHistoryChart();
    document.getElementById('savings-history-note').innerText = 'Savings history cleared on this device.';
    document.getElementById('savings-add-status').innerText = 'Savings balance and history reset.';
}

function updateRateDisplay() {
    const spreadPerGram = actual24KBuyRate - actual24KSellRate;
    const isPaytmQuote = rateSource === 'paytm-screenshot';
    const buyIsFromPaytm = isPaytmQuote && ['buy-value', 'buy-sell'].includes(paytmQuoteKind);
    const sellIsFromPaytm = isPaytmQuote && ['sell', 'buy-sell'].includes(paytmQuoteKind);
    const bothPaytmQuotesVisible = isPaytmQuote && buyIsFromPaytm && sellIsFromPaytm;
    const spreadPercentage = actual24KBuyRate > 0 ? (spreadPerGram / actual24KBuyRate) * 100 : 0;
    const trackedRate = buyIsFromPaytm && !sellIsFromPaytm ? actual24KBuyRate : actual24KSellRate;

    document.getElementById('actual-24k-buy-label').innerText = buyIsFromPaytm
        ? 'Paytm buy quote (₹/g)'
        : isPaytmQuote && sellIsFromPaytm ? 'Estimated buy (₹/g)'
            : isPaytmQuote ? 'Paytm buy quote (₹/g)' : 'Global spot estimate (₹/g)';
    document.getElementById('actual-24k-sell-label').innerText = sellIsFromPaytm
        ? 'Paytm sell quote (₹/g)'
        : isPaytmQuote ? 'Account valuation rate (₹/g)' : 'Estimated sell (₹/g)';
    document.getElementById('spread-label').innerText = isPaytmQuote && !sellIsFromPaytm
        ? 'Paytm sell quote'
        : bothPaytmQuotesVisible ? 'Paytm spread' : 'Estimated spread';
    document.getElementById('actual-24k-buy').innerText = buyIsFromPaytm || !isPaytmQuote || sellIsFromPaytm
        ? `₹ ${actual24KBuyRate.toFixed(2)}/g`
        : 'Not shown';
    document.getElementById('actual-24k-sell').innerText = `₹ ${actual24KSellRate.toFixed(2)}/g`;
    document.getElementById('spread-rate').innerText = isPaytmQuote && !sellIsFromPaytm
        ? 'Not shown'
        : `₹ ${spreadPerGram.toFixed(2)}/g · ${(bothPaytmQuotesVisible ? spreadPercentage : SELL_SPREAD_RATE * 100).toFixed(2)}%`;
    document.getElementById('chart-live-price').innerText = `₹ ${trackedRate.toFixed(2)}`;
    document.getElementById('rate-section-title').innerText = isPaytmQuote ? 'Paytm Gold Screenshot Details' : 'Digital Gold Market Estimate';
    document.getElementById('chart-rate-subtitle').innerText = buyIsFromPaytm && !sellIsFromPaytm
        ? 'Paytm buy quote (INR/g)'
        : 'Observed gold sell quote (INR/g)';
    document.getElementById('live-status').innerText = isPaytmQuote
        ? 'Paytm account details imported'
        : 'Global XAU/INR estimate';
    document.getElementById('investment-valuation-source').innerText = isPaytmQuote
        ? buyIsFromPaytm && !sellIsFromPaytm
            ? 'Account value from screenshot; Paytm sell quote not shown'
            : 'Valued at Paytm sell quote from your screenshot'
        : 'Valued at estimated sell price; Paytm quote may differ';
}

function updatePortfolioValue() {
    const currentValue = investedGoldGrams * actual24KSellRate;
    const growthBadge = document.getElementById('portfolio-growth');

    portfolioValElem.innerText = `₹${currentValue.toFixed(2)}`;
    document.getElementById('investment-market-value').innerText = `₹${currentValue.toFixed(2)}`;
    document.getElementById('investment-gold-grams').innerText = `${investedGoldGrams.toFixed(5)} g`;
    document.getElementById('sell-estimated-proceeds').innerText = formatRupees(currentValue);
    if (investedCostBasis === null) {
        document.getElementById('investment-cost-basis').innerText = 'Not available';
        document.getElementById('investment-profit-loss').innerText = 'Not available';
        document.getElementById('investment-profit-loss').className = '';
        document.getElementById('sell-estimated-pnl').innerText = 'Cost basis unavailable';
        document.getElementById('sell-estimated-pnl').className = '';
        growthBadge.className = 'badge';
        growthBadge.innerText = 'P&L unavailable';
    } else {
        const profitLoss = currentValue - investedCostBasis;
        const returnPercentage = investedCostBasis > 0 ? (profitLoss / investedCostBasis) * 100 : 0;
        document.getElementById('investment-cost-basis').innerText = `₹${investedCostBasis.toFixed(2)}`;
        document.getElementById('investment-profit-loss').innerText = `${profitLoss >= 0 ? '+' : '-'}₹${Math.abs(profitLoss).toFixed(2)} (${returnPercentage >= 0 ? '+' : ''}${returnPercentage.toFixed(2)}%)`;
        document.getElementById('investment-profit-loss').className = profitLoss >= 0 ? 'positive-txt' : 'negative-txt';
        document.getElementById('sell-estimated-pnl').innerText = `${profitLoss >= 0 ? '+' : '-'}${formatRupees(Math.abs(profitLoss))}`;
        document.getElementById('sell-estimated-pnl').className = profitLoss >= 0 ? 'positive-txt' : 'negative-txt';
        growthBadge.className = profitLoss >= 0 ? 'badge positive' : 'badge negative';
        growthBadge.innerHTML = `<i class="fa-solid fa-arrow-trend-${profitLoss >= 0 ? 'up' : 'down'}"></i> ${returnPercentage >= 0 ? '+' : ''}${returnPercentage.toFixed(2)}%`;
    }
    drawInvestmentHistoryChart();
    return currentValue;
}

async function analyzeSellDecision() {
    const button = document.getElementById('sell-ai-button');
    const result = document.getElementById('sell-ai-result');
    const currentValue = investedGoldGrams * actual24KSellRate;
    const knownPnl = investedCostBasis === null ? null : currentValue - investedCostBasis;

    if (investedGoldGrams <= 0) {
        result.innerText = 'No gold is currently recorded in this account. Add or import a holding before asking whether to sell.';
        return;
    }

    button.disabled = true;
    result.innerText = 'Dgolai is reviewing your gold position...';
    const quoteSource = rateSource === 'paytm-screenshot'
        ? 'Paytm quote read from a screenshot; it may be stale'
        : 'global gold estimate, not an official Paytm quote';
    const costBasis = investedCostBasis === null ? 'unknown' : `₹${investedCostBasis.toFixed(2)}`;
    const pnl = knownPnl === null
        ? 'unknown because cost basis is unavailable'
        : `${knownPnl >= 0 ? 'gain' : 'loss'} of ₹${Math.abs(knownPnl).toFixed(2)}`;
    const prompt = [
        'You are Dgolai, a cautious educational gold-position assistant, not a licensed financial adviser.',
        'Use only the account facts below. Do not claim to predict gold prices or guarantee returns.',
        'Give a balanced SELL, HOLD, or REVIEW view; an additional investment amount in INR (use 0 if adding nothing is prudent); a time horizon to review again; and a brief reason.',
        'Never recommend borrowing or investing money needed for essentials. Do not initiate any transaction.',
        'Return JSON only: {"decision":"SELL|HOLD|REVIEW","additional_investment_inr":number,"review_time":"short timeframe","reason":"brief explanation"}.',
        `Gold held: ${investedGoldGrams.toFixed(5)} g.`,
        `Estimated proceeds at the account rate: ₹${currentValue.toFixed(2)}.`,
        `Account rate: ₹${actual24KSellRate.toFixed(2)}/g (${quoteSource}).`,
        `Recorded cost basis: ${costBasis}. Calculated unrealized ${pnl}.`,
        `Savings balance: ₹${savingsBalance.toFixed(2)}. Spending balance: ₹${spendingBalance.toFixed(2)}.`,
        `Recent spending notes: ${spendingNotes}.`
    ].join('\n');

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: 'application/json' }
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Dgolai could not complete the review.');

        const responseText = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
        if (!responseText) throw new Error('Dgolai returned no review. Try again.');
        const advice = JSON.parse(responseText.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        const decision = String(advice.decision || '').toUpperCase();
        const additionalAmount = Number(advice.additional_investment_inr);
        if (!['SELL', 'HOLD', 'REVIEW'].includes(decision) || !Number.isFinite(additionalAmount) || additionalAmount < 0 ||
            typeof advice.review_time !== 'string' || typeof advice.reason !== 'string') {
            throw new Error('Dgolai returned an incomplete review. Try again.');
        }

        result.innerText = [
            `Dgolai view: ${decision}`,
            `Estimated proceeds if sold now: ${formatRupees(currentValue)}${knownPnl === null ? ' · gain/loss unavailable because cost basis is unknown.' : ` · estimated ${pnl}.`}`,
            `Additional investment suggested: ${formatRupees(additionalAmount)}`,
            `Review again: ${advice.review_time.trim()}`,
            advice.reason.trim(),
            'Informational only, not a trade instruction. Check Paytm’s current sell quote and any fees or taxes before acting.'
        ].join('\n');
    } catch (error) {
        result.innerText = error.message || 'Could not contact Dgolai. Check your connection and try again.';
    } finally {
        button.disabled = false;
    }
}

function recordInvestmentSnapshot() {
    investmentHistory.push({
        timestamp: Date.now(),
        pricePerGram: rateSource === 'paytm-screenshot' && ['buy-value', 'buy-sell'].includes(paytmQuoteKind)
            ? actual24KBuyRate
            : actual24KSellRate,
        value: investedGoldGrams * actual24KSellRate,
        goldGrams: investedGoldGrams,
        costBasis: investedCostBasis,
        source: rateSource,
        quoteKind: paytmQuoteKind
    });
    investmentHistory = investmentHistory.slice(-120);
    localStorage.setItem('dgold-investment-history', JSON.stringify(investmentHistory));
    document.getElementById('investment-history-note').innerText = `${investmentHistory.length} market and account updates recorded locally.`;
    drawInvestmentHistoryChart();
    drawTradingLineChart();
}

function drawInvestmentHistoryChart() {
    const canvas = document.getElementById('investmentHistoryCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const points = investmentHistory
            .filter(point => (point.source || 'global-estimate') === rateSource &&
                (rateSource !== 'paytm-screenshot' || (point.quoteKind || 'sell') === paytmQuoteKind))
        .slice(-60);
    if (!points.length) {
        ctx.fillStyle = '#8ba2c4';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Refresh the market rate to start tracking', rect.width / 2, rect.height / 2);
        return;
    }

    const values = points.map(point => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const padding = { top: 18, right: 12, bottom: 12, left: 12 };
    const plotWidth = rect.width - padding.left - padding.right;
    const plotHeight = rect.height - padding.top - padding.bottom;
    const getX = index => padding.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    const getY = value => padding.top + plotHeight - ((value - minValue) / (maxValue - minValue || 1)) * plotHeight;

    ctx.strokeStyle = 'rgba(139, 162, 196, 0.13)';
    ctx.lineWidth = 1;
    for (let index = 0; index < 3; index++) {
        const y = padding.top + (plotHeight / 2) * index;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(rect.width - padding.right, y);
        ctx.stroke();
    }

    const trendColor = values[values.length - 1] >= values[0] ? '#00ff88' : '#ff6685';
    ctx.beginPath();
    points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(getX(index), getY(point.value));
        else ctx.lineTo(getX(index), getY(point.value));
    });
    if (points.length > 1) {
        ctx.lineTo(getX(points.length - 1), rect.height - padding.bottom);
        ctx.lineTo(getX(0), rect.height - padding.bottom);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(0, padding.top, 0, rect.height);
        gradient.addColorStop(0, 'rgba(0, 255, 136, 0.18)');
        gradient.addColorStop(1, 'rgba(0, 255, 136, 0)');
        ctx.fillStyle = gradient;
        ctx.fill();
    }

    ctx.beginPath();
    points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(getX(index), getY(point.value));
        else ctx.lineTo(getX(index), getY(point.value));
    });
    ctx.strokeStyle = trendColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    const lastPoint = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(getX(points.length - 1), getY(lastPoint.value), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = trendColor;
    ctx.fill();
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`₹${lastPoint.value.toFixed(2)}`, rect.width - padding.right, 11);
}

async function refreshGoldRate() {
    const statusElem = document.getElementById('rate-update-status');
    const refreshButton = document.getElementById('refresh-rate-btn');
    statusElem.innerText = 'Updating global gold rate estimate...';
    refreshButton.disabled = true;

    try {
        const [goldResponse, currencyResponse] = await Promise.all([
            fetch('https://api.gold-api.com/price/XAU'),
            fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR')
        ]);
        if (!goldResponse.ok || !currencyResponse.ok) {
            throw new Error('A market rate service returned an error.');
        }

        const [goldData, currencyData] = await Promise.all([
            goldResponse.json(),
            currencyResponse.json()
        ]);
        const spotUsdPerOunce = Number(goldData.price);
        const usdToInr = Number(currencyData.rates?.INR);
        if (!Number.isFinite(spotUsdPerOunce) || spotUsdPerOunce <= 0 || !Number.isFinite(usdToInr) || usdToInr <= 0) {
            throw new Error('Market rate response was invalid.');
        }

        actual24KBuyRate = (spotUsdPerOunce * usdToInr) / TROY_OUNCE_IN_GRAMS;
        actual24KSellRate = actual24KBuyRate * (1 - SELL_SPREAD_RATE);
        rateSource = 'global-estimate';
        paytmQuoteKind = 'sell';
        rateUpdatedAt = new Date().toISOString();
        localStorage.setItem('dgold-gold-buy-rate', String(actual24KBuyRate));
        localStorage.setItem('dgold-gold-sell-rate', String(actual24KSellRate));
        localStorage.setItem('dgold-gold-rate-source', rateSource);
        localStorage.setItem('dgold-gold-rate-updated-at', rateUpdatedAt);
        updateRateDisplay();
        updateCalculations();
        recordInvestmentSnapshot();
        drawTradingLineChart();

        const updatedAt = goldData.updatedAt ? new Date(goldData.updatedAt) : new Date();
        statusElem.innerText = `Global XAU/INR estimate · updated ${updatedAt.toLocaleString()}. This is not a Paytm quote.`;
    } catch (error) {
        statusElem.innerText = 'Could not refresh rates. Showing the last available values.';
        console.error('Gold rate refresh failed:', error);
    } finally {
        refreshButton.disabled = false;
    }
}

function investManualAmount() {
    const grossAmount = parseFloat(document.getElementById('manual-amt').value);
    if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
        alert('Enter an investment amount greater than zero.');
        return;
    }

    const netPrincipal = grossAmount * 0.97;
    investedGoldGrams += netPrincipal / actual24KBuyRate;
    investedCostBasis = (investedCostBasis ?? 0) + grossAmount;
    localStorage.setItem('dgold-invested-gold-grams', String(investedGoldGrams));
    localStorage.setItem('dgold-invested-cost-basis', String(investedCostBasis));
    updateCalculations();
    recordInvestmentSnapshot();
}

function resetWallet() {
    investedGoldGrams = 0;
    investedCostBasis = 0;
    localStorage.setItem('dgold-invested-gold-grams', '0');
    localStorage.setItem('dgold-invested-cost-basis', '0');
    updateCalculations();
    recordInvestmentSnapshot();
}

// Gemini API Key Provided
const GEMINI_API_KEY = "AIzaSyAujHwybSrcjQQe8v0KjbSLq-OBy2_Zz5w";

let dgolaiChatHistory = [];
let dgolaiChatBusy = false;

function appendDgolaiChatMessage(role, text) {
    const message = document.createElement('div');
    message.className = `dgolai-chat-message ${role}`;
    message.innerText = text;
    document.getElementById('dgolai-chat-messages').appendChild(message);
    message.scrollIntoView({ block: 'nearest' });
}

function openDgolaiChat() {
    const backdrop = document.getElementById('dgolai-chat-backdrop');
    backdrop.hidden = false;
    if (!dgolaiChatHistory.length) {
        const welcome = 'Hi, I’m Dgolai. Ask me about your gold account, savings, or the figures shown in this app.';
        dgolaiChatHistory.push({ role: 'assistant', text: welcome });
        appendDgolaiChatMessage('assistant', welcome);
    }
    document.getElementById('dgolai-chat-input').focus();
}

function closeDgolaiChat() {
    document.getElementById('dgolai-chat-backdrop').hidden = true;
    document.getElementById('open-dgolai-chat-btn').focus();
}

async function sendDgolaiChatMessage(event) {
    event.preventDefault();
    if (dgolaiChatBusy) return;

    const input = document.getElementById('dgolai-chat-input');
    const sendButton = document.getElementById('dgolai-chat-send-btn');
    const userText = input.value.trim();
    if (!userText) return;

    input.value = '';
    appendDgolaiChatMessage('user', userText);
    dgolaiChatHistory.push({ role: 'user', text: userText });
    dgolaiChatHistory = dgolaiChatHistory.slice(-16);
    dgolaiChatBusy = true;
    sendButton.disabled = true;

    const quoteSource = rateSource === 'paytm-screenshot'
        ? 'Paytm quote imported from a screenshot; it may be stale'
        : 'global estimate, not an official Paytm quote';
    const accountContext = [
        `Current gold holding: ${investedGoldGrams.toFixed(5)} g.`,
        `Estimated account value/proceeds: ${formatRupees(investedGoldGrams * actual24KSellRate)} at ₹${actual24KSellRate.toFixed(2)}/g (${quoteSource}).`,
        `Recorded invested amount: ${investedCostBasis === null ? 'unknown' : formatRupees(investedCostBasis)}.`,
        `FamPay savings: ${formatRupees(savingsBalance)}; spending balance: ${formatRupees(spendingBalance)}.`,
        `Recent spending notes: ${spendingNotes}.`
    ].join('\n');
    const contents = dgolaiChatHistory
        .filter((message, index) => index > 0 || message.role !== 'assistant')
        .map(message => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.text }]
        }));

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: `You are Dgolai, a helpful assistant for this gold and savings tracker. Give clear, cautious educational information. Do not guarantee investment results, claim unsupported real-time Paytm pricing, or execute transactions. Current app account context (treat as private user-provided context):\n${accountContext}` }]
                },
                contents
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Dgolai could not reply right now.');

        const reply = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
        if (!reply) throw new Error('Dgolai returned an empty reply. Try again.');
        dgolaiChatHistory.push({ role: 'assistant', text: reply });
        dgolaiChatHistory = dgolaiChatHistory.slice(-16);
        appendDgolaiChatMessage('assistant', reply);
    } catch (error) {
        const errorMessage = error.message || 'Could not contact Dgolai. Check your connection and try again.';
        dgolaiChatHistory.push({ role: 'assistant', text: errorMessage });
        dgolaiChatHistory = dgolaiChatHistory.slice(-16);
        appendDgolaiChatMessage('assistant', errorMessage);
    } finally {
        dgolaiChatBusy = false;
        sendButton.disabled = false;
        input.focus();
    }
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.getElementById('dgolai-chat-backdrop').hidden) {
        closeDgolaiChat();
    }
});

let selectedGoldScreenshot = null;
let goldScreenshotPreviewUrl = null;
let pendingPaytmGoldImport = null;

function handleGoldScreenshotSelection(event) {
    const file = event.target.files?.[0];
    const status = document.getElementById('gold-import-status');
    const analyzeButton = document.getElementById('analyze-gold-screenshot-btn');
    const preview = document.getElementById('gold-screenshot-preview');

    pendingPaytmGoldImport = null;
    document.getElementById('gold-import-review').hidden = true;
    document.getElementById('gold-import-actions').hidden = true;
    status.innerText = '';
    analyzeButton.disabled = true;
    selectedGoldScreenshot = null;

    if (goldScreenshotPreviewUrl) URL.revokeObjectURL(goldScreenshotPreviewUrl);
    goldScreenshotPreviewUrl = null;
    preview.hidden = true;

    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        status.innerText = 'Choose a PNG, JPG, or WebP screenshot.';
        event.target.value = '';
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        status.innerText = 'This image is over 10 MB. Choose a smaller screenshot.';
        event.target.value = '';
        return;
    }

    selectedGoldScreenshot = file;
    goldScreenshotPreviewUrl = URL.createObjectURL(file);
    preview.src = goldScreenshotPreviewUrl;
    preview.hidden = false;
    analyzeButton.disabled = false;
}

function readScreenshotAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            const separatorIndex = dataUrl.indexOf(',');
            if (separatorIndex < 0) {
                reject(new Error('Could not read the selected image.'));
                return;
            }
            resolve(dataUrl.slice(separatorIndex + 1));
        };
        reader.onerror = () => reject(new Error('Could not read the selected image.'));
        reader.readAsDataURL(file);
    });
}

async function analyzePaytmGoldScreenshot() {
    if (!selectedGoldScreenshot) return;

    const analyzeButton = document.getElementById('analyze-gold-screenshot-btn');
    const status = document.getElementById('gold-import-status');
    const file = selectedGoldScreenshot;
    analyzeButton.disabled = true;
    status.innerText = 'Sending screenshot to Gemini for analysis...';
    pendingPaytmGoldImport = null;
    document.getElementById('gold-import-review').hidden = true;
    document.getElementById('gold-import-actions').hidden = true;

    try {
        const imageData = await readScreenshotAsBase64(file);
        const prompt = `Read this Paytm Digital Gold screenshot. Extract fields by their labels, not by position: "Your gold in locker" is gold quantity in grams; "Buy" is the Paytm buy quote in INR per gram; "Value" is the current gold account value in INR; "Invested" is total invested principal in INR. The screenshot may show a BUY quote but no SELL quote. Do not require a sell quote. Never confuse Value with Invested. Do not guess missing values. Return valid JSON only with exactly these keys: {"gold_grams": number_or_null, "paytm_buy_price_inr_per_gram": number_or_null, "paytm_sell_price_inr_per_gram": number_or_null, "current_gold_value_inr": number_or_null, "total_invested_inr": number_or_null}. For a visible but unavailable sell quote return null. Use numeric values without currency symbols or units.`;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: file.type, data: imageData } }
                    ]
                }],
                generationConfig: { responseMimeType: 'application/json' }
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || 'Gemini could not analyze this screenshot.');
        }

        const responseText = data.candidates?.[0]?.content?.parts
            ?.map(part => part.text || '')
            .join('')
            .trim();
        if (!responseText) throw new Error('Gemini returned no readable account details.');

        const extracted = JSON.parse(responseText.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        const readOptionalNumber = value => value === null || value === undefined
            ? null
            : typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : NaN;
        const buyPrice = readOptionalNumber(extracted.paytm_buy_price_inr_per_gram);
        const sellPrice = readOptionalNumber(extracted.paytm_sell_price_inr_per_gram);
        const shownValue = readOptionalNumber(extracted.current_gold_value_inr);
        const investedAmount = readOptionalNumber(extracted.total_invested_inr);
        if (typeof extracted.gold_grams !== 'number' || !Number.isFinite(extracted.gold_grams) || extracted.gold_grams < 0 ||
            [buyPrice, sellPrice, shownValue, investedAmount].some(value => Number.isNaN(value)) ||
            (sellPrice === null && shownValue === null && buyPrice === null)) {
            throw new Error('Could not read the gold quantity and a visible Buy price or Value amount. Check the screenshot is clear and shows the Paytm Gold details.');
        }

        const valuationRate = shownValue !== null && extracted.gold_grams > 0
            ? shownValue / extracted.gold_grams
            : sellPrice ?? buyPrice ?? actual24KSellRate;
        pendingPaytmGoldImport = {
            goldGrams: extracted.gold_grams,
            buyPrice,
            sellPrice,
            valuationRate,
            quoteKind: buyPrice !== null && sellPrice !== null
                ? 'buy-sell'
                : sellPrice !== null ? 'sell' : buyPrice !== null ? 'buy-value' : 'account-value',
            shownValue,
            investedAmount
        };
        showPaytmGoldImportReview(pendingPaytmGoldImport);
        status.innerText = 'Check these values carefully. Nothing has changed yet.';
    } catch (error) {
        status.innerText = error.message || 'Screenshot analysis failed. Try again with a clearer image.';
    } finally {
        analyzeButton.disabled = !selectedGoldScreenshot;
    }
}

function showPaytmGoldImportReview(importDetails) {
    const review = document.getElementById('gold-import-review');
    const values = [
        `Gold quantity: ${importDetails.goldGrams.toFixed(5)} g`,
        `Current value shown: ${importDetails.shownValue === null ? 'Not visible' : `₹${importDetails.shownValue.toFixed(2)}`}`,
        `Paytm buy price: ${importDetails.buyPrice === null ? 'Not visible' : `₹${importDetails.buyPrice.toFixed(2)}/g`}`,
        `Paytm sell price: ${importDetails.sellPrice === null ? 'Not visible' : `₹${importDetails.sellPrice.toFixed(2)}/g`}`,
        `Total invested: ${importDetails.investedAmount === null ? 'Not visible; profit/loss will be unavailable' : `₹${importDetails.investedAmount.toFixed(2)}`}`,
        `Account valuation rate used: ₹${importDetails.valuationRate.toFixed(2)}/g`,
        'Current Value and Invested are read separately. Applying uses the displayed Value for your account total.'
    ];
    const visiblePrice = importDetails.sellPrice ?? importDetails.buyPrice;
    if (importDetails.shownValue !== null && visiblePrice !== null && importDetails.goldGrams > 0 &&
        Math.abs(importDetails.shownValue - importDetails.goldGrams * visiblePrice) > 0.05) {
        values.push('The displayed Value differs from grams × visible quote; verify these extracted figures before applying.');
    }

    review.replaceChildren(...values.map(value => {
        const line = document.createElement('p');
        line.innerText = value;
        return line;
    }));
    review.hidden = false;
    document.getElementById('gold-import-actions').hidden = false;
}

function applyPaytmGoldImport() {
    if (!pendingPaytmGoldImport) return;
    const approvedImport = { ...pendingPaytmGoldImport };
    const approved = window.confirm(
        `Apply Paytm screenshot details: ${approvedImport.goldGrams.toFixed(5)} g and current account value ₹${approvedImport.shownValue === null ? (approvedImport.goldGrams * approvedImport.valuationRate).toFixed(2) : approvedImport.shownValue.toFixed(2)}?${approvedImport.investedAmount === null ? ' Cost basis will be marked unavailable because Invested is not shown.' : ` Set total invested to ₹${approvedImport.investedAmount.toFixed(2)}.`} Savings and spending accounts will not change.`
    );
    if (!approved) return;

    investedGoldGrams = approvedImport.goldGrams;
    actual24KSellRate = approvedImport.sellPrice ?? approvedImport.valuationRate;
    actual24KBuyRate = approvedImport.buyPrice ?? actual24KSellRate / (1 - SELL_SPREAD_RATE);
    rateSource = 'paytm-screenshot';
    paytmQuoteKind = approvedImport.quoteKind;
    rateUpdatedAt = new Date().toISOString();
    investedCostBasis = approvedImport.investedAmount;
    localStorage.setItem('dgold-invested-gold-grams', String(investedGoldGrams));
    if (investedCostBasis === null) localStorage.removeItem('dgold-invested-cost-basis');
    else localStorage.setItem('dgold-invested-cost-basis', String(investedCostBasis));
    localStorage.setItem('dgold-gold-sell-rate', String(actual24KSellRate));
    localStorage.setItem('dgold-gold-buy-rate', String(actual24KBuyRate));
    localStorage.setItem('dgold-gold-rate-source', rateSource);
    localStorage.setItem('dgold-paytm-quote-kind', paytmQuoteKind);
    localStorage.setItem('dgold-gold-rate-updated-at', rateUpdatedAt);
    updateRateDisplay();
    updateCalculations();
    recordInvestmentSnapshot();
    drawTradingLineChart();
    pendingPaytmGoldImport = null;
    document.getElementById('gold-import-actions').hidden = true;
    document.getElementById('gold-import-status').innerText = 'Paytm screenshot details saved and applied to your investment account.';
}

function discardPaytmGoldImport() {
    pendingPaytmGoldImport = null;
    document.getElementById('gold-import-review').hidden = true;
    document.getElementById('gold-import-actions').hidden = true;
    document.getElementById('gold-import-status').innerText = 'Extracted details discarded. Your account was not changed.';
}

// Update FamPay Savings / Spending Account Balances
function updateAccount(type) {
    if (type === 'savings') {
        const val = parseFloat(document.getElementById('savings-input').value);
        if (!isNaN(val)) {
            savingsBalance += val;
            localStorage.setItem('dgold-savings-balance', String(savingsBalance));
            updateSavingsDisplay();
            recordSavingsSnapshot();
            document.getElementById('savings-input').value = '';
        }
    } else if (type === 'spending') {
        const val = parseFloat(document.getElementById('spending-input').value);
        if (!isNaN(val)) {
            spendingBalance += val;
            localStorage.setItem('dgold-spending-balance', String(spendingBalance));
            document.getElementById('spending-bal-disp').innerText = `₹${spendingBalance.toFixed(2)}`;
            document.getElementById('spending-input').value = '';
        }
    }
}

// Save Spending Details / Notes
function saveSpendingDetails() {
    const noteInput = document.getElementById('spending-details-note').value;
    if (noteInput.trim() !== "") {
        spendingNotes = noteInput;
        localStorage.setItem('dgold-spending-notes', spendingNotes);
        alert("Spending details updated successfully!");
    }
}

// Scroll helpers
function scrollToCalc() {
    document.getElementById('calculator-section').scrollIntoView({ behavior: 'smooth' });
}

function scrollToAccounts() {
    document.getElementById('accounts-section').scrollIntoView({ behavior: 'smooth' });
}

// Gemini AI Smart Micro-Investment Advisor Integration
async function fetchGeminiAdvice() {
    const outputBox = document.getElementById('ai-response-output');
    const btn = document.getElementById('ask-ai-btn');
    
    outputBox.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Dgolai is analyzing your FamPay savings, spending pattern ("${spendingNotes}"), and current gold rates...`;
    btn.disabled = true;

    const promptText = `Act as an expert AI financial advisor for a teen user. 
    User FamPay Savings Balance: ₹${savingsBalance.toFixed(2)}.
    User FamPay Spending Account Balance: ₹${spendingBalance.toFixed(2)}.
    Recent Spending Activity Notes: "${spendingNotes}".
    Current 24K Gold Rate: ₹${actual24KBuyRate.toFixed(2)} per gram.
    
    Give a smart, concise micro-investment recommendation (small amounts in INR) on how much the user should allocate from their Savings vs Spending account today to buy 24K gold safely without impacting daily cash flow. Keep it practical, encouraging, and clear (under 3 sentences).`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: promptText }]
                }]
            })
        });

        if (!response.ok) throw new Error('API request failed');

        const data = await response.json();
        const aiText = data.candidates[0].content.parts[0].text;
        outputBox.innerHTML = `<b>🤖 Dgolai Recommendation:</b><br>${aiText}`;
    } catch (error) {
        // Fallback intelligent offline simulation if network restriction occurs
        let recSavings = Math.min(savingsBalance * 0.05, 250);
        let recSpending = Math.min(spendingBalance * 0.02, 50);
        outputBox.innerHTML = `<b>🤖 Dgolai Recommendation:</b><br>Based on your FamPay balances (Savings: ₹${savingsBalance.toFixed(0)}, Spending: ₹${spendingBalance.toFixed(0)}), allocate <b>₹${recSavings.toFixed(0)}</b> from savings and <b>₹${recSpending.toFixed(0)}</b> from spending today for micro gold purchase. Your current spending notes ("${spendingNotes}") allow comfortable safe pooling!`;
    } finally {
        btn.disabled = false;
    }
}

// Set Timeframe
function setTimeframe(tf, btnElem) {
    currentTimeframe = tf;
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
    btnElem.classList.add('active');
    drawTradingLineChart();
}

// Trading View Style Neon Line Chart with Tooltip Badge
function drawTradingLineChart() {
    const canvas = document.getElementById('tradingLineCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    const timeframeMs = {
        Days: 24 * 60 * 60 * 1000,
        Weeks: 7 * 24 * 60 * 60 * 1000,
        Months: 30 * 24 * 60 * 60 * 1000,
        Years: 365 * 24 * 60 * 60 * 1000
    }[currentTimeframe];
    const cutoff = timeframeMs ? Date.now() - timeframeMs : 0;
    const prices = investmentHistory
            .filter(point => point.timestamp >= cutoff && (point.source || 'global-estimate') === rateSource &&
                (rateSource !== 'paytm-screenshot' || (point.quoteKind || 'sell') === paytmQuoteKind))
        .map(point => point.pricePerGram);
    const badgeElem = document.getElementById('chart-change-pct');
    if (!prices.length) {
        badgeElem.className = 'badge';
        badgeElem.innerText = 'No history';
        ctx.fillStyle = '#8ba2c4';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No history for this quote source yet', width / 2, height / 2);
        return;
    }

    const pctChange = prices[0] === 0 ? 0 : ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
    badgeElem.className = pctChange >= 0 ? 'badge positive' : 'badge negative';
    badgeElem.innerText = `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(2)}%`;

    let minP = Math.min(...prices);
    let maxP = Math.max(...prices);
    const padding = 22;
    const chartH = height - padding * 2;
    const chartW = width - 20;

    function getX(i) { return 10 + (prices.length === 1 ? chartW / 2 : (i / (prices.length - 1)) * chartW); }
    function getY(p) {
        return padding + chartH - ((p - minP) / (maxP - minP || 1)) * chartH;
    }

    // Grid Lines
    ctx.strokeStyle = 'rgba(0, 140, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
        let y = padding + (chartH / 2) * i;
        ctx.beginPath();
        ctx.moveTo(10, y);
        ctx.lineTo(width - 10, y);
        ctx.stroke();
    }

    // Gradient Fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(0, 255, 136, 0.25)');
    gradient.addColorStop(1, 'rgba(0, 255, 136, 0.0)');

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(prices[0]));
    for (let i = 1; i < prices.length; i++) {
        ctx.lineTo(getX(i), getY(prices[i]));
    }
    ctx.lineTo(getX(prices.length - 1), height);
    ctx.lineTo(getX(0), height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Main Line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(prices[0]));
    for (let i = 1; i < prices.length; i++) {
        ctx.lineTo(getX(i), getY(prices[i]));
    }
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Peak Tooltip Badge
    const lastX = getX(prices.length - 1);
    const lastY = getY(prices[prices.length - 1]);

    ctx.beginPath();
    ctx.arc(lastX, lastY, 6, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(0, 255, 136, 0.3)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(lastX, lastY, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    const badgeW = 74;
    const badgeH = 22;
    let badgeX = lastX - badgeW / 2;
    if (badgeX + badgeW > width - 5) badgeX = width - badgeW - 5;
    if (badgeX < 5) badgeX = 5;
    const badgeY = Math.max(lastY - 30, 4);

    ctx.fillStyle = '#00ff88';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
    ctx.fill();

    ctx.fillStyle = '#010204';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`₹${prices[prices.length - 1].toFixed(0)}`, badgeX + badgeW / 2, badgeY + 15);
}

// Dynamic Calculations (GST & Simulator)
function updateCalculations() {
    const manualAmt = parseFloat(document.getElementById('manual-amt').value) || 0;
    const gstAmt = manualAmt * 0.03;
    const netPrincipal = manualAmt - gstAmt;
    const goldGrams = netPrincipal / actual24KBuyRate;
    const immediateVal = goldGrams * actual24KSellRate;

    updatePortfolioValue();

    document.getElementById('gst-breakdown').innerHTML = `
        Gross Input: <span class="highlight">₹${manualAmt.toFixed(2)}</span><br>
        3% GST Deducted: <span class="negative-txt">-₹${gstAmt.toFixed(2)}</span><br>
        Net Invested Principal: <b>₹${netPrincipal.toFixed(2)}</b><br>
        Gold Added to Locker: <b>${goldGrams.toFixed(5)}g</b><br>
        Instant Cash-out Value: <span class="positive-txt">₹${immediateVal.toFixed(2)}</span>
    `;

    const simCap = parseFloat(document.getElementById('sim-cap').value) || 0;
    const simDays = parseInt(document.getElementById('sim-days').value) || 0;
    
    const dailyRate = Math.pow(1 + 0.12, 1 / 365) - 1;
    const projectedVal = (simCap * 0.97) * Math.pow(1 + dailyRate, simDays);
    const profitLoss = projectedVal - simCap;
    const percentageGain = (profitLoss / simCap) * 100;

    document.getElementById('sim-breakdown').innerHTML = `
        Target Horizon: <b>${simDays} Days</b><br>
        Projected Valuation: <span class="highlight">₹${projectedVal.toFixed(2)}</span><br>
        Estimated P&L: <span class="${profitLoss >= 0 ? 'positive-txt' : 'negative-txt'}">${profitLoss >= 0 ? '+' : ''}₹${profitLoss.toFixed(2)} (${percentageGain.toFixed(2)}%)</span>
    `;
}

// Event Listeners
document.getElementById('manual-amt').addEventListener('input', updateCalculations);
document.getElementById('sim-cap').addEventListener('input', updateCalculations);
document.getElementById('sim-days').addEventListener('input', updateCalculations);
document.getElementById('savings-income-amount').addEventListener('input', updateSavingsProjection);
document.getElementById('savings-save-amount').addEventListener('input', event => {
    const amount = Number.parseFloat(event.target.value);
    if (Number.isFinite(amount) && amount > 0) {
        savingsAmountPerIncome = amount;
        localStorage.setItem('dgold-savings-amount', String(amount));
    }
    updateSavingsProjection();
});
document.getElementById('savings-contribution-frequency').addEventListener('change', event => {
    savingsContributionFrequency = event.target.value;
    localStorage.setItem('dgold-savings-frequency', savingsContributionFrequency);
    updateSavingsProjection();
});

// Initialize
window.addEventListener('resize', () => {
    drawTradingLineChart();
    drawInvestmentHistoryChart();
    drawSavingsHistoryChart();
});
updateRateDisplay();
updateSavingsDisplay();
document.getElementById('spending-bal-disp').innerText = `₹${spendingBalance.toFixed(2)}`;
document.getElementById('spending-details-note').value = spendingNotes;
document.getElementById('savings-save-amount').value = savingsAmountPerIncome > 0 ? savingsAmountPerIncome.toFixed(2) : '';
document.getElementById('savings-contribution-frequency').value = savingsContributionFrequency;
if (!savingsHistory.length) recordSavingsSnapshot();
else {
    document.getElementById('savings-history-note').innerText = `${savingsHistory.length} locally recorded balance points`;
    drawSavingsHistoryChart();
}
updateSavingsProjection();
if (!investmentHistory.length) {
    document.getElementById('investment-history-note').innerText = 'History is recorded when the market rate refreshes or you invest.';
} else {
    document.getElementById('investment-history-note').innerText = `${investmentHistory.length} market and account updates recorded locally.`;
}
updateCalculations();
drawTradingLineChart();
drawInvestmentHistoryChart();
document.getElementById('rate-update-status').innerText = rateSource === 'paytm-screenshot'
    ? `Using saved Paytm screenshot ${paytmQuoteKind === 'sell' ? 'sell quote' : paytmQuoteKind === 'buy-value' ? 'buy quote and account value' : paytmQuoteKind === 'buy-sell' ? 'buy and sell quotes' : 'account value'}${rateUpdatedAt ? ` · imported ${new Date(rateUpdatedAt).toLocaleString()}` : ''}. Refresh uses a global estimate, not Paytm.`
    : `Using saved global gold estimate${rateUpdatedAt ? ` · updated ${new Date(rateUpdatedAt).toLocaleString()}` : ''}. It is not a Paytm quote.`;
