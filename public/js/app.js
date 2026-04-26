const API_URL = '/api/data';
let data = { guns: [], suppressors: [], ammo: {}, history: [], manufacturers: [], calibers: [] };
let charts = {};
let tableSort = { column: 'manufacturer', direction: 'asc' };

async function load() {
    try {
        const response = await fetch(API_URL);
        const rawData = await response.json();
        data = migrateData(rawData);
        render();
    } catch (err) {
        console.error('Failed to load data:', err);
    }
}

function migrateData(oldData) {
    const newData = {
        guns: oldData.guns || [],
        suppressors: oldData.suppressors || [],
        ammo: {},
        history: oldData.history || [],
        manufacturers: oldData.manufacturers || [],
        calibers: oldData.calibers || []
    };

    const splitName = (name) => {
        if (!name) return { manufacturer: 'Unknown', model: '' };
        const parts = name.trim().split(' ');
        if (parts.length === 1) return { manufacturer: parts[0], model: '' };
        return { manufacturer: parts[0], model: parts.slice(1).join(' ') };
    };

    if (oldData.ammo) {
        Object.entries(oldData.ammo).forEach(([cal, val]) => {
            if (typeof val === 'number') {
                newData.ammo[cal] = { qty: val, minStock: 100 };
            } else {
                newData.ammo[cal] = val;
            }
        });
    }

    newData.guns = newData.guns.map(gun => {
        const parts = gun.name ? splitName(gun.name) : { manufacturer: gun.manufacturer, model: gun.model };
        return {
            id: gun.id || Math.random().toString(36).substr(2, 9),
            manufacturer: parts.manufacturer || 'Unknown',
            model: parts.model || '',
            caliber: gun.caliber || 'Unknown',
            rounds: gun.rounds || 0,
            lastService: gun.lastService || 0,
            serial: gun.serial || '',
            cleanInterval: gun.cleanInterval || 500,
            status: gun.status || 'Ready'
        };
    });

    newData.suppressors = newData.suppressors.map(sup => {
        const parts = sup.name ? splitName(sup.name) : { manufacturer: sup.manufacturer, model: sup.model };
        return {
            id: sup.id || Math.random().toString(36).substr(2, 9),
            manufacturer: parts.manufacturer || 'Unknown',
            model: parts.model || '',
            calibers: sup.calibers || [],
            rounds: sup.rounds || 0,
            lastService: sup.lastService || 0,
            serial: sup.serial || '',
            cleanInterval: sup.cleanInterval || 1000,
            status: sup.status || 'Ready'
        };
    });

    // Auto-populate manufacturers and calibers from existing data
    const foundManufacturers = new Set(newData.manufacturers);
    const foundCalibers = new Set(newData.calibers);

    newData.guns.forEach(g => {
        if (g.manufacturer) foundManufacturers.add(g.manufacturer);
        if (g.caliber) foundCalibers.add(g.caliber);
    });
    newData.suppressors.forEach(s => {
        if (s.manufacturer) foundManufacturers.add(s.manufacturer);
        if (s.calibers) s.calibers.forEach(c => foundCalibers.add(c));
    });
    Object.keys(newData.ammo).forEach(c => foundCalibers.add(c));

    newData.manufacturers = Array.from(foundManufacturers).sort();
    newData.calibers = Array.from(foundCalibers).sort();

    return newData;
}

async function save() {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('Save failed');
        render();
    } catch (err) {
        console.error('Save error:', err);
        alert('Error saving data');
    }
}

// UI Controllers
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => {
        const onclick = b.getAttribute('onclick');
        return onclick && onclick.includes(`'${tabId}'`);
    });
    if (btn) btn.classList.add('active');
    document.getElementById(tabId).classList.add('active');
    if (tabId === 'dashboard') updateCharts();
    if (tabId === 'datatable') renderDataTable();
    if (tabId === 'settings') renderSettings();
}

function openModal(id) { document.getElementById(id).style.display = 'block'; }
function closeModal(id) { 
    document.getElementById(id).style.display = 'none';
    if (id === 'gun-modal') document.getElementById('edit-gun-id').value = '';
    if (id === 'suppressor-modal') document.getElementById('edit-suppressor-id').value = '';
}

// Dropdown Population
function populateDropdown(id, items, selectedValue = '') {
    const select = document.getElementById(id);
    select.innerHTML = '<option value="">-- Select --</option>' + 
        items.map(item => `<option value="${item}" ${item === selectedValue ? 'selected' : ''}>${item}</option>`).join('');
}

