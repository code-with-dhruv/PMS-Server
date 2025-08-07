const API_BASE = 'http://localhost:8000/api';
const CURRENT_USER_ID = 'user123';
const SUDO_KEY = 'admin123';
let currentChart = null;

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const messageEl = document.getElementById('toastMessage');
    
    messageEl.textContent = message;
    
    if (type === 'success') {
        icon.innerHTML = '<svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>';
    } else if (type === 'error') {
        icon.innerHTML = '<svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path></svg>';
    } else {
        icon.innerHTML = '<svg class="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>';
    }
    
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleString();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('border-blue-500', 'text-blue-600');
            b.classList.add('border-transparent', 'text-gray-500');
        });
        btn.classList.add('border-blue-500', 'text-blue-600');
        btn.classList.remove('border-transparent', 'text-gray-500');
        
        document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
        document.getElementById(tabId).classList.remove('hidden');
        
        if (tabId === 'portfolio') loadPortfolio();
        else if (tabId === 'transactions') loadTransactions();
        else if (tabId === 'settlement') loadSettlementBalance();
    });
});

document.getElementById('searchBtn').addEventListener('click', searchAssets);
document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchAssets();
});

async function fetchTopMovers() {
    try {
        const res = await fetch(`${API_BASE}/top-movers`);
        const data = await res.json();

        const list = document.getElementById('gainers-list');
        list.innerHTML = '';

        if (data.length === 0) {
            list.innerHTML = '<p class="text-gray-500">No top movers found.</p>';
            return;
        }

        data.forEach(item => {
            const card = document.createElement('div');
            card.className = 'p-4 bg-green-50 border border-green-200 rounded-lg shadow';

            card.innerHTML = `
                <div class="text-green-600 text-lg font-bold">&#9650; ${item.symbol}</div>
                <div class="text-gray-800 text-sm mt-1">$${item.price.toFixed(2)}</div>
            `;

            list.appendChild(card);
        });
    } catch (err) {
        console.error('Failed to load top movers:', err);
        document.getElementById('gainers-list').innerHTML =
            '<p class="text-red-600">Failed to load top movers</p>';
    }
}

// async function fetchTopLosers() {
//     try {
//         const res = await fetch(`${API_BASE}/top-losers`);
//         const data = await res.json();

//         const list = document.getElementById('losers-list');
//         list.innerHTML = '';

//         if (data.length === 0) {
//             list.innerHTML = '<p class="text-gray-500">No top losers found.</p>';
//             return;
//         }

//         data.forEach(item => {
//             const card = document.createElement('div');
//             card.className = 'p-4 bg-red-50 border border-red-200 rounded-lg shadow text-center';

//             card.innerHTML = `
//                 <div class="text-red-600 text-lg font-bold">&#9660; ${item.symbol}</div>
//                 <div class="text-gray-800 text-sm mt-1">$${item.price.toFixed(2)}</div>
//             `;

//             list.appendChild(card);
//         });
//     } catch (err) {
//         console.error('Failed to load top losers:', err);
//         document.getElementById('losers-list').innerHTML =
//             '<p class="text-red-600">Failed to load top losers</p>';
//     }
// }




