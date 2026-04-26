const API_URL = '/api/data';
let data = { guns: [], suppressors: [], ammo: {}, history: [], manufacturers: [], calibers: [], units: [], maintenance: [] };
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

function generateId() { return Math.random().toString(36).substr(2, 9); }

function parseCaliber(c) {
    if (!c) return { name: 'Unknown', unit: 'Caliber' };
    if (typeof c === 'object' && c.name) return c;
    const name = String(c);
    if (name === 'undefined' || name === 'Unknown') return { name: 'Unknown', unit: 'Caliber' };
    for (const unit of data.units || ['mm', 'Caliber', 'ga']) {
        if (name.toLowerCase().endsWith(unit.toLowerCase())) {
            return { name: name.slice(0, -unit.length).trim(), unit: unit };
        }
    }
    if (name.toLowerCase().includes('mm')) return { name: name.replace(/mm/gi, '').trim(), unit: 'mm' };
    if (name.toLowerCase().includes('ga')) return { name: name.replace(/ga/gi, '').trim(), unit: 'ga' };
    return { name: name.replace(/ Caliber/gi, '').trim(), unit: 'Caliber' };
}

function getCaliberFullName(c) {
    if (!c) return 'Unknown';
    if (typeof c !== 'object') {
        const parsed = parseCaliber(c);
        return getCaliberFullName(parsed);
    }
    if (!c.name || c.name === 'Unknown') return 'Unknown';
    if (c.unit === 'mm') return `${c.name}mm`;
    if (c.unit === 'ga') return `${c.name}ga`;
    if (c.unit === 'Caliber') return `${c.name} Caliber`;
    return `${c.name} ${c.unit || ''}`.trim();
}

function migrateData(oldData) {
    const newData = {
        guns: oldData.guns || [],
        suppressors: oldData.suppressors || [],
        ammo: {},
        history: oldData.history || [],
        maintenance: oldData.maintenance || [],
        manufacturers: oldData.manufacturers || [],
        calibers: [],
        units: oldData.units || ['mm', 'Caliber', 'ga']
    };

    data.units = newData.units;

    newData.history = newData.history.map(h => ({ ...h, id: h.id || generateId() }));

    newData.guns = newData.guns.map(gun => {
        const rounds = gun.rounds || 0;
        return {
            ...gun,
            id: gun.id || generateId(),
            caliber: getCaliberFullName(gun.caliber),
            sku: gun.sku || '',
            type: gun.type || 'Rifle',
            rounds: rounds,
            lastService: Math.min(gun.lastService || 0, rounds),
            lastBoltService: Math.min(gun.lastBoltService || gun.lastService || 0, rounds),
            serial: gun.serial || '',
            cleanInterval: gun.cleanInterval || 500,
            boltCleanInterval: gun.boltCleanInterval || 1000,
            status: gun.status || 'Ready'
        };
    });

    newData.suppressors = newData.suppressors.map(sup => {
        const rounds = sup.rounds || 0;
        return {
            ...sup,
            id: sup.id || generateId(),
            sku: sup.sku || '',
            calibers: (sup.calibers || []).map(getCaliberFullName).filter(c => c !== 'Unknown'),
            rounds: rounds,
            lastService: Math.min(sup.lastService || 0, rounds),
            serial: sup.serial || '',
            cleanInterval: sup.cleanInterval || 1000,
            status: sup.status || 'Ready'
        };
    });

    if (oldData.ammo) {
        Object.entries(oldData.ammo).forEach(([cal, val]) => {
            const cleanCal = getCaliberFullName(cal);
            if (cleanCal === 'Unknown') return;
            newData.ammo[cleanCal] = typeof val === 'number' ? { qty: val, minStock: 100 } : val;
        });
    }

    const caliberSet = new Set();
    newData.guns.forEach(g => caliberSet.add(JSON.stringify(parseCaliber(g.caliber))));
    newData.suppressors.forEach(s => (s.calibers || []).forEach(c => caliberSet.add(JSON.stringify(parseCaliber(c)))));
    Object.keys(newData.ammo).forEach(c => caliberSet.add(JSON.stringify(parseCaliber(c))));
    (oldData.calibers || []).forEach(c => caliberSet.add(JSON.stringify(parseCaliber(c))));

    newData.calibers = Array.from(caliberSet).map(s => JSON.parse(s)).filter(c => c.name !== 'Unknown').sort((a,b) => a.name.localeCompare(b.name));
    newData.manufacturers = Array.from(new Set(newData.manufacturers)).filter(m => m && m !== 'undefined' && m !== 'null').sort();

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

// Navigation & Modals
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(`'${tabId}'`));
    if (btn) btn.classList.add('active');
    document.getElementById(tabId).classList.add('active');
    if (tabId === 'dashboard') updateCharts();
    if (tabId === 'datatable') renderDataTable();
    if (tabId === 'settings') renderSettings();
}