function populateCheckboxList(containerId, items, selectedItems = []) {
    const container = document.getElementById(containerId);
    container.innerHTML = items.map(item => `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
            <input type="checkbox" value="${item}" ${selectedItems.includes(item) ? 'checked' : ''} style="width:auto; margin:0">
            <span>${item}</span>
        </div>
    `).join('');
}

// Settings Logic
function addItem(type, inputId) {
    const val = document.getElementById(inputId).value.trim();
    if (!val) return;
    if (data[type].includes(val)) return alert('Already exists');
    data[type].push(val);
    data[type].sort();
    document.getElementById(inputId).value = '';
    save();
}

function deleteItem(type, index) {
    if (confirm(`Remove this ${type.slice(0, -1)}?`)) {
        data[type].splice(index, 1);
        save();
    }
}

function renderSettings() {
    const manList = document.getElementById('manufacturer-list-mgmt');
    manList.innerHTML = data.manufacturers.map((m, i) => `
        <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #333; align-items:center;">
            <span>${m}</span>
            <button class="secondary" style="padding:2px 8px;" onclick="deleteItem('manufacturers', ${i})">×</button>
        </div>
    `).join('');

    const calList = document.getElementById('caliber-list-mgmt');
    calList.innerHTML = data.calibers.map((c, i) => `
        <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #333; align-items:center;">
            <span>${c}</span>
            <button class="secondary" style="padding:2px 8px;" onclick="deleteItem('calibers', ${i})">×</button>
        </div>
    `).join('');
}

// Gun Logic
function openAddGunModal() {
    populateDropdown('modal-gun-make', data.manufacturers);
    populateDropdown('modal-gun-caliber', data.calibers);
    document.getElementById('gun-modal-title').innerText = 'Add New Firearm';
    document.getElementById('edit-gun-id').value = '';
    document.getElementById('modal-gun-model').value = '';
    document.getElementById('modal-gun-serial').value = '';
    document.getElementById('modal-gun-interval').value = '500';
    document.getElementById('modal-gun-status').value = 'Ready';
    openModal('gun-modal');
}

function saveGun() {
    const manufacturer = document.getElementById('modal-gun-make').value;
    const model = document.getElementById('modal-gun-model').value;
    const caliber = document.getElementById('modal-gun-caliber').value;
    const serial = document.getElementById('modal-gun-serial').value;
    const interval = parseInt(document.getElementById('modal-gun-interval').value);
    const status = document.getElementById('modal-gun-status').value;
    const editId = document.getElementById('edit-gun-id').value;

    if (!manufacturer || !caliber) return alert('Manufacturer and Caliber required');

    if (editId) {
        const gun = data.guns.find(g => g.id === editId);
        Object.assign(gun, { manufacturer, model, caliber, serial, cleanInterval: interval, status });
    } else {
        data.guns.push({
            id: Math.random().toString(36).substr(2, 9),
            manufacturer, model, caliber, serial, rounds: 0, lastService: 0, cleanInterval: interval, status
        });
    }

    closeModal('gun-modal');
    save();
}

function editGun(id) {
    const gun = data.guns.find(g => g.id === id);
    populateDropdown('modal-gun-make', data.manufacturers, gun.manufacturer);
    populateDropdown('modal-gun-caliber', data.calibers, gun.caliber);
    document.getElementById('gun-modal-title').innerText = 'Edit Firearm';
    document.getElementById('edit-gun-id').value = gun.id;
    document.getElementById('modal-gun-model').value = gun.model;
    document.getElementById('modal-gun-serial').value = gun.serial;
    document.getElementById('modal-gun-interval').value = gun.cleanInterval;
    document.getElementById('modal-gun-status').value = gun.status;
    openModal('gun-modal');
}

function deleteGun(id) {
    if (confirm('Are you sure you want to delete this firearm?')) {
        data.guns = data.guns.filter(g => g.id !== id);
        save();
    }
}

// Suppressor Logic
function openAddSuppressorModal() {
    populateDropdown('modal-suppressor-make', data.manufacturers);
    populateCheckboxList('modal-suppressor-calibers-list', data.calibers);
    document.getElementById('suppressor-modal-title').innerText = 'Add New Suppressor';
    document.getElementById('edit-suppressor-id').value = '';
    document.getElementById('modal-suppressor-model').value = '';
    document.getElementById('modal-suppressor-serial').value = '';
    document.getElementById('modal-suppressor-interval').value = '1000';
    document.getElementById('modal-suppressor-status').value = 'Ready';
    openModal('suppressor-modal');
}