async function searchAssets() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) {
        showToast('Please enter a search query', 'error');
        return;
    }

    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = '<div class="text-center py-4">Searching...</div>';

    try {
        const response = await fetch(`${API_BASE}/search/${encodeURIComponent(query)}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Search failed');

        if (data.length === 0) {
            resultsDiv.innerHTML = '<div class="text-center py-4 text-gray-500">No results found</div>';
            return;
        }

        resultsDiv.innerHTML = `
            <h3 class="text-lg font-medium mb-4">Search Results</h3>
            <div class="grid gap-4">
                ${data.slice(0, 5).map(asset => `
                    <div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer" 
                         onclick="selectAsset('${asset.symbol}', '${asset.type}', '${asset.name}')">
                        <div class="flex justify-between items-start">
                            <div>
                                <div class="font-medium">${asset.symbol}</div>
                                <div class="text-sm text-gray-600">${asset.name}</div>
                                <div class="text-xs text-gray-500">${asset.exchange} • ${asset.currency}</div>
                            </div>
                            <span class="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">${asset.type}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        resultsDiv.innerHTML = `<div class="text-center py-4 text-red-500">Error: ${error.message}</div>`;
        showToast(error.message, 'error');
    }
}

async function selectAsset(symbol, type, name) {
    try {
        const response = await fetch(`${API_BASE}/quote/${symbol}`);
        const quote = await response.json();

        if (!response.ok) throw new Error(quote.error || 'Failed to get quote');

        const quoteDisplay = document.getElementById('quoteDisplay');
        const quoteInfo = document.getElementById('quoteInfo');
        
        quoteInfo.innerHTML = `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div><div class="text-sm text-gray-600">Symbol</div><div class="font-medium">${quote.symbol}</div></div>
                <div><div class="text-sm text-gray-600">Name</div><div class="font-medium">${quote.name || name}</div></div>
                <div><div class="text-sm text-gray-600">Price</div><div class="font-medium text-green-600">${formatCurrency(quote.price)}</div></div>
                <div><div class="text-sm text-gray-600">Currency</div><div class="font-medium">${quote.currency}</div></div>
            </div>
        `;
        
        quoteDisplay.classList.remove('hidden');
        document.getElementById('selectedSymbol').value = symbol;
        document.getElementById('selectedAssetType').value = type;
        document.getElementById('symbolDisplay').value = symbol;
        document.getElementById('transactionForm').classList.remove('hidden');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

document.getElementById('tradeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const symbol = document.getElementById('selectedSymbol').value;
    const assetType = document.getElementById('selectedAssetType').value;
    const quantityInput = document.getElementById('quantity').value;
    const type = document.getElementById('transactionType').value;
    
    const quantity = parseInt(quantityInput);
    if (!symbol || !assetType || isNaN(quantity) || quantity <= 0 || !type) {
        showToast('Please fill all fields correctly', 'error');
        return;
    }

    const loadingEl = document.getElementById('tradeLoading');
    const textEl = document.getElementById('tradeText');
    
    if (loadingEl && textEl) {
        loadingEl.classList.remove('hidden');
        textEl.style.display = 'none';
    }
    
    try {
        const response = await fetch(`${API_BASE}/transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: CURRENT_USER_ID, symbol, quantity, type, asset_type: assetType })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || `Failed to ${type} shares`);
        }
        
        showToast(`Transaction successful: ${type} ${quantity} shares of ${symbol}`, 'success');
        document.getElementById('tradeForm').reset();
        document.getElementById('transactionForm').classList.add('hidden');
        document.getElementById('quoteDisplay').classList.add('hidden');
        loadSettlementBalance();
        loadPortfolio();
        loadTransactions();
    } catch (error) {
        console.error('Transaction error:', error);
        showToast(error.message, 'error');
    } finally {
        if (loadingEl && textEl) {
            loadingEl.classList.add('hidden');
            textEl.style.display = 'inline';
        }
    }
});

// document.getElementById('refreshPortfolio').addEventListener('click', loadPortfolio);

// async function loadPortfolio() {
//     const holdingsDiv = document.getElementById('portfolioHoldings');
//     holdingsDiv.innerHTML = '<div class="text-center py-4">Loading portfolio...</div>';

//     try {
//         const response = await fetch(`${API_BASE}/portfolio/${CURRENT_USER_ID}`);
//         const data = await response.json();

//         if (!response.ok) throw new Error(data.error || 'Failed to load portfolio');

//         if (data.holdings.length === 0) {
//             holdingsDiv.innerHTML = '<div class="text-center py-8 text-gray-500">No holdings found</div>';
//             return;
//         }