function openModal(id) { document.getElementById(id).style.display = 'block'; }
function closeModal(id) { 
    document.getElementById(id).style.display = 'none';
    if (id === 'gun-modal') {
        document.getElementById('edit-gun-id').value = '';
        document.getElementById('gun-modal-title').innerText = 'Add New Firearm';
    }
}

function populateDropdown(id, items, selectedValue = '') {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = '<option value="">-- Select --</option>' + 
        items.map(item => `<option value="${item}" ${String(item) === String(selectedValue) ? 'selected' : ''}>${item}</option>`).join('');
}

// Gun Details
function openGunDetails(gunId) {
    const gun = data.guns.find(g => g.id === gunId);
    if (!gun) return;
    document.getElementById('details-gun-name').innerText = `${gun.manufacturer} ${gun.model}`;
    document.getElementById('details-gun-info').innerText = `${gun.type} | SN: ${gun.serial || 'N/A'} | SKU: ${gun.sku || 'N/A'}`;
    document.getElementById('gun-details-modal').dataset.gunId = gunId;
    switchDetailsTab('history');
    openModal('gun-details-modal');
}

function switchDetailsTab(tab) {
    const gunId = document.getElementById('gun-details-modal').dataset.gunId;
    document.getElementById('details-history-tab').classList.toggle('active', tab === 'history');
    document.getElementById('details-maint-tab').classList.toggle('active', tab === 'maint');
    document.getElementById('details-history-content').style.display = tab === 'history' ? 'block' : 'none';
    document.getElementById('details-maint-content').style.display = tab === 'maint' ? 'block' : 'none';

    if (tab === 'history') {
        const hist = data.history.filter(h => h.gunId === gunId);
        document.getElementById('details-history-list').innerHTML = hist.map(h => `
            <tr style="cursor:pointer" onclick="openEditSessionModal('${h.id}')">
                <td>${h.date}</td><td>${h.caliber}</td><td>${h.rounds}</td>
            </tr>`).join('');
    } else {
        const maint = data.maintenance.filter(m => m.gunId === gunId).sort((a,b) => new Date(b.date) - new Date(a.date));
        document.getElementById('details-maint-list').innerHTML = maint.map(m => `
            <tr><td>${m.date}</td><td>${m.type}</td><td>${m.roundsAtService}</td><td>${m.notes || ''}</td></tr>
        `).join('');
    }
}

// History Edits
function openEditSessionModal(id) {
    const session = data.history.find(h => h.id === id);
    if (!session) return;
    document.getElementById('edit-session-id').value = id;
    document.getElementById('edit-session-date').value = session.date;
    document.getElementById('edit-session-rounds').value = session.rounds;
    populateDropdown('edit-session-caliber', data.calibers.map(getCaliberFullName), session.caliber);
    openModal('edit-session-modal');
}