function saveSuppressor() {
    const manufacturer = document.getElementById('modal-suppressor-make').value;
    const model = document.getElementById('modal-suppressor-model').value;
    const serial = document.getElementById('modal-suppressor-serial').value;
    const interval = parseInt(document.getElementById('modal-suppressor-interval').value);
    const status = document.getElementById('modal-suppressor-status').value;
    const editId = document.getElementById('edit-suppressor-id').value;

    if (!manufacturer) return alert('Manufacturer required');

    const calibers = Array.from(document.querySelectorAll('#modal-suppressor-calibers-list input:checked')).map(cb => cb.value);

    if (editId) {
        const sup = data.suppressors.find(s => s.id === editId);
        Object.assign(sup, { manufacturer, model, calibers, serial, cleanInterval: interval, status });
    } else {
        data.suppressors.push({
            id: Math.random().toString(36).substr(2, 9),
            manufacturer, model, calibers, serial, rounds: 0, lastService: 0, cleanInterval: interval, status
        });
    }

    closeModal('suppressor-modal');
    save();
}

function editSuppressor(id) {
    const sup = data.suppressors.find(s => s.id === id);
    populateDropdown('modal-suppressor-make', data.manufacturers, sup.manufacturer);
    populateCheckboxList('modal-suppressor-calibers-list', data.calibers, sup.calibers);
    document.getElementById('suppressor-modal-title').innerText = 'Edit Suppressor';
    document.getElementById('edit-suppressor-id').value = sup.id;
    document.getElementById('modal-suppressor-model').value = sup.model;
    document.getElementById('modal-suppressor-serial').value = sup.serial;
    document.getElementById('modal-suppressor-interval').value = sup.cleanInterval;
    document.getElementById('modal-suppressor-status').value = sup.status;
    openModal('suppressor-modal');
}

function deleteSuppressor(id) {
    if (confirm('Are you sure you want to delete this suppressor?')) {
        data.suppressors = data.suppressors.filter(s => s.id !== id);
        save();
    }
}

// Ammo Logic
function openAmmoModal() {
    populateDropdown('modal-ammo-cal', data.calibers);
    openModal('ammo-modal');
}

function saveAmmo() {
    const cal = document.getElementById('modal-ammo-cal').value;
    const qty = parseInt(document.getElementById('modal-ammo-qty').value) || 0;
    const min = parseInt(document.getElementById('modal-ammo-min').value) || 0;
    if (!cal) return;
    if (!data.ammo[cal]) data.ammo[cal] = { qty: 0, minStock: min };
    data.ammo[cal].qty += qty;
    data.ammo[cal].minStock = min;
    closeModal('ammo-modal');
    save();
}

// Session Logic
function openSessionModal(gunId) {
    const gun = data.guns.find(g => g.id === gunId);
    document.getElementById('session-gun-id').value = gunId;
    document.getElementById('session-gun-name').innerText = `${gun.manufacturer} ${gun.model}`;
    document.getElementById('session-date').valueAsDate = new Date();
    
    // Only show ammo calibers that are compatible with the gun (if defined) or all if not
    const ammoSelect = document.getElementById('session-caliber');
    const availableAmmo = Object.keys(data.ammo);
    ammoSelect.innerHTML = availableAmmo.map(cal => `<option value="${cal}" ${cal === gun.caliber ? 'selected' : ''}>${cal}</option>`).join('');
    
    const supSelect = document.getElementById('session-suppressor');
    // Only show suppressors that are compatible with the gun's caliber
    const validSups = data.suppressors.filter(s => !gun.caliber || s.calibers.includes(gun.caliber));
    supSelect.innerHTML = '<option value="">None</option>' + 
        validSups.map(s => `<option value="${s.id}">${s.manufacturer} ${s.model}</option>`).join('');
    
    openModal('session-modal');
}

function submitSession() {
    const gunId = document.getElementById('session-gun-id').value;
    const count = parseInt(document.getElementById('session-rounds').value);
    const cal = document.getElementById('session-caliber').value;
    const supId = document.getElementById('session-suppressor').value;
    const date = document.getElementById('session-date').value;
    if (isNaN(count) || count <= 0) return alert('Enter a valid round count');
    if (!data.ammo[cal] || data.ammo[cal].qty < count) return alert('Insufficient ammo in stock');
    if (!date) return alert('Please select a date');
    const gun = data.guns.find(g => g.id === gunId);
    gun.rounds += count;
    data.ammo[cal].qty -= count;
    let supName = '';
    if (supId) {
        const sup = data.suppressors.find(s => s.id === supId);
        sup.rounds += count;
        supName = `${sup.manufacturer} ${sup.model}`;
    }
    data.history.push({
        date: date, gun: `${gun.manufacturer} ${gun.model}`, gunId: gunId,
        caliber: cal, rounds: count, suppressor: supName, suppressorId: supId
    });
    data.history.sort((a, b) => new Date(b.date) - new Date(a.date));
    closeModal('session-modal');
    save();
}

// Sorting and Filtering
function sortTable(column) {
    if (tableSort.column === column) {
        tableSort.direction = tableSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        tableSort.column = column;
        tableSort.direction = 'asc';
    }
    renderDataTable();
}

function renderDataTable() {
    const query = document.getElementById('table-search').value.toLowerCase();
    const tableBody = document.getElementById('table-body');
    let filteredGuns = data.guns.filter(g => {
        const searchStr = `${g.manufacturer} ${g.model} ${g.caliber} ${g.serial} ${g.status}`.toLowerCase();
        return searchStr.includes(query);
    });
    filteredGuns.sort((a, b) => {
        let valA = a[tableSort.column];
        let valB = b[tableSort.column];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return tableSort.direction === 'asc' ? -1 : 1;
        if (valA > valB) return tableSort.direction === 'asc' ? 1 : -1;
        return 0;
    });
    tableBody.innerHTML = filteredGuns.map(gun => `
        <tr style="cursor:pointer" onclick="editGun('${gun.id}')">
            <td>${gun.manufacturer}</td>
            <td>${gun.model}</td>
            <td>${gun.caliber}</td>
            <td>${gun.serial || 'N/A'}</td>
            <td>${gun.rounds}</td>
            <td>${gun.cleanInterval}</td>
            <td>${gun.status}</td>
        </tr>
    `).join('');
}

function render() {
    const gunQuery = document.getElementById('gun-search').value.toLowerCase();
    const supQuery = document.getElementById('suppressor-search').value.toLowerCase();
    const ammoQuery = document.getElementById('ammo-search').value.toLowerCase();

    // Refresh Settings and Data Table if they are the active tab
    if (document.getElementById('settings').classList.contains('active')) renderSettings();
    if (document.getElementById('datatable').classList.contains('active')) renderDataTable();

    const gunDiv = document.getElementById('gun-list');
    gunDiv.innerHTML = data.guns.filter(g => `${g.manufacturer} ${g.model}`.toLowerCase().includes(gunQuery))
        .map((gun) => {
            const roundsSinceClean = gun.rounds - gun.lastService;
            const needsClean = roundsSinceClean >= gun.cleanInterval;
            return `
                <div class="item-card ${needsClean ? 'warning' : ''}">
                    <strong>${gun.manufacturer} ${gun.model}</strong>
                    <div class="stats">
                        Caliber: ${gun.caliber}<br>
                        SN: ${gun.serial || 'N/A'}<br>
                        Total: ${gun.rounds} | Since Clean: ${roundsSinceClean} / ${gun.cleanInterval}<br>
                        Status: <span style="color: var(--accent)">${gun.status}</span>
                    </div>
                    ${needsClean ? '<div class="warning-text">⚠ NEEDS CLEANING</div>' : ''}
                    <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:5px;">
                        <button onclick="openSessionModal('${gun.id}')">Log Session</button>
                        <button class="secondary" onclick="data.guns.find(g => g.id === '${gun.id}').lastService=${gun.rounds}; save();">Cleaned</button>
                        <button class="secondary" onclick="showTrend('${gun.id}')">📈</button>
                        <button class="secondary" onclick="editGun('${gun.id}')">✎</button>
                        <button class="secondary" onclick="deleteGun('${gun.id}')">🗑</button>
                    </div>
                </div>`;
        }).join('');
    const supDiv = document.getElementById('suppressor-list');
    supDiv.innerHTML = data.suppressors.filter(s => `${s.manufacturer} ${s.model}`.toLowerCase().includes(supQuery))
        .map((sup) => {
            const roundsSinceClean = sup.rounds - sup.lastService;
            const needsClean = roundsSinceClean >= sup.cleanInterval;
            return `
                <div class="item-card ${needsClean ? 'warning' : ''}">
                    <strong>${sup.manufacturer} ${sup.model}</strong>
                    <div class="stats">
                        Compat: ${(sup.calibers || []).join(', ') || 'None'}<br>
                        SN: ${sup.serial || 'N/A'}<br>
                        Total: ${sup.rounds} | Since Clean: ${roundsSinceClean} / ${sup.cleanInterval}<br>
                        Status: <span style="color: var(--accent)">${sup.status}</span>
                    </div>
                    ${needsClean ? '<div class="warning-text">⚠ NEEDS CLEANING</div>' : ''}
                    <div style="margin-top:10px; display:flex; gap:5px;">
                        <button class="secondary" onclick="data.suppressors.find(s => s.id === '${sup.id}').lastService=${sup.rounds}; save();">Cleaned</button>
                        <button class="secondary" onclick="editSuppressor('${sup.id}')">✎</button>
                        <button class="secondary" onclick="deleteSuppressor('${sup.id}')">🗑</button>
                    </div>
                </div>`;
        }).join('');
    const ammoDiv = document.getElementById('ammo-list');
    ammoDiv.innerHTML = Object.entries(data.ammo).filter(([cal]) => cal.toLowerCase().includes(ammoQuery))
        .map(([cal, info]) => {
            const low = info.qty <= info.minStock;
            return `
                <div class="item-card ${low ? 'warning' : ''}">
                    <strong>${cal}</strong>
                    <div class="stats">In Stock: <span style="font-weight:bold; font-size:1.2em">${info.qty}</span><br>Min Alert: ${info.minStock}</div>
                    ${low ? '<div class="warning-text">⚠ LOW STOCK</div>' : ''}
                </div>`;
        }).join('');
    const historyBody = document.getElementById('history-list');
    historyBody.innerHTML = data.history.slice(0, 50).map(entry => `
        <tr><td>${entry.date}</td><td>${entry.gun}${entry.suppressor ? ' <br><small style="color:var(--text-muted)">+ ' + entry.suppressor + '</small>' : ''}</td><td>${entry.caliber}</td><td>${entry.rounds}</td></tr>
    `).join('');
    updateGlobalStats();
}

function updateGlobalStats() {
    const totalGuns = data.guns.length;
    const totalRounds = data.guns.reduce((acc, g) => acc + g.rounds, 0);
    document.getElementById('global-stats').innerText = `${totalGuns} Firearms | ${totalRounds} Total Rounds Fired`;
}

function updateCharts() {
    const ctxRounds = document.getElementById('roundsChart').getContext('2d');
    const ctxAmmo = document.getElementById('ammoChart').getContext('2d');
    if (charts.rounds) charts.rounds.destroy();
    if (charts.ammo) charts.ammo.destroy();
    charts.rounds = new Chart(ctxRounds, {
        type: 'bar',
        data: {
            labels: data.guns.map(g => `${g.manufacturer} ${g.model}`),
            datasets: [{ label: 'Total Rounds', data: data.guns.map(g => g.rounds), backgroundColor: '#cfb53b' }]
        },
        options: { plugins: { legend: { display: false } } }
    });
    charts.ammo = new Chart(ctxAmmo, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data.ammo),
            datasets: [{ data: Object.values(data.ammo).map(a => a.qty), backgroundColor: ['#cfb53b', '#555', '#888', '#aaa', '#03dac6'] }]
        }
    });
}

function showTrend(gunId) {
    const gun = data.guns.find(g => g.id === gunId);
    document.getElementById('trend-title').innerText = `${gun.manufacturer} ${gun.model} - Round Count Over Time`;
    openModal('trend-modal');
    const gunHistory = data.history.filter(h => h.gunId === gunId).sort((a, b) => new Date(a.date) - new Date(b.date));
    let cumulative = 0;
    const labels = ['Start'];
    const points = [0];
    gunHistory.forEach(h => {
        cumulative += h.rounds;
        labels.push(h.date);
        points.push(cumulative);
    });
    const ctx = document.getElementById('trendChart').getContext('2d');
    if (charts.trend) charts.trend.destroy();
    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative Rounds', data: points, borderColor: '#cfb53b',
                backgroundColor: 'rgba(207, 181, 59, 0.1)', fill: true, tension: 0.1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}
load();