//         holdingsDiv.innerHTML = `
//             <div class="mb-4">
//                 <div class="text-2xl font-bold text-green-600">Total Value: ${formatCurrency(data.total_value)}</div>
//             </div>
//             <div class="overflow-x-auto">
//                 <table class="min-w-full divide-y divide-gray-200">
//                     <thead class="bg-gray-50">
//                         <tr>
//                             <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
//                             <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
//                             <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
//                             <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
//                             <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
//                         </tr>
//                     </thead>
//                     <tbody class="divide-y divide-gray-200">
//                         ${data.holdings.map(holding => `
//                             <tr>
//                                 <td class="px-6 py-4 whitespace-nowrap font-medium">${holding.symbol}</td>
//                                 <td class="px-6 py-4 whitespace-nowrap">
//                                     <span class="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">${holding.asset_type}</span>
//                                 </td>
//                                 <td class="px-6 py-4 whitespace-nowrap">${holding.quantity}</td>
//                                 <td class="px-6 py-3 whitespace-nowrap">${formatCurrency(holding.price)}</td>
//                                 <td class="px-6 py-4 whitespace-nowrap font-medium text-green-600">${formatCurrency(holding.value)}</td>
//                             </tr>
//                         `).join('')}
//                     </tbody>
//                 </table>
//             </div>
//         `;

//         updateDiversificationChart(data.diversification);
//     } catch (error) {
//         holdingsDiv.innerHTML = `<div class="text-center py-4 text-red-500">Error: ${error.message}</div>`;
//         showToast(error.message, 'error');
//     }
// }

document.getElementById('refreshPortfolio').addEventListener('click', loadPortfolio);