function saveEditedSession() {
    const id = document.getElementById('edit-session-id').value;
    const session = data.history.find(h => h.id === id);
    const newDate = document.getElementById('edit-session-date').value;
    const newRounds = parseInt(document.getElementById('edit-session-rounds').value);
    const newCal = document.getElementById('edit-session-caliber').value;

    const roundDiff = newRounds - session.rounds;
    const gun = data.guns.find(g => g.id === session.gunId);
    if (gun) {
        gun.rounds += roundDiff;
        // Cap maintenance to current total to prevent negatives
        gun.lastService = Math.min(gun.lastService, gun.rounds);
        gun.lastBoltService = Math.min(gun.lastBoltService, gun.rounds);
    }

    if (session.suppressorId) {
        const sup = data.suppressors.find(s => s.id === session.suppressorId);
        if (sup) {
            sup.rounds += roundDiff;
            sup.lastService = Math.min(sup.lastService, sup.rounds);
        }
    }

    if (data.ammo[session.caliber]) data.ammo[session.caliber].qty += session.rounds;
    if (data.ammo[newCal]) data.ammo[newCal].qty -= newRounds;

    session.date = newDate;
    session.rounds = newRounds;
    session.caliber = newCal;
    data.history.sort((a,b) => new Date(b.date) - new Date(a.date));

    closeModal('edit-session-modal');
    save();
}

function deleteSession() {
    const id = document.getElementById('edit-session-id').value;
    const session = data.history.find(h => h.id === id);
    if (!confirm('Delete this session?')) return;

    const gun = data.guns.find(g => g.id === session.gunId);
    if (gun) {
        gun.rounds -= session.rounds;
        gun.lastService = Math.min(gun.lastService, gun.rounds);
        gun.lastBoltService = Math.min(gun.lastBoltService, gun.rounds);
    }
    if (session.suppressorId) {
        const sup = data.suppressors.find(s => s.id === session.suppressorId);
        if (sup) {
            sup.rounds -= session.rounds;
            sup.lastService = Math.min(sup.lastService, sup.rounds);
        }
    }
    if (data.ammo[session.caliber]) data.ammo[session.caliber].qty += session.rounds;

    data.history = data.history.filter(h => h.id !== id);
    closeModal('edit-session-modal');
    save();
}

// Maintenance Logic
function calculateMaintenanceInterval(gunId, type, date) {
    const maintHistory = data.maintenance
        .filter(m => m.gunId === gunId && m.type === type && new Date(m.date) < new Date(date))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    const lastMaintDate = maintHistory.length > 0 ? new Date(maintHistory[0].date) : new Date(0);
    const targetDate = new Date(date);

    return data.history
        .filter(h => h.gunId === gunId && new Date(h.date) > lastMaintDate && new Date(h.date) <= targetDate)
        .reduce((sum, h) => sum + h.rounds, 0);
}

function updateMaintRounds() {
    const gunId = document.getElementById('maint-gun-id').value;
    const type = document.getElementById('maint-type').value;
    const date = document.getElementById('maint-date').value;
    if (!gunId || !type || !date) return;
    
    const rounds = calculateMaintenanceInterval(gunId, type, date);
    document.getElementById('maint-rounds').value = rounds;
}

function openMaintenanceModal(gunId, type) {
    document.getElementById('maint-gun-id').value = gunId;
    document.getElementById('maint-type').value = type;
    document.getElementById('maint-date').valueAsDate = new Date();
    document.getElementById('maint-modal-title').innerText = `Log ${type} Maintenance`;
    updateMaintRounds();
    openModal('maintenance-modal');
}

function saveMaintenance() {
    const gunId = document.getElementById('maint-gun-id').value;
    const type = document.getElementById('maint-type').value;
    const date = document.getElementById('maint-date').value;
    const rounds = parseInt(document.getElementById('maint-rounds').value);
    const notes = document.getElementById('maint-notes').value;

    data.maintenance.push({ id: generateId(), gunId, type, date, roundsAtService: rounds, notes });
    
    const gun = data.guns.find(g => g.id === gunId);
    if (gun) {
        const latestMaint = data.maintenance
            .filter(m => m.gunId === gunId && m.type === type)
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        
        const cumulativeAtMaint = data.history
            .filter(h => h.gunId === gunId && new Date(h.date) <= new Date(latestMaint.date))
            .reduce((sum, h) => sum + h.rounds, 0);
            
        if (type === 'Barrel') gun.lastService = cumulativeAtMaint;
        else gun.lastBoltService = cumulativeAtMaint;
    }

    closeModal('maintenance-modal');
    save();
}

// CRUD Logic (Gun, Suppressor, Ammo, Settings)
function addCaliberItem() {
    const unit = document.getElementById('new-caliber-unit').value;
    const name = document.getElementById('new-caliber-name').value.trim();
    if (!unit || !name) return alert('Select unit and enter name');
    if (data.calibers.find(c => c.name === name && c.unit === unit)) return alert('Already exists');
    data.calibers.push({ name, unit });
    data.calibers.sort((a,b) => a.name.localeCompare(b.name));
    document.getElementById('new-caliber-name').value = '';
    save();
}

function addItem(type, inputId) {
    const val = document.getElementById(inputId).value.trim();
    if (!val || val === 'undefined') return;
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
        </div>`).join('');

    const unitList = document.getElementById('unit-list-mgmt');
    unitList.innerHTML = data.units.map((u, i) => `
        <div style="background:#444; padding:5px 10px; border-radius:15px; display:flex; gap:8px; align-items:center;">
            <span>${u}</span><span style="cursor:pointer; font-weight:bold; color:var(--danger);" onclick="deleteItem('units', ${i})">×</span>
        </div>`).join('');

    populateDropdown('new-caliber-unit', data.units);

    const calList = document.getElementById('caliber-list-mgmt');
    calList.innerHTML = data.calibers.map((c, i) => `
        <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #333; align-items:center;">
            <span><strong>${c.unit}</strong>: ${c.name}</span>
            <button class="secondary" style="padding:2px 8px;" onclick="deleteItem('calibers', ${i})">×</button>
        </div>`).join('');
}

function toggleBoltField() {
    const type = document.getElementById('modal-gun-type').value;
    const boltContainer = document.getElementById('bolt-interval-container');
    if (boltContainer) boltContainer.style.display = type === 'Rifle' ? 'block' : 'none';
}

function openAddGunModal() {
    populateDropdown('modal-gun-make', data.manufacturers);
    populateDropdown('modal-gun-caliber', data.calibers.map(getCaliberFullName));
    document.getElementById('gun-modal-title').innerText = 'Add New Firearm';
    document.getElementById('edit-gun-id').value = '';
    document.getElementById('modal-gun-type').value = 'Rifle';
    document.getElementById('modal-gun-model').value = '';
    document.getElementById('modal-gun-sku').value = '';
    document.getElementById('modal-gun-serial').value = '';
    document.getElementById('modal-gun-interval').value = '500';
    document.getElementById('modal-gun-bolt-interval').value = '1000';
    document.getElementById('modal-gun-status').value = 'Ready';
    toggleBoltField();
    openModal('gun-modal');
}

function saveGun() {
    const type = document.getElementById('modal-gun-type').value;
    const manufacturer = document.getElementById('modal-gun-make').value;
    const model = document.getElementById('modal-gun-model').value;
    const caliber = document.getElementById('modal-gun-caliber').value;
    const sku = document.getElementById('modal-gun-sku').value;
    const serial = document.getElementById('modal-gun-serial').value;
    const interval = parseInt(document.getElementById('modal-gun-interval').value);
    const boltInterval = parseInt(document.getElementById('modal-gun-bolt-interval').value);
    const status = document.getElementById('modal-gun-status').value;
    const editId = document.getElementById('edit-gun-id').value;
    if (!manufacturer || !caliber) return alert('Manufacturer and Caliber required');
    if (editId) {
        const gun = data.guns.find(g => g.id === editId);
        Object.assign(gun, { type, manufacturer, model, caliber, sku, serial, cleanInterval: interval, boltCleanInterval: boltInterval, status });
    } else {
        data.guns.push({ id: generateId(), type, manufacturer, model, caliber, sku, serial, rounds: 0, lastService: 0, lastBoltService: 0, cleanInterval: interval, boltCleanInterval: boltInterval, status });
    }
    closeModal('gun-modal');
    save();
}

function editGun(id) {
    const gun = data.guns.find(g => g.id === id);
    if (!gun) return;
    populateDropdown('modal-gun-make', data.manufacturers, gun.manufacturer);
    populateDropdown('modal-gun-caliber', data.calibers.map(getCaliberFullName), gun.caliber);
    document.getElementById('gun-modal-title').innerText = 'Edit Firearm';
    document.getElementById('edit-gun-id').value = gun.id;
    document.getElementById('modal-gun-type').value = gun.type || 'Rifle';
    document.getElementById('modal-gun-model').value = gun.model;
    document.getElementById('modal-gun-sku').value = gun.sku || '';
    document.getElementById('modal-gun-serial').value = gun.serial;
    document.getElementById('modal-gun-interval').value = gun.cleanInterval;
    document.getElementById('modal-gun-bolt-interval').value = gun.boltCleanInterval || 1000;
    document.getElementById('modal-gun-status').value = gun.status;
    toggleBoltField();
    openModal('gun-modal');
}

function deleteGun(id) {
    if (confirm('Are you sure?')) { data.guns = data.guns.filter(g => g.id !== id); save(); }
}

function openAddSuppressorModal() {
    populateDropdown('modal-suppressor-make', data.manufacturers);
    populateCheckboxList('modal-suppressor-calibers-list', data.calibers.map(getCaliberFullName));
    openModal('suppressor-modal');
}

function saveSuppressor() {
    const manufacturer = document.getElementById('modal-suppressor-make').value;
    const model = document.getElementById('modal-suppressor-model').value;
    const sku = document.getElementById('modal-suppressor-sku').value;
    const serial = document.getElementById('modal-suppressor-serial').value;
    const interval = parseInt(document.getElementById('modal-suppressor-interval').value);
    const status = document.getElementById('modal-suppressor-status').value;
    const editId = document.getElementById('edit-suppressor-id').value;
    const calibers = Array.from(document.querySelectorAll('#modal-suppressor-calibers-list input:checked')).map(cb => cb.value);
    if (editId) {
        const sup = data.suppressors.find(s => s.id === editId);
        Object.assign(sup, { manufacturer, model, sku, calibers, serial, cleanInterval: interval, status });
    } else {
        data.suppressors.push({ id: generateId(), manufacturer, model, sku, calibers, serial, rounds: 0, lastService: 0, cleanInterval: interval, status });
    }
    closeModal('suppressor-modal');
    save();
}

function editSuppressor(id) {
    const sup = data.suppressors.find(s => s.id === id);
    if (!sup) return;
    populateDropdown('modal-suppressor-make', data.manufacturers, sup.manufacturer);
    populateCheckboxList('modal-suppressor-calibers-list', data.calibers.map(getCaliberFullName), sup.calibers || []);
    document.getElementById('edit-suppressor-id').value = sup.id;
    document.getElementById('modal-suppressor-model').value = sup.model;
    document.getElementById('modal-suppressor-sku').value = sup.sku || '';
    document.getElementById('modal-suppressor-serial').value = sup.serial;
    document.getElementById('modal-suppressor-interval').value = sup.cleanInterval;
    document.getElementById('modal-suppressor-status').value = sup.status;
    openModal('suppressor-modal');
}

function deleteSuppressor(id) {
    if (confirm('Are you sure?')) { data.suppressors = data.suppressors.filter(s => s.id !== id); save(); }
}

function editAmmo(caliber) {
    const info = data.ammo[caliber];
    if (!info) return;
    populateDropdown('modal-ammo-caliber', data.calibers.map(getCaliberFullName), caliber);
    document.getElementById('modal-ammo-qty').value = '0';
    document.getElementById('modal-ammo-min').value = info.minStock;
    openModal('ammo-modal');
}

function openAmmoModal() {
    populateDropdown('modal-ammo-caliber', data.calibers.map(getCaliberFullName));
    document.getElementById('modal-ammo-qty').value = '';
    openModal('ammo-modal');
}

function saveAmmo() {
    const caliber = document.getElementById('modal-ammo-caliber').value;
    const qty = parseInt(document.getElementById('modal-ammo-qty').value) || 0;
    const min = parseInt(document.getElementById('modal-ammo-min').value) || 0;
    if (!caliber) return;
    if (!data.ammo[caliber]) data.ammo[caliber] = { qty: 0, minStock: min };
    data.ammo[caliber].qty += qty;
    data.ammo[caliber].minStock = min;
    closeModal('ammo-modal');
    save();
}

function openSessionModal(gunId) {
    const gun = data.guns.find(g => g.id === gunId);
    if (!gun) return;
    document.getElementById('session-gun-id').value = gunId;
    document.getElementById('session-gun-name').innerText = `${gun.manufacturer} ${gun.model}`;
    document.getElementById('session-date').valueAsDate = new Date();
    populateDropdown('session-caliber', data.calibers.map(getCaliberFullName), gun.caliber);
    const validSups = data.suppressors.filter(s => !gun.caliber || (s.calibers || []).includes(gun.caliber));
    const supSelect = document.getElementById('session-suppressor');
    supSelect.innerHTML = '<option value="">None</option>' + validSups.map(s => `<option value="${s.id}">${s.manufacturer} ${s.model}</option>`).join('');
    openModal('session-modal');
}

function submitSession() {
    const gunId = document.getElementById('session-gun-id').value;
    const count = parseInt(document.getElementById('session-rounds').value);
    const cal = document.getElementById('session-caliber').value;
    const supId = document.getElementById('session-suppressor').value;
    const date = document.getElementById('session-date').value;
    if (isNaN(count) || count <= 0 || !date) return alert('Valid count and date required');

    const gun = data.guns.find(g => g.id === gunId);
    if (data.ammo[cal]) {
        if (data.ammo[cal].qty < count && !confirm('Low stock. Log anyway?')) return;
        data.ammo[cal].qty -= count;
    }
    gun.rounds += count;
    let supName = '';
    if (supId) {
        const sup = data.suppressors.find(s => s.id === supId);
        if (sup) { sup.rounds += count; supName = `${sup.manufacturer} ${sup.model}`; }
    }
    data.history.push({ id: generateId(), date, gun: `${gun.manufacturer} ${gun.model}`, gunId, caliber: cal, rounds: count, suppressor: supName, suppressorId: supId });
    data.history.sort((a, b) => new Date(b.date) - new Date(a.date));
    closeModal('session-modal');
    save();
}

function sortTable(column) {
    if (tableSort.column === column) tableSort.direction = tableSort.direction === 'asc' ? 'desc' : 'asc';
    else { tableSort.column = column; tableSort.direction = 'asc'; }
    renderDataTable();
}

function renderDataTable() {
    const query = document.getElementById('table-search').value.toLowerCase();
    const filteredGuns = data.guns.filter(g => `${g.manufacturer} ${g.model} ${g.caliber} ${g.sku} ${g.serial} ${g.status} ${g.type}`.toLowerCase().includes(query));
    filteredGuns.sort((a, b) => {
        let vA = a[tableSort.column], vB = b[tableSort.column];
        if (typeof vA === 'string') { vA = vA.toLowerCase(); vB = vB.toLowerCase(); }
        return vA < vB ? (tableSort.direction === 'asc' ? -1 : 1) : (vA > vB ? (tableSort.direction === 'asc' ? 1 : -1) : 0);
    });
    document.getElementById('table-body').innerHTML = filteredGuns.map(gun => `
        <tr style="cursor:pointer" onclick="openGunDetails('${gun.id}')">
            <td>${gun.manufacturer}</td><td>${gun.model}</td><td>${gun.type}</td><td>${gun.caliber}</td><td>${gun.sku}</td><td>${gun.serial || 'N/A'}</td><td>${gun.rounds}</td><td>${gun.cleanInterval}</td><td>${gun.status}</td>
        </tr>`).join('');
}

function render() {
    const gunQuery = (document.getElementById('gun-search')?.value || '').toLowerCase();
    const supQuery = (document.getElementById('suppressor-search')?.value || '').toLowerCase();
    const ammoQuery = (document.getElementById('ammo-search')?.value || '').toLowerCase();
    if (document.getElementById('settings').classList.contains('active')) renderSettings();
    if (document.getElementById('datatable').classList.contains('active')) renderDataTable();
    
    document.getElementById('gun-list').innerHTML = data.guns.filter(g => `${g.manufacturer} ${g.model}`.toLowerCase().includes(gunQuery)).map(gun => {
        const roundsSinceClean = gun.rounds - gun.lastService;
        const needsClean = roundsSinceClean >= gun.cleanInterval;
        let maintenanceHtml = `Total: ${gun.rounds} | Barrel: ${roundsSinceClean} / ${gun.cleanInterval}<br>`;
        let buttonHtml = `<button onclick="event.stopPropagation(); openSessionModal('${gun.id}')">Log Session</button>
                          <button class="secondary" onclick="event.stopPropagation(); openMaintenanceModal('${gun.id}', 'Barrel')">Barrel Cleaned</button>`;
        if (gun.type === 'Rifle') {
            const roundsSinceBoltClean = gun.rounds - (gun.lastBoltService || 0);
            maintenanceHtml += `Bolt: ${roundsSinceBoltClean} / ${gun.boltCleanInterval || 1000}<br>`;
            if (roundsSinceBoltClean >= gun.boltCleanInterval) maintenanceHtml += '<span class="warning-text">⚠ BOLT NEEDS CLEANING</span><br>';
            buttonHtml += `<button class="secondary" onclick="event.stopPropagation(); openMaintenanceModal('${gun.id}', 'Bolt')">Bolt Cleaned</button>`;
        }
        return `<div class="item-card ${needsClean ? 'warning' : ''}" style="cursor:pointer" onclick="openGunDetails('${gun.id}')">
                    <strong>${gun.manufacturer} ${gun.model} (${gun.type})</strong>
                    <div class="stats">Caliber: ${gun.caliber} | SN: ${gun.serial || 'N/A'}<br>${maintenanceHtml}Status: <span style="color: var(--accent)">${gun.status}</span></div>
                    ${needsClean ? '<div class="warning-text">⚠ BARREL NEEDS CLEANING</div>' : ''}
                    <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:5px;">
                        ${buttonHtml}<button class="secondary" onclick="event.stopPropagation(); showTrend('${gun.id}')">📈</button><button class="secondary" onclick="event.stopPropagation(); editGun('${gun.id}')">✎</button>
                    </div>
                </div>`;
    }).join('');

    document.getElementById('suppressor-list').innerHTML = data.suppressors.filter(s => `${s.manufacturer} ${s.model}`.toLowerCase().includes(supQuery)).map(sup => {
        const needsClean = (sup.rounds - sup.lastService) >= sup.cleanInterval;
        return `<div class="item-card ${needsClean ? 'warning' : ''}">
                    <strong>${sup.manufacturer} ${sup.model}</strong>
                    <div class="stats">Calibers: ${(sup.calibers || []).join(', ')}<br>SN: ${sup.serial || 'N/A'}<br>Total: ${sup.rounds} | Since Clean: ${sup.rounds - sup.lastService} / ${sup.cleanInterval}<br>Status: <span style="color: var(--accent)">${sup.status}</span></div>
                    ${needsClean ? '<div class="warning-text">⚠ NEEDS CLEANING</div>' : ''}
                    <div style="margin-top:10px; display:flex; gap:5px;">
                        <button class="secondary" onclick="data.suppressors.find(s => s.id === '${sup.id}').lastService=${sup.rounds}; save();">Cleaned</button><button class="secondary" onclick="editSuppressor('${sup.id}')">✎</button><button class="secondary" onclick="deleteSuppressor('${sup.id}')">🗑</button>
                    </div>
                </div>`;
    }).join('');

    document.getElementById('ammo-list').innerHTML = Object.entries(data.ammo).filter(([cal]) => cal.toLowerCase().includes(ammoQuery)).map(([cal, info]) => {
        const low = info.qty <= info.minStock;
        return `<div class="item-card ${low ? 'warning' : ''}" style="cursor:pointer" onclick="editAmmo('${cal}')">
                    <strong>${cal}</strong><div class="stats">In Stock: <span style="font-weight:bold; font-size:1.2em">${info.qty}</span><br>Min Alert: ${info.minStock}</div>
                    ${low ? '<div class="warning-text">⚠ LOW STOCK</div>' : ''}
                </div>`;
    }).join('');

    const historyBody = document.getElementById('history-list');
    if (historyBody) historyBody.innerHTML = data.history.slice(0, 50).map(entry => `<tr style="cursor:pointer" onclick="openEditSessionModal('${entry.id}')"><td>${entry.date}</td><td>${entry.gun}</td><td>${entry.caliber}</td><td>${entry.rounds}</td></tr>`).join('');
    updateGlobalStats();
}

function updateGlobalStats() {
    const statDiv = document.getElementById('global-stats');
    if (!statDiv) return;
    statDiv.innerText = `${data.guns.length} Firearms | ${data.guns.reduce((acc, g) => acc + g.rounds, 0)} Total Rounds Fired`;
}

function updateCharts() {
    const ctxRounds = document.getElementById('roundsChart')?.getContext('2d');
    const ctxAmmo = document.getElementById('ammoChart')?.getContext('2d');
    const ctxUsage = document.getElementById('usageChart')?.getContext('2d');
    if (!ctxRounds || !ctxAmmo || !ctxUsage) return;
    if (charts.rounds) charts.rounds.destroy();
    if (charts.ammo) charts.ammo.destroy();
    if (charts.usage) charts.usage.destroy();
    charts.rounds = new Chart(ctxRounds, { type: 'bar', data: { labels: data.guns.map(g => `${g.manufacturer} ${g.model}`), datasets: [{ label: 'Total Rounds', data: data.guns.map(g => g.rounds), backgroundColor: '#cfb53b' }] }, options: { plugins: { legend: { display: false } } } });
    charts.ammo = new Chart(ctxAmmo, { type: 'doughnut', data: { labels: Object.keys(data.ammo), datasets: [{ data: Object.values(data.ammo).map(a => a.qty), backgroundColor: ['#cfb53b', '#555', '#888', '#aaa', '#03dac6'] }] } });
    const usageData = {};
    data.history.forEach(session => { usageData[session.caliber] = (usageData[session.caliber] || 0) + session.rounds; });
    charts.usage = new Chart(ctxUsage, { type: 'bar', data: { labels: Object.keys(usageData), datasets: [{ label: 'Rounds Fired', data: Object.values(usageData), backgroundColor: '#cf6679' }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } } } });
}

function showTrend(gunId) {
    const gun = data.guns.find(g => g.id === gunId);
    if (!gun) return;
    document.getElementById('trend-title').innerText = `${gun.manufacturer} ${gun.model} - Round Count Over Time`;
    openModal('trend-modal');
    
    const gunHistory = data.history.filter(h => h.gunId === gunId).sort((a, b) => new Date(a.date) - new Date(b.date));
    const maintHistory = data.maintenance.filter(m => m.gunId === gunId).sort((a, b) => new Date(a.date) - new Date(b.date));

    let cumulative = 0;
    const labels = ['Start'];
    const points = [0];
    const annotations = [];

    gunHistory.forEach(h => {
        cumulative += h.rounds;
        labels.push(h.date);
        points.push(cumulative);
    });

    // Add vertical lines for maintenance
    maintHistory.forEach(m => {
        // Calculate cumulative rounds at the time of maintenance
        const roundsAtTime = data.history
            .filter(h => h.gunId === gunId && new Date(h.date) <= new Date(m.date))
            .reduce((sum, h) => sum + h.rounds, 0);

        annotations.push({
            type: 'line',
            mode: 'vertical',
            scaleID: 'x',
            value: m.date,
            borderColor: '#cf6679',
            borderWidth: 2,
            label: {
                content: `${m.type} Clean`,
                enabled: true,
                position: 'top',
                backgroundColor: 'rgba(207, 102, 121, 0.8)',
                font: { size: 10 }
            }
        });
    });

    const ctx = document.getElementById('trendChart').getContext('2d');
    if (charts.trend) charts.trend.destroy();
    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative Rounds',
                data: points,
                borderColor: '#cfb53b',
                backgroundColor: 'rgba(207, 181, 59, 0.1)',
                fill: true,
                tension: 0.1,
                pointRadius: 4,
                pointBackgroundColor: (context) => {
                    const date = context.chart.data.labels[context.dataIndex];
                    return maintHistory.some(m => m.date === date) ? '#cf6679' : '#cfb53b';
                },
                pointBorderColor: (context) => {
                    const date = context.chart.data.labels[context.dataIndex];
                    return maintHistory.some(m => m.date === date) ? '#fff' : '#cfb53b';
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: (context) => {
                            const date = context.label;
                            const maints = maintHistory.filter(m => m.date === date);
                            return maints.length > 0 ? maints.map(m => `Maintenance: ${m.type}`).join('\n') : '';
                        }
                    }
                }
            }
        }
    });
}
load();