async function loadPortfolio() {
    const holdingsDiv = document.getElementById('portfolioHoldings');
    holdingsDiv.innerHTML = '<div class="text-center py-4">Loading portfolio...</div>';

    try {
        const response = await fetch(`${API_BASE}/portfolio/${CURRENT_USER_ID}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || 'Failed to load portfolio');

        if (data.holdings.length === 0) {
            holdingsDiv.innerHTML = '<div class="text-center py-8 text-gray-500">No holdings found</div>';
            return;
        }

        holdingsDiv.innerHTML = `
            <div class="mb-4">
                <div class="text-2xl font-bold text-green-600">Total Value: ${formatCurrency(data.total_value)}</div>
            </div>
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Price</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Price</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Profit / Loss</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                        ${data.holdings.map(holding => {
                            const profit = parseFloat(holding.profit_loss);
                            const isProfit = profit >= 0;
                            const arrow = isProfit ? '▲' : '▼';
                            const profitClass = isProfit ? 'text-green-600' : 'text-red-600';

                            return `
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap font-medium">${holding.symbol}</td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">${holding.asset_type}</span>
                                    </td>
                                    <td class="px-6 py-4 whitespace-nowrap">${holding.quantity}</td>
                                    <td class="px-6 py-4 whitespace-nowrap">${formatCurrency(holding.avg_price)}</td>
                                    <td class="px-6 py-4 whitespace-nowrap">${formatCurrency(holding.current_price)}</td>
                                    <td class="px-6 py-4 whitespace-nowrap font-medium text-green-600">${formatCurrency(holding.value)}</td>
                                    <td class="px-6 py-4 whitespace-nowrap font-medium ${profitClass}">
                                        ${arrow} ${formatCurrency(Math.abs(profit))}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;

        updateDiversificationChart(data.diversification);
    } catch (error) {
        holdingsDiv.innerHTML = `<div class="text-center py-4 text-red-500">Error: ${error.message}</div>`;
        showToast(error.message, 'error');
    }
}


document.addEventListener("DOMContentLoaded", () => {
    // Tab switching
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const tab = btn.getAttribute("data-tab");
            document.querySelectorAll(".tab-content").forEach(tc => tc.classList.add("hidden"));
            document.getElementById(tab).classList.remove("hidden");
        });
    });

    // Example list of stocks to choose from for the timeline chart
    const stockSelect = document.getElementById("stockSelect");
    const sampleStocks = ["AAPL", "MSFT", "GOOGL", "AMZN", "IBM",'BND','TSLA','NVDA','META','FXAIX','XMTR'];

    sampleStocks.forEach(symbol => {
        const opt = document.createElement("option");
        opt.value = symbol;
        opt.textContent = symbol;
        stockSelect.appendChild(opt);
    });

    const ctx = document.getElementById("stockTimeChart").getContext("2d");
    let stockChart = null;

    stockSelect.addEventListener("change", async () => {
        const symbol = stockSelect.value;
        if (!symbol) return;

        const res = await fetch(`${API_BASE}/time_series/${symbol}`);
        const data = await res.json();

        const labels = data.map(entry => entry.datetime);
        const prices = data.map(entry => entry.close);

        if (stockChart) {
            stockChart.destroy(); // Destroy previous chart before creating new
        }

        stockChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: `${symbol} Close Price`,
                    data: prices,
                    fill: false,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Close Price ($)'
                        }
                    }
                }
            }
        });
    });
});


function updateDiversificationChart(diversification) {
    const ctx = document.getElementById('diversificationChart')?.getContext('2d');
    const statsDiv = document.getElementById('diversificationStats');
    
    if (!ctx || !statsDiv) return;

    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }

    const data = [
        parseFloat(diversification.stocks) || 0,
        parseFloat(diversification.bonds) || 0,
        parseFloat(diversification.mutual_funds) || 0
    ];

    currentChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Stocks', 'Bonds', 'Mutual Funds'],
            datasets: [{
                data: data,
                backgroundColor: ['#3B82F6', '#10B981', '#F59E0B'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: { legend: { position: "top" } }
        }
    });

    statsDiv.innerHTML = `
        <div class="flex justify-between"><span class="text-sm text-gray-600">Stocks:</span><span class="text-sm font-medium">${data[0].toFixed(2)}%</span></div>
        <div class="flex justify-between"><span class="text-sm text-gray-600">Bonds:</span><span class="text-sm font-medium">${data[1].toFixed(2)}%</span></div>
        <div class="flex justify-between"><span class="text-sm text-gray-600">Mutual Funds:</span><span class="text-sm font-medium">${data[2].toFixed(2)}%</span></div>
    `;
}

document.getElementById('refreshTransactions').addEventListener('click', loadTransactions);

async function loadTransactions() {
    const tbody = document.getElementById('transactionsList');
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4">Loading transactions...</td></tr>';

    try {
        const response = await fetch(`${API_BASE}/transactions/${CURRENT_USER_ID}`);
        const transactions = await response.json();

        if (!response.ok) throw new Error(transactions.error || 'Failed to load transactions');

        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-500">No transactions found</td></tr>';
            return;
        }

        tbody.innerHTML = transactions.map(tx => `
            <tr>
                
                <td class="px-6 py-4 whitespace-nowrap font-medium">${tx.symbol}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 text-xs rounded-full ${tx.type === 'buy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${tx.type.toUpperCase()}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">${tx.asset_type}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">${tx.quantity}</td>
                <td class="px-6 py-4 whitespace-nowrap">${formatCurrency(tx.price)}</td>
                <td class="px-6 py-4 whitespace-nowrap font-medium">${formatCurrency(tx.quantity * tx.price)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatDate(tx.timestamp)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <button onclick="deleteTransaction(${tx.id})" class="text-red-600 hover:text-red-900">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-red-500">Error: ${error.message}</td></tr>`;
        showToast(error.message, 'error');
    }
}

async function deleteTransaction(id) {
    const sudoKey = prompt('Enter sudo key to delete transaction:');
    if (sudoKey !== SUDO_KEY) {
        showToast('Invalid sudo key', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/transactions/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'X-Sudo-Key': sudoKey }
        });
        const result = await response.json();

        if (!response.ok) throw new Error(result.error || 'Failed to delete transaction');

        showToast('Transaction deleted successfully', 'success');
        loadTransactions();
        loadSettlementBalance();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

document.getElementById('settlementForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const amount = parseFloat(document.getElementById('amount').value);
    const isAdd = e.submitter.id === 'addBalance';
    const action = isAdd ? 'add' : 'withdraw';
    
    if (isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/settlement/${CURRENT_USER_ID}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: parseFloat(amount).toFixed(2), action })
        });
        
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error || `Failed to ${action} balance`);
        
        showToast(`Balance ${action === 'add' ? 'added' : 'withdrawn'} successfully`, 'success');
        loadSettlementBalance();
        document.getElementById('settlementForm').reset();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

async function loadSettlementTransactions() {
    const tbody = document.getElementById('settlementTransactionsList');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4">Loading settlement transactions...</td></tr>';

    try {
        const response = await fetch(`${API_BASE}/settlement_transactions/${CURRENT_USER_ID}`);
        const transactions = await response.json();

        if (!response.ok) throw new Error(transactions.error || 'Failed to load settlement transactions');

        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-500">No settlement transactions found</td></tr>';
            return;
        }

        tbody.innerHTML = transactions.map(tx => `
            <tr>
    
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 text-xs rounded-full ${tx.action === 'add' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${tx.action.toUpperCase()}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">${formatCurrency(tx.amount)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatDate(tx.timestamp)}</td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">Error: ${error.message}</td></tr>`;
        showToast(error.message, 'error');
    }
}

async function loadSettlementBalance() {
    try {
        const response = await fetch(`${API_BASE}/settlement/${CURRENT_USER_ID}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch balance');
        }

        const balance = parseFloat(data.balance).toFixed(2);
        const balanceElement = document.getElementById('currentBalance');
        const settlementBalanceElement = document.getElementById('settlementBalance');

        if (balanceElement && settlementBalanceElement) {
            balanceElement.textContent = formatCurrency(balance);
            settlementBalanceElement.textContent = formatCurrency(balance);
        } else {
            throw new Error('Balance elements not found in DOM');
        }

        loadSettlementTransactions();
    } catch (error) {
        console.error('Error loading settlement balance:', error);
        showToast('Failed to load balance', 'error');
    }
}

document.getElementById('eraseAllData').addEventListener('click', async () => {
    const sudoKey = prompt('Enter sudo key to erase all data:');
    if (sudoKey !== SUDO_KEY) {
        showToast('Invalid sudo key', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/erase`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'X-Sudo-Key': sudoKey }
        });
        const result = await response.json();

        if (!response.ok) throw new Error(result.error || 'Failed to erase data');

        showToast('All data erased successfully', 'success');
        loadSettlementBalance();
        loadTransactions();
        loadPortfolio();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const attemptLoadBalance = (attempts = 3, delay = 1000) => {
        loadSettlementBalance().catch(() => {
            if (attempts > 1) {
                setTimeout(() => attemptLoadBalance(attempts - 1, delay * 2), delay);
            } else {
                showToast('Failed to load balance after retries', 'error');
            }
        });
    };
    attemptLoadBalance();
    fetchTopMovers();
    //fetchTopLosers();
});


// Buy/Sell button event handlers
document.getElementById("buyBtn").addEventListener("click", () => handleTransaction("buy"));
document.getElementById("sellBtn").addEventListener("click", () => handleTransaction("sell"));

async function handleTransaction(type) {
  const symbol = document.getElementById("symbolInput").value.trim();
  const quantity = parseInt(document.getElementById("quantityInput").value);
  const user_id = "user123";
  const asset_type = document.getElementById("assetTypeInput").value || "stock";


  if (!symbol || isNaN(quantity) || quantity <= 0) {
    alert("Please enter valid stock symbol and quantity.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        user_id, // Replace with actual user_id if needed
        symbol,
        quantity,
        type,
        asset_type
      })
    });

    const data = await response.json();

    if (response.ok) {
      //alert(data.message);
      alert('Transaction Successful')
      loadPortfolio(); // Refresh holdings after buy/sell
    } else {
      alert(data.message || "Transaction failed.");
    }
  } catch (err) {
    console.error("Error during transaction:", err);
    alert("An error occurred while processing the transaction.");
  }
}