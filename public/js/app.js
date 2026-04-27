const API_URL = '/api/data';
let data = { guns: [], suppressors: [], optics: [], ammo: {}, history: [], gunManufacturers: [], suppressorManufacturers: [], opticManufacturers: [], calibers: [], units: [], maintenance: [] };
let charts = {};
let tableSort = { column: 'manufacturer', direction: 'asc' };
let collapsedGroups = {};

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
        optics: oldData.optics || [],
        ammo: {},
        history: oldData.history || [],
        maintenance: oldData.maintenance || [],
        gunManufacturers: oldData.gunManufacturers || [],
        suppressorManufacturers: oldData.suppressorManufacturers || [],
        opticManufacturers: oldData.opticManufacturers || [],
        calibers: [],
        units: oldData.units || ['mm', 'Caliber', 'ga']
    };

    data.units = newData.units;

    // Aggressive ID migration
    newData.history = newData.history.map(h => ({ ...h, id: h.id || generateId() }));
    newData.maintenance = newData.maintenance.map(m => ({ ...m, id: m.id || generateId() }));

    newData.guns = newData.guns.map(gun => ({
        ...gun,
        id: gun.id || generateId(),
        caliber: getCaliberFullName(gun.caliber),
        sku: gun.sku || '',
        type: gun.type || 'Rifle',
        rounds: gun.rounds || 0,
        initialRounds: gun.initialRounds || 0,
        purchaseDate: gun.purchaseDate || '',
        purchaseCost: gun.purchaseCost || 0,
        lastService: Math.min(gun.lastService || 0, (gun.initialRounds || 0) + (gun.rounds || 0)),
        lastBoltService: Math.min(gun.lastBoltService || gun.lastService || 0, (gun.initialRounds || 0) + (gun.rounds || 0)),
        serial: gun.serial || '',
        cleanInterval: gun.cleanInterval || 500,
        boltCleanInterval: gun.boltCleanInterval || 1000,
        status: gun.status || 'Ready'
    }));

    newData.suppressors = newData.suppressors.map(sup => ({
        ...sup,
        id: sup.id || generateId(),
        sku: sup.sku || '',
        calibers: (sup.calibers || []).map(getCaliberFullName).filter(c => c !== 'Unknown'),
        rounds: sup.rounds || 0,
        purchaseDate: sup.purchaseDate || '',
        purchaseCost: sup.purchaseCost || 0,
        lastService: Math.min(sup.lastService || 0, sup.rounds || 0),
        serial: sup.serial || '',
        cleanInterval: sup.cleanInterval || 1000,
        status: sup.status || 'Ready'
    }));

    newData.optics = newData.optics.map(opt => ({
        ...opt,
        id: opt.id || generateId(),
        sku: opt.sku || '',
        serial: opt.serial || '',
        purchaseDate: opt.purchaseDate || '',
        purchaseCost: opt.purchaseCost || 0,
        batteryType: opt.batteryType || '',
        lastChecked: opt.lastChecked || '',
        lastChanged: opt.lastChanged || '',
        status: opt.status || 'Ready'
    }));

    if (oldData.ammo) {
        Object.entries(oldData.ammo).forEach(([cal, val]) => {
            const cleanCal = getCaliberFullName(cal);
            if (cleanCal === 'Unknown') return;
            newData.ammo[cleanCal] = typeof val === 'number' ? { qty: val, minStock: 100 } : val;
        });
    }

    // Auto-populate manufacturers from existing data
    const gunManSet = new Set(newData.gunManufacturers);
    const supManSet = new Set(newData.suppressorManufacturers);
    const optManSet = new Set(newData.opticManufacturers);
    
    // Add old global manufacturers to all as fallback
    if (oldData.manufacturers) {
        oldData.manufacturers.forEach(m => {
            if (m && m !== 'undefined' && m !== 'null') {
                gunManSet.add(m);
                supManSet.add(m);
                optManSet.add(m);
            }
        });
    }

    newData.guns.forEach(g => { if (g.manufacturer && g.manufacturer !== 'undefined') gunManSet.add(g.manufacturer); });
    newData.suppressors.forEach(s => { if (s.manufacturer && s.manufacturer !== 'undefined') supManSet.add(s.manufacturer); });
    newData.optics.forEach(o => { if (o.manufacturer && o.manufacturer !== 'undefined') optManSet.add(o.manufacturer); });

    newData.gunManufacturers = Array.from(gunManSet).sort();
    newData.suppressorManufacturers = Array.from(supManSet).sort();
    newData.opticManufacturers = Array.from(optManSet).sort();

    const caliberSet = new Set();
    const tempCalibers = (oldData.calibers || []).map(parseCaliber);
    newData.guns.forEach(g => { const p = parseCaliber(g.caliber); if (p.name !== 'Unknown') caliberSet.add(JSON.stringify(p)); });
    newData.suppressors.forEach(s => (s.calibers || []).forEach(c => { const p = parseCaliber(c); if (p.name !== 'Unknown') caliberSet.add(JSON.stringify(p)); }));
    Object.keys(newData.ammo).forEach(c => { const p = parseCaliber(c); if (p.name !== 'Unknown') caliberSet.add(JSON.stringify(p)); });
    tempCalibers.forEach(c => { if (c.name !== 'Unknown') caliberSet.add(JSON.stringify(c)); });

    newData.calibers = Array.from(caliberSet).map(s => JSON.parse(s)).sort((a,b) => a.name.localeCompare(b.name));

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
    const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(`'${tabId}'`));
    if (btn) btn.classList.add('active');
    document.getElementById(tabId).classList.add('active');
    if (tabId === 'dashboard' || tabId === 'ammodashboard') updateCharts();
    if (tabId === 'datatable') renderDataTable();
    if (tabId === 'settings') renderSettings();
}

function toggleGroup(type) {
    collapsedGroups[type] = !collapsedGroups[type];
    render();
}

function openModal(id) { 
    const el = document.getElementById(id);
    if (el) el.style.display = 'block';
}

function closeModal(id) { 
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
    if (id === 'gun-modal') { document.getElementById('edit-gun-id').value = ''; document.getElementById('gun-modal-title').innerText = 'Add New Firearm'; }
    if (id === 'suppressor-modal') { document.getElementById('edit-suppressor-id').value = ''; document.getElementById('suppressor-modal-title').innerText = 'Add New Suppressor'; }
    if (id === 'optic-modal') { document.getElementById('edit-optic-id').value = ''; document.getElementById('optic-modal-title').innerText = 'Add New Optic'; }
}

function populateDropdown(id, items, selectedValue = '') {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = '<option value="">-- Select --</option>' + items.map(item => `<option value="${item}" ${String(item) === String(selectedValue) ? 'selected' : ''}>${item}</option>`).join('');
}

function promptNewManufacturer(listName, selectId) {
    const name = prompt(`Enter new manufacturer name:`);
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === 'undefined') return;
    if (data[listName].includes(trimmed)) return alert('Already exists');
    
    data[listName].push(trimmed);
    data[listName].sort();
    
    populateDropdown(selectId, data[listName], trimmed);
    save();
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
    const gun = data.guns.find(g => g.id === gunId);
    document.getElementById('details-history-tab').classList.toggle('active', tab === 'history');
    document.getElementById('details-maint-tab').classList.toggle('active', tab === 'maint');
    document.getElementById('details-history-content').style.display = tab === 'history' ? 'block' : 'none';
    document.getElementById('details-maint-content').style.display = tab === 'maint' ? 'block' : 'none';

    if (tab === 'history') {
        const hist = data.history.filter(h => h.gunId === gunId).sort((a,b) => new Date(a.date) - new Date(b.date));
        let cumulative = gun.initialRounds || 0;
        const rows = hist.map(h => {
            cumulative += h.rounds;
            return `<tr style="cursor:pointer" onclick="openEditSessionModal('${h.id}')">
                <td>${h.date}</td><td>${h.caliber}</td><td>${h.rounds}</td><td>${cumulative}</td>
            </tr>`;
        });
        document.getElementById('details-history-list').innerHTML = rows.reverse().join('');
    } else {
        const maint = data.maintenance.filter(m => m.gunId === gunId).sort((a,b) => new Date(b.date) - new Date(a.date));
        const rows = maint.map(m => {
            const cumulativeAtMaint = data.history
                .filter(h => h.gunId === gunId && new Date(h.date) <= new Date(m.date))
                .reduce((sum, h) => sum + h.rounds, 0) + (gun.initialRounds || 0);
            return `<tr style="cursor:pointer" onclick="openEditMaintenanceModal('${m.id}')">
                <td>${m.date}</td><td>${m.type}</td><td>${m.roundsAtService}</td><td>${cumulativeAtMaint}</td><td>${m.notes || ''}</td>
            </tr>`;
        });
        document.getElementById('details-maint-list').innerHTML = rows.reverse().join('');
    }
}

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
    const id = document.getElementById('edit-session-id').value, session = data.history.find(h => h.id === id);
    const newDate = document.getElementById('edit-session-date').value, newRounds = parseInt(document.getElementById('edit-session-rounds').value), newCal = document.getElementById('edit-session-caliber').value;
    const roundDiff = newRounds - session.rounds;
    const gun = data.guns.find(g => g.id === session.gunId);
    if (gun) {
        gun.rounds += roundDiff;
        gun.lastService = Math.min(gun.lastService, (gun.initialRounds || 0) + gun.rounds);
        gun.lastBoltService = Math.min(gun.lastBoltService, (gun.initialRounds || 0) + gun.rounds);
    }
    if (session.suppressorId) {
        const sup = data.suppressors.find(s => s.id === session.suppressorId);
        if (sup) { sup.rounds += roundDiff; sup.lastService = Math.min(sup.lastService, sup.rounds); }
    }
    if (data.ammo[session.caliber]) data.ammo[session.caliber].qty += session.rounds;
    if (data.ammo[newCal]) data.ammo[newCal].qty -= newRounds;
    session.date = newDate; session.rounds = newRounds; session.caliber = newCal;
    data.history.sort((a,b) => new Date(b.date) - new Date(a.date));
    closeModal('edit-session-modal'); save();
}

function deleteSession() {
    const id = document.getElementById('edit-session-id').value, session = data.history.find(h => h.id === id);
    if (!confirm('Delete this session?')) return;
    const gun = data.guns.find(g => g.id === session.gunId);
    if (gun) {
        gun.rounds -= session.rounds;
        gun.lastService = Math.min(gun.lastService, (gun.initialRounds || 0) + gun.rounds);
        gun.lastBoltService = Math.min(gun.lastBoltService, (gun.initialRounds || 0) + gun.rounds);
    }
    if (session.suppressorId) {
        const sup = data.suppressors.find(s => s.id === session.suppressorId);
        if (sup) { sup.rounds -= session.rounds; sup.lastService = Math.min(sup.lastService, sup.rounds); }
    }
    if (data.ammo[session.caliber]) data.ammo[session.caliber].qty += session.rounds;
    data.history = data.history.filter(h => h.id !== id);
    closeModal('edit-session-modal'); save();
}

// Maintenance Logic
function calculateMaintenanceInterval(gunId, type, date) {
    const gun = data.guns.find(g => g.id === gunId);
    if (!gun) return 0;
    const maintHistory = data.maintenance.filter(m => m.gunId === gunId && m.type === type && new Date(m.date) < new Date(date)).sort((a, b) => new Date(b.date) - new Date(a.date));
    const lastMaintDate = maintHistory.length > 0 ? new Date(maintHistory[0].date) : null;
    let intervalRounds = data.history.filter(h => h.gunId === gunId && (!lastMaintDate || new Date(h.date) > lastMaintDate) && new Date(h.date) <= new Date(date)).reduce((sum, h) => sum + h.rounds, 0);
    if (!lastMaintDate) intervalRounds += (gun.initialRounds || 0);
    return intervalRounds;
}

function updateMaintRounds() {
    const gunId = document.getElementById('maint-gun-id').value, date = document.getElementById('maint-date').value;
    const barrelChecked = document.getElementById('maint-check-barrel')?.checked, boltChecked = document.getElementById('maint-check-bolt')?.checked;
    if (!gunId || !date) return;
    let barrelRounds = barrelChecked ? calculateMaintenanceInterval(gunId, 'Barrel', date) : 0;
    let boltRounds = boltChecked ? calculateMaintenanceInterval(gunId, 'Bolt', date) : 0;
    document.getElementById('maint-rounds').value = Math.max(barrelRounds, boltRounds);
    document.getElementById('maint-rounds-hint').innerText = (barrelChecked && boltChecked) ? `Barrel: ${barrelRounds} | Bolt: ${boltRounds}` : "";
}

function openMaintenanceModal(gunId) {
    const gun = data.guns.find(g => g.id === gunId);
    if (!gun) return;
    document.getElementById('maint-gun-id').value = gunId;
    document.getElementById('maint-check-barrel').checked = true;
    document.getElementById('maint-check-bolt-container').style.display = gun.type === 'Rifle' ? 'flex' : 'none';
    document.getElementById('maint-check-bolt').checked = (gun.type === 'Rifle');
    document.getElementById('maint-date').valueAsDate = new Date();
    document.getElementById('maint-modal-title').innerText = `Log Maintenance`;
    document.getElementById('maint-selection-label').style.display = 'block';
    document.getElementById('maint-selection-container').style.display = 'flex';
    const footer = document.querySelector('#maintenance-modal .modal-actions');
    footer.innerHTML = `<button class="secondary" onclick="closeModal('maintenance-modal')">Cancel</button><button onclick="saveMaintenance()">Log Service</button>`;
    updateMaintRounds();
    openModal('maintenance-modal');
}

function openEditMaintenanceModal(id) {
    const maint = data.maintenance.find(m => m.id === id);
    if (!maint) return;
    document.getElementById('maint-gun-id').value = maint.gunId;
    document.getElementById('maint-type').value = maint.type;
    document.getElementById('maint-date').value = maint.date;
    document.getElementById('maint-rounds').value = maint.roundsAtService;
    document.getElementById('maint-notes').value = maint.notes || '';
    document.getElementById('maint-modal-title').innerText = `Edit ${maint.type} Maintenance`;
    document.getElementById('maint-selection-label').style.display = 'none';
    document.getElementById('maint-selection-container').style.display = 'none';
    const footer = document.querySelector('#maintenance-modal .modal-actions');
    footer.innerHTML = `<button class="danger" onclick="deleteMaintenance('${id}')">Delete Record</button><div style="flex-grow:1"></div><button class="secondary" onclick="closeModal('maintenance-modal')">Cancel</button><button onclick="saveEditedMaintenance('${id}')">Save Changes</button>`;
    openModal('maintenance-modal');
}

function saveEditedMaintenance(id) {
    const maint = data.maintenance.find(m => m.id === id), date = document.getElementById('maint-date').value, notes = document.getElementById('maint-notes').value;
    if (!maint) return;
    maint.date = date; maint.notes = notes;
    maint.roundsAtService = calculateMaintenanceInterval(maint.gunId, maint.type, date);
    const gun = data.guns.find(g => g.id === maint.gunId);
    if (gun) {
        const latest = data.maintenance.filter(m => m.gunId === maint.gunId && m.type === maint.type).sort((a,b) => new Date(b.date) - new Date(a.date))[0];
        const cumulative = data.history.filter(h => h.gunId === gun.id && new Date(h.date) <= new Date(latest.date)).reduce((sum, h) => sum + h.rounds, 0);
        if (maint.type === 'Barrel') gun.lastService = (cumulative + (gun.initialRounds || 0));
        else gun.lastBoltService = (cumulative + (gun.initialRounds || 0));
    }
    closeModal('maintenance-modal'); save();
}

function deleteMaintenance(id) {
    if (!confirm('Delete this record?')) return;
    const maint = data.maintenance.find(m => m.id === id);
    if (!maint) return;
    data.maintenance = data.maintenance.filter(m => m.id !== id);
    const gun = data.guns.find(g => g.id === maint.gunId);
    if (gun) {
        const latest = data.maintenance.filter(m => m.gunId === maint.gunId && m.type === maint.type).sort((a,b) => new Date(b.date) - new Date(a.date))[0];
        if (latest) {
            const cumulative = data.history.filter(h => h.gunId === gun.id && new Date(h.date) <= new Date(latest.date)).reduce((sum, h) => sum + h.rounds, 0);
            if (maint.type === 'Barrel') gun.lastService = (cumulative + (gun.initialRounds || 0)); else gun.lastBoltService = (cumulative + (gun.initialRounds || 0));
        } else { if (maint.type === 'Barrel') gun.lastService = gun.initialRounds || 0; else gun.lastBoltService = gun.initialRounds || 0; }
    }
    closeModal('maintenance-modal'); save();
}

function saveMaintenance() {
    const gunId = document.getElementById('maint-gun-id').value, date = document.getElementById('maint-date').value, notes = document.getElementById('maint-notes').value;
    const barrelChecked = document.getElementById('maint-check-barrel').checked, boltChecked = document.getElementById('maint-check-bolt').checked;
    const gun = data.guns.find(g => g.id === gunId);
    if (!gun) return;
    if (barrelChecked) {
        const rounds = calculateMaintenanceInterval(gunId, 'Barrel', date);
        data.maintenance.push({ id: generateId(), gunId, type: 'Barrel', date, roundsAtService: rounds, notes });
        const cumulative = data.history.filter(h => h.gunId === gunId && new Date(h.date) <= new Date(date)).reduce((sum, h) => sum + h.rounds, 0);
        gun.lastService = cumulative + (gun.initialRounds || 0);
    }
    if (boltChecked) {
        const rounds = calculateMaintenanceInterval(gunId, 'Bolt', date);
        data.maintenance.push({ id: generateId(), gunId, type: 'Bolt', date, roundsAtService: rounds, notes });
        const cumulative = data.history.filter(h => h.gunId === gunId && new Date(h.date) <= new Date(date)).reduce((sum, h) => sum + h.rounds, 0);
        gun.lastBoltService = cumulative + (gun.initialRounds || 0);
    }
    closeModal('maintenance-modal'); save();
}

// Optic Logic
function toggleGunAdvanced() {
    const section = document.getElementById('gun-advanced-section');
    const icon = document.getElementById('gun-advanced-icon');
    const isHidden = section.style.display === 'none';
    section.style.display = isHidden ? 'block' : 'none';
    icon.innerText = isHidden ? '▲' : '▼';
}

function toggleSuppressorAdvanced() {
    const section = document.getElementById('suppressor-advanced-section');
    const icon = document.getElementById('suppressor-advanced-icon');
    const isHidden = section.style.display === 'none';
    section.style.display = isHidden ? 'block' : 'none';
    icon.innerText = isHidden ? '▲' : '▼';
}

function toggleOpticAdvanced() {
    const section = document.getElementById('optic-advanced-section');
    const icon = document.getElementById('optic-advanced-icon');
    const isHidden = section.style.display === 'none';
    section.style.display = isHidden ? 'block' : 'none';
    icon.innerText = isHidden ? '▲' : '▼';
}

function toggleOpticBattery() {
    const hasBattery = document.getElementById('modal-optic-has-battery').checked;
    document.getElementById('optic-battery-section').style.display = hasBattery ? 'block' : 'none';
}

function openAddOpticModal() {
    populateDropdown('modal-optic-make', data.opticManufacturers);
    document.getElementById('optic-modal-title').innerText = 'Add New Optic';
    document.getElementById('edit-optic-id').value = '';
    document.getElementById('modal-optic-model').value = '';
    document.getElementById('modal-optic-sku').value = '';
    document.getElementById('modal-optic-serial').value = '';
    document.getElementById('modal-optic-purchased').value = '';
    document.getElementById('modal-optic-cost').value = '0';
    document.getElementById('modal-optic-has-battery').checked = false;
    document.getElementById('modal-optic-battery').value = '';
    document.getElementById('modal-optic-last-checked').valueAsDate = new Date();
    document.getElementById('modal-optic-last-changed').valueAsDate = new Date();
    document.getElementById('modal-optic-status').value = 'Ready';
    document.getElementById('optic-advanced-section').style.display = 'none';
    document.getElementById('optic-advanced-icon').innerText = '▼';
    toggleOpticBattery();
    openModal('optic-modal');
}

function saveOptic() {
    const manufacturer = document.getElementById('modal-optic-make').value, model = document.getElementById('modal-optic-model').value, sku = document.getElementById('modal-optic-sku').value, serial = document.getElementById('modal-optic-serial').value, purchased = document.getElementById('modal-optic-purchased').value, cost = parseFloat(document.getElementById('modal-optic-cost').value) || 0, hasBattery = document.getElementById('modal-optic-has-battery').checked, batteryType = hasBattery ? document.getElementById('modal-optic-battery').value : '', lastChecked = hasBattery ? document.getElementById('modal-optic-last-checked').value : '', lastChanged = hasBattery ? document.getElementById('modal-optic-last-changed').value : '', status = document.getElementById('modal-optic-status').value, editId = document.getElementById('edit-optic-id').value;
    if (!manufacturer || !model) return alert('Manufacturer and Model required');
    const opticData = { manufacturer, model, sku, serial, purchaseDate: purchased, purchaseCost: cost, batteryType, lastChecked, lastChanged, status };
    if (editId) { const opt = data.optics.find(o => o.id === editId); Object.assign(opt, opticData); }
    else { data.optics.push({ id: generateId(), ...opticData }); }
    closeModal('optic-modal'); save();
}

function editOptic(id) {
    const opt = data.optics.find(o => o.id === id); if (!opt) return;
    populateDropdown('modal-optic-make', data.opticManufacturers, opt.manufacturer);
    document.getElementById('optic-modal-title').innerText = 'Edit Optic';
    document.getElementById('edit-optic-id').value = opt.id;
    document.getElementById('modal-optic-model').value = opt.model;
    document.getElementById('modal-optic-sku').value = opt.sku || '';
    document.getElementById('modal-optic-serial').value = opt.serial || '';
    document.getElementById('modal-optic-purchased').value = opt.purchaseDate || '';
    document.getElementById('modal-optic-cost').value = opt.purchaseCost || 0;
    const hasBattery = !!opt.batteryType;
    document.getElementById('modal-optic-has-battery').checked = hasBattery;
    document.getElementById('modal-optic-battery').value = opt.batteryType || '';
    document.getElementById('modal-optic-last-checked').value = opt.lastChecked || '';
    document.getElementById('modal-optic-last-changed').value = opt.lastChanged || '';
    document.getElementById('modal-optic-status').value = opt.status;
    document.getElementById('optic-advanced-section').style.display = (opt.sku || opt.serial || opt.purchaseDate || opt.purchaseCost) ? 'block' : 'none';
    document.getElementById('optic-advanced-icon').innerText = (opt.sku || opt.serial || opt.purchaseDate || opt.purchaseCost) ? '▲' : '▼';
    toggleOpticBattery(); openModal('optic-modal');
}

function deleteOptic(id) { if (confirm('Are you sure?')) { data.optics = data.optics.filter(o => o.id !== id); save(); } }
function checkBattery(id) { const opt = data.optics.find(o => o.id === id); if (opt) { opt.lastChecked = new Date().toISOString().split('T')[0]; save(); } }
function changeBattery(id) { const opt = data.optics.find(o => o.id === id); if (opt) { const today = new Date().toISOString().split('T')[0]; opt.lastChecked = today; opt.lastChanged = today; save(); } }

// CRUD Logic (Other)
function addCaliberItem() {
    const unit = document.getElementById('new-caliber-unit').value, name = document.getElementById('new-caliber-name').value.trim();
    if (!unit || !name) return alert('Select unit and enter name');
    if (data.calibers.find(c => c.name === name && c.unit === unit)) return alert('Already exists');
    data.calibers.push({ name, unit }); data.calibers.sort((a,b) => a.name.localeCompare(b.name));
    document.getElementById('new-caliber-name').value = ''; save();
}

function addItem(type, inputId) {
    const val = document.getElementById(inputId).value.trim();
    if (!val || val === 'undefined') return;
    if (data[type].includes(val)) return alert('Already exists');
    data[type].push(val); data[type].sort(); document.getElementById(inputId).value = ''; save();
}

function deleteItem(type, index) {
    const itemValue = data[type][index];
    
    // Check if manufacturer is in use before deleting
    if (['gunManufacturers', 'suppressorManufacturers', 'opticManufacturers'].includes(type)) {
        let inUse = false;
        if (type === 'gunManufacturers') inUse = data.guns.some(g => g.manufacturer === itemValue);
        if (type === 'suppressorManufacturers') inUse = data.suppressors.some(s => s.manufacturer === itemValue);
        if (type === 'opticManufacturers') inUse = data.optics.some(o => o.manufacturer === itemValue);
        
        if (inUse) {
            if (!confirm(`Warning: "${itemValue}" is currently used by one or more items. Deleting it will leave those items with a missing manufacturer. Proceed?`)) {
                return;
            }
        }
    }

    if (confirm(`Remove this ${type.slice(0, -1)}?`)) {
        data[type].splice(index, 1);
        save();
    }
}

function renderSettings() {
    // Render individual lists
    const map = {
        'man-list-gun': 'gunManufacturers',
        'man-list-sup': 'suppressorManufacturers',
        'man-list-opt': 'opticManufacturers'
    };

    Object.entries(map).forEach(([elId, dataKey]) => {
        const el = document.getElementById(elId);
        if (!el) return;
        el.innerHTML = data[dataKey].map((m, i) => `
            <div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #333; align-items:center;">
                <span>${m}</span>
                <button class="secondary" style="padding:0 5px; background:transparent;" onclick="deleteItem('${dataKey}', ${i})">×</button>
            </div>
        `).join('');
    });

    const unitList = document.getElementById('unit-list-mgmt');
    if (unitList) {
        unitList.innerHTML = data.units.map((u, i) => `
            <div style="background:#444; padding:5px 10px; border-radius:15px; display:flex; gap:8px; align-items:center; margin:2px;">
                <span>${u}</span><span style="cursor:pointer; font-weight:bold; color:var(--danger);" onclick="deleteItem('units', ${i})">×</span>
            </div>`).join('');
    }

    populateDropdown('new-caliber-unit', data.units);

    const calList = document.getElementById('caliber-list-mgmt');
    if (calList) {
        calList.innerHTML = data.calibers.map((c, i) => `
            <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #333; align-items:center;">
                <span><strong>${c.unit}</strong>: ${c.name}</span>
                <button class="secondary" style="padding:2px 8px;" onclick="deleteItem('calibers', ${i})">×</button>
            </div>`).join('');
    }
}

function toggleBoltField() {
    const type = document.getElementById('modal-gun-type').value, boltContainer = document.getElementById('bolt-interval-container');
    if (boltContainer) boltContainer.style.display = type === 'Rifle' ? 'block' : 'none';
}

function populateCheckboxList(containerId, items, selectedItems = []) {
    const container = document.getElementById(containerId); if (!container) return;
    container.innerHTML = items.map(item => `<div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;"><input type="checkbox" value="${item}" ${selectedItems.includes(item) ? 'checked' : ''} style="width:auto; margin:0"><span>${item}</span></div>`).join('');
}

function openAddGunModal() {
    populateDropdown('modal-gun-make', data.gunManufacturers); populateDropdown('modal-gun-caliber', data.calibers.map(getCaliberFullName));
    document.getElementById('gun-modal-title').innerText = 'Add New Firearm'; document.getElementById('edit-gun-id').value = '';
    document.getElementById('modal-gun-type').value = 'Rifle'; document.getElementById('modal-gun-model').value = '';
    document.getElementById('modal-gun-sku').value = ''; document.getElementById('modal-gun-serial').value = '';
    document.getElementById('modal-gun-initial-rounds').value = '0';
    document.getElementById('modal-gun-purchased').value = '';
    document.getElementById('modal-gun-cost').value = '0';
    document.getElementById('modal-gun-interval').value = '500'; document.getElementById('modal-gun-bolt-interval').value = '1000';
    document.getElementById('modal-gun-status').value = 'Ready';
    document.getElementById('gun-advanced-section').style.display = 'none';
    document.getElementById('gun-advanced-icon').innerText = '▼';
    toggleBoltField(); openModal('gun-modal');
}

function saveGun() {
    const type = document.getElementById('modal-gun-type').value, manufacturer = document.getElementById('modal-gun-make').value, model = document.getElementById('modal-gun-model').value, caliber = document.getElementById('modal-gun-caliber').value, sku = document.getElementById('modal-gun-sku').value, serial = document.getElementById('modal-gun-serial').value, initialRounds = parseInt(document.getElementById('modal-gun-initial-rounds').value) || 0, purchased = document.getElementById('modal-gun-purchased').value, cost = parseFloat(document.getElementById('modal-gun-cost').value) || 0, interval = parseInt(document.getElementById('modal-gun-interval').value), boltInterval = parseInt(document.getElementById('modal-gun-bolt-interval').value), status = document.getElementById('modal-gun-status').value, editId = document.getElementById('edit-gun-id').value;
    if (!manufacturer || !caliber) return alert('Manufacturer and Caliber required');
    const gunData = { type, manufacturer, model, caliber, sku, serial, initialRounds, purchaseDate: purchased, purchaseCost: cost, cleanInterval: interval, boltCleanInterval: boltInterval, status };
    if (editId) { const gun = data.guns.find(g => g.id === editId); Object.assign(gun, gunData); }
    else { data.guns.push({ id: generateId(), ...gunData, rounds: 0, lastService: 0, lastBoltService: 0 }); }
    closeModal('gun-modal'); save();
}

function editGun(id) {
    const gun = data.guns.find(g => g.id === id); if (!gun) return;
    populateDropdown('modal-gun-make', data.gunManufacturers, gun.manufacturer); populateDropdown('modal-gun-caliber', data.calibers.map(getCaliberFullName), gun.caliber);
    document.getElementById('gun-modal-title').innerText = 'Edit Firearm'; document.getElementById('edit-gun-id').value = gun.id;
    document.getElementById('modal-gun-type').value = gun.type || 'Rifle'; document.getElementById('modal-gun-model').value = gun.model;
    document.getElementById('modal-gun-sku').value = gun.sku || ''; document.getElementById('modal-gun-serial').value = gun.serial;
    document.getElementById('modal-gun-initial-rounds').value = gun.initialRounds || 0;
    document.getElementById('modal-gun-purchased').value = gun.purchaseDate || '';
    document.getElementById('modal-gun-cost').value = gun.purchaseCost || 0;
    document.getElementById('modal-gun-interval').value = gun.cleanInterval; document.getElementById('modal-gun-bolt-interval').value = gun.boltCleanInterval || 1000;
    document.getElementById('modal-gun-status').value = gun.status;
    document.getElementById('gun-advanced-section').style.display = (gun.initialRounds || gun.purchaseDate || gun.purchaseCost) ? 'block' : 'none';
    document.getElementById('gun-advanced-icon').innerText = (gun.initialRounds || gun.purchaseDate || gun.purchaseCost) ? '▲' : '▼';
    toggleBoltField(); openModal('gun-modal');
}

function deleteGun(id) { if (confirm('Are you sure?')) { data.guns = data.guns.filter(g => g.id !== id); save(); } }

function openAddSuppressorModal() { 
    populateDropdown('modal-suppressor-make', data.suppressorManufacturers); 
    populateCheckboxList('modal-suppressor-calibers-list', data.calibers.map(getCaliberFullName)); 
    document.getElementById('suppressor-modal-title').innerText = 'Add New Suppressor';
    document.getElementById('edit-suppressor-id').value = '';
    document.getElementById('modal-suppressor-model').value = '';
    document.getElementById('modal-suppressor-sku').value = '';
    document.getElementById('modal-suppressor-serial').value = '';
    document.getElementById('modal-suppressor-purchased').value = '';
    document.getElementById('modal-suppressor-cost').value = '0';
    document.getElementById('modal-suppressor-interval').value = '1000';
    document.getElementById('modal-suppressor-status').value = 'Ready';
    document.getElementById('suppressor-advanced-section').style.display = 'none';
    document.getElementById('suppressor-advanced-icon').innerText = '▼';
    openModal('suppressor-modal'); 
}

function saveSuppressor() {
    const manufacturer = document.getElementById('modal-suppressor-make').value, model = document.getElementById('modal-suppressor-model').value, sku = document.getElementById('modal-suppressor-sku').value, serial = document.getElementById('modal-suppressor-serial').value, purchased = document.getElementById('modal-suppressor-purchased').value, cost = parseFloat(document.getElementById('modal-suppressor-cost').value) || 0, interval = parseInt(document.getElementById('modal-suppressor-interval').value), status = document.getElementById('modal-suppressor-status').value, editId = document.getElementById('edit-suppressor-id').value, calibers = Array.from(document.querySelectorAll('#modal-suppressor-calibers-list input:checked')).map(cb => cb.value);
    if (!manufacturer) return alert('Manufacturer required');
    const supData = { manufacturer, model, sku, serial, purchaseDate: purchased, purchaseCost: cost, calibers, cleanInterval: interval, status };
    if (editId) { const sup = data.suppressors.find(s => s.id === editId); Object.assign(sup, supData); }
    else { data.suppressors.push({ id: generateId(), ...supData, rounds: 0, lastService: 0 }); }
    closeModal('suppressor-modal'); save();
}

function editSuppressor(id) {
    const sup = data.suppressors.find(s => s.id === id); if (!sup) return;
    populateDropdown('modal-suppressor-make', data.suppressorManufacturers, sup.manufacturer); populateCheckboxList('modal-suppressor-calibers-list', data.calibers.map(getCaliberFullName), sup.calibers || []);
    document.getElementById('suppressor-modal-title').innerText = 'Edit Suppressor';
    document.getElementById('edit-suppressor-id').value = sup.id; document.getElementById('modal-suppressor-model').value = sup.model;
    document.getElementById('modal-suppressor-sku').value = sup.sku || ''; document.getElementById('modal-suppressor-serial').value = sup.serial;
    document.getElementById('modal-suppressor-purchased').value = sup.purchaseDate || '';
    document.getElementById('modal-suppressor-cost').value = sup.purchaseCost || 0;
    document.getElementById('modal-suppressor-interval').value = sup.cleanInterval; document.getElementById('modal-suppressor-status').value = sup.status; 
    document.getElementById('suppressor-advanced-section').style.display = (sup.sku || sup.serial || sup.purchaseDate || sup.purchaseCost) ? 'block' : 'none';
    document.getElementById('suppressor-advanced-icon').innerText = (sup.sku || sup.serial || sup.purchaseDate || sup.purchaseCost) ? '▲' : '▼';
    openModal('suppressor-modal');
}

function deleteSuppressor(id) { if (confirm('Are you sure?')) { data.suppressors = data.suppressors.filter(s => s.id !== id); save(); } }

function editAmmo(caliber) {
    const info = data.ammo[caliber]; if (!info) return;
    populateDropdown('modal-ammo-caliber', data.calibers.map(getCaliberFullName), caliber);
    document.getElementById('modal-ammo-qty').value = '0'; document.getElementById('modal-ammo-min').value = info.minStock; openModal('ammo-modal');
}

function openAmmoModal() { populateDropdown('modal-ammo-caliber', data.calibers.map(getCaliberFullName)); document.getElementById('modal-ammo-qty').value = ''; openModal('ammo-modal'); }

function saveAmmo() {
    const caliber = document.getElementById('modal-ammo-caliber').value, qty = parseInt(document.getElementById('modal-ammo-qty').value) || 0, min = parseInt(document.getElementById('modal-ammo-min').value) || 0;
    if (!caliber) return; if (!data.ammo[caliber]) data.ammo[caliber] = { qty: 0, minStock: min };
    data.ammo[caliber].qty += qty; data.ammo[caliber].minStock = min; closeModal('ammo-modal'); save();
}

function openSessionModal(gunId) {
    const gun = data.guns.find(g => g.id === gunId); if (!gun) return;
    document.getElementById('session-gun-id').value = gunId; document.getElementById('session-gun-name').innerText = `${gun.manufacturer} ${gun.model}`;
    document.getElementById('session-date').valueAsDate = new Date(); populateDropdown('session-caliber', data.calibers.map(getCaliberFullName), gun.caliber);
    const validSups = data.suppressors.filter(s => !gun.caliber || (s.calibers || []).includes(gun.caliber));
    document.getElementById('session-suppressor').innerHTML = '<option value="">None</option>' + validSups.map(s => `<option value="${s.id}">${s.manufacturer} ${s.model}</option>`).join('');
    openModal('session-modal');
}

function submitSession() {
    const gunId = document.getElementById('session-gun-id').value, count = parseInt(document.getElementById('session-rounds').value), cal = document.getElementById('session-caliber').value, supId = document.getElementById('session-suppressor').value, date = document.getElementById('session-date').value;
    if (isNaN(count) || count <= 0 || !date) return alert('Valid count and date required');
    const gun = data.guns.find(g => g.id === gunId);
    if (!gun) return;
    if (data.ammo[cal]) { if (data.ammo[cal].qty < count && !confirm('Low stock. Log anyway?')) return; data.ammo[cal].qty -= count; }
    gun.rounds += count;
    let supName = ''; if (supId) { const sup = data.suppressors.find(s => s.id === supId); if (sup) { sup.rounds += count; supName = `${sup.manufacturer} ${sup.model}`; } }
    data.history.push({ id: generateId(), date, gun: `${gun.manufacturer} ${gun.model}`, gunId, caliber: cal, rounds: count, suppressor: supName, suppressorId: supId });
    data.history.sort((a, b) => new Date(b.date) - new Date(a.date)); closeModal('session-modal'); save();
}

function sortTable(column) { if (tableSort.column === column) tableSort.direction = tableSort.direction === 'asc' ? 'desc' : 'asc'; else { tableSort.column = column; tableSort.direction = 'asc'; } renderDataTable(); }

function renderDataTable() {
    const query = document.getElementById('table-search').value.toLowerCase();
    const filteredGuns = data.guns.filter(g => `${g.manufacturer} ${g.model} ${g.caliber} ${g.sku} ${g.serial} ${g.status} ${g.type}`.toLowerCase().includes(query));
    filteredGuns.sort((a, b) => { let vA = a[tableSort.column], vB = b[tableSort.column]; if (typeof vA === 'string') { vA = vA.toLowerCase(); vB = vB.toLowerCase(); } return vA < vB ? (tableSort.direction === 'asc' ? -1 : 1) : (vA > vB ? (tableSort.direction === 'asc' ? 1 : -1) : 0); });
    document.getElementById('table-body').innerHTML = filteredGuns.map(gun => `<tr style="cursor:pointer" onclick="openGunDetails('${gun.id}')"><td>${gun.manufacturer}</td><td>${gun.model}</td><td>${gun.type}</td><td>${gun.caliber}</td><td>${gun.sku}</td><td>${gun.serial || 'N/A'}</td><td>${(gun.initialRounds || 0) + gun.rounds}</td><td>${gun.cleanInterval}</td><td>${gun.status}</td></tr>`).join('');
}

function render() {
    const gunQuery = (document.getElementById('gun-search')?.value || '').toLowerCase(), supQuery = (document.getElementById('suppressor-search')?.value || '').toLowerCase(), ammoQuery = (document.getElementById('ammo-search')?.value || '').toLowerCase(), optQuery = (document.getElementById('optic-search')?.value || '').toLowerCase();
    if (document.getElementById('settings').classList.contains('active')) renderSettings();
    if (document.getElementById('datatable').classList.contains('active')) renderDataTable();
    
    // Grouped rendering for guns
    const types = ['Rifle', 'Pistol', 'Shotgun'];
    document.getElementById('gun-list').innerHTML = types.map(type => {
        const gunsOfType = data.guns.filter(g => g.type === type && `${g.manufacturer} ${g.model}`.toLowerCase().includes(gunQuery)).sort((a,b) => `${a.manufacturer} ${a.model}`.localeCompare(`${b.manufacturer} ${b.model}`));
        if (gunsOfType.length === 0 && gunQuery === '') return '';
        const isCollapsed = collapsedGroups[type];
        return `<div class="inventory-group"><div class="group-header" onclick="toggleGroup('${type}')"><strong>${type}s (${gunsOfType.length})</strong><span>${isCollapsed ? '▶' : '▼'}</span></div><div class="group-content ${isCollapsed ? 'collapsed' : ''}">${gunsOfType.map(gun => {
            const totalRounds = (gun.initialRounds || 0) + gun.rounds, roundsSinceClean = totalRounds - (gun.lastService || 0), needsClean = roundsSinceClean >= gun.cleanInterval;
            let maintInfo = `Total: ${totalRounds} | Barrel: ${roundsSinceClean} / ${gun.cleanInterval}<br>`;
            if (gun.type === 'Rifle') { const roundsSinceBolt = totalRounds - (gun.lastBoltService || 0); maintInfo += `Bolt: ${roundsSinceBolt} / ${gun.boltCleanInterval || 1000}<br>`; if (roundsSinceBolt >= gun.boltCleanInterval) maintInfo += '<span class="warning-text">⚠ BOLT NEEDS CLEANING</span><br>'; }
            return `<div class="item-card ${needsClean ? 'warning' : ''}" style="cursor:pointer" onclick="openGunDetails('${gun.id}')"><strong>${gun.manufacturer} ${gun.model}</strong><div class="stats">Caliber: ${gun.caliber} | SN: ${gun.serial || 'N/A'}<br>${maintInfo}Status: <span style="color: var(--accent)">${gun.status}</span></div>${needsClean ? '<div class="warning-text">⚠ BARREL NEEDS CLEANING</div>' : ''}<div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:5px;"><button onclick="event.stopPropagation(); openSessionModal('${gun.id}')">Log Session</button><button class="secondary" onclick="event.stopPropagation(); openMaintenanceModal('${gun.id}')">Log Cleaning</button><button class="secondary" onclick="event.stopPropagation(); showTrend('${gun.id}')">📈</button><button class="secondary" onclick="event.stopPropagation(); editGun('${gun.id}')">✎</button></div></div>`;
        }).join('')}</div></div>`;
    }).join('');

    document.getElementById('suppressor-list').innerHTML = data.suppressors.filter(s => `${s.manufacturer} ${s.model}`.toLowerCase().includes(supQuery)).map(sup => {
        const needsClean = (sup.rounds - sup.lastService) >= sup.cleanInterval;
        return `<div class="item-card ${needsClean ? 'warning' : ''}"><strong>${sup.manufacturer} ${sup.model}</strong><div class="stats">Calibers: ${(sup.calibers || []).join(', ')}<br>SN: ${sup.serial || 'N/A'}<br>Total: ${sup.rounds} | Since Clean: ${sup.rounds - sup.lastService} / ${sup.cleanInterval}<br>Status: <span style="color: var(--accent)">${sup.status}</span></div>${needsClean ? '<div class="warning-text">⚠ NEEDS CLEANING</div>' : ''}<div style="margin-top:10px; display:flex; gap:5px;"><button class="secondary" onclick="data.suppressors.find(s => s.id === '${sup.id}').lastService=${sup.rounds}; save();">Cleaned</button><button class="secondary" onclick="editSuppressor('${sup.id}')">✎</button><button class="secondary" onclick="deleteSuppressor('${sup.id}')">🗑</button></div></div>`;
    }).join('');

    // Render Optics
    document.getElementById('optic-list').innerHTML = data.optics.filter(o => `${o.manufacturer} ${o.model}`.toLowerCase().includes(optQuery)).map(opt => {
        let batteryInfo = '';
        let needsCheck = false;
        if (opt.batteryType) {
            const lastChecked = new Date(opt.lastChecked || 0);
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            needsCheck = lastChecked < sixMonthsAgo;
            batteryInfo = `<br>Battery: ${opt.batteryType}<br>Last Checked: ${opt.lastChecked || 'Never'}<br>Last Changed: ${opt.lastChanged || 'Never'}`;
        }
        return `<div class="item-card ${needsCheck ? 'warning' : ''}"><strong>${opt.manufacturer} ${opt.model}</strong><div class="stats">SKU: ${opt.sku || 'N/A'} | SN: ${opt.serial || 'N/A'}${batteryInfo}<br>Status: <span style="color: var(--accent)">${opt.status}</span></div>${needsCheck ? '<div class="warning-text">⚠ CHECK BATTERY</div>' : ''}<div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:5px;">${opt.batteryType ? `<button class="secondary" onclick="checkBattery('${opt.id}')">Check Battery</button><button class="secondary" onclick="changeBattery('${opt.id}')">Change Battery</button>` : ''}<button class="secondary" onclick="editOptic('${opt.id}')">✎</button><button class="secondary" onclick="deleteOptic('${opt.id}')">🗑</button></div></div>`;
    }).join('');

    document.getElementById('ammo-list').innerHTML = Object.entries(data.ammo).filter(([cal]) => cal.toLowerCase().includes(ammoQuery)).map(([cal, info]) => {
        const low = info.qty <= info.minStock;
        return `<div class="item-card ${low ? 'warning' : ''}" style="cursor:pointer" onclick="editAmmo('${cal}')"><strong>${cal}</strong><div class="stats">In Stock: <span style="font-weight:bold; font-size:1.2em">${info.qty}</span><br>Min Alert: ${info.minStock}</div>${low ? '<div class="warning-text">⚠ LOW STOCK</div>' : ''}</div>`;
    }).join('');

    const historyBody = document.getElementById('history-list'); if (historyBody) historyBody.innerHTML = data.history.slice(0, 50).map(entry => `<tr style="cursor:pointer" onclick="openEditSessionModal('${entry.id}')"><td>${entry.date}</td><td>${entry.gun}</td><td>${entry.caliber}</td><td>${entry.rounds}</td></tr>`).join('');
    updateGlobalStats();
}

function updateGlobalStats() {
    const statDiv = document.getElementById('global-stats'); if (!statDiv) return;
    statDiv.innerText = `${data.guns.length} Firearms | ${data.guns.reduce((acc, g) => acc + (g.initialRounds || 0) + g.rounds, 0)} Total Rounds Fired`;
}

function updateCharts() {
    const ctxRounds = document.getElementById('roundsChart')?.getContext('2d'), ctxAmmo = document.getElementById('ammoChart')?.getContext('2d'), ctxUsage = document.getElementById('usageChart')?.getContext('2d');
    if (!ctxRounds || !ctxAmmo || !ctxUsage) return;
    if (charts.rounds) charts.rounds.destroy(); if (charts.ammo) charts.ammo.destroy(); if (charts.usage) charts.usage.destroy();
    const selectedType = document.getElementById('chart-type-filter').value;
    const filteredGuns = data.guns.filter(g => selectedType === 'All' || g.type === selectedType);
    charts.rounds = new Chart(ctxRounds, { type: 'bar', data: { labels: filteredGuns.map(g => `${g.manufacturer} ${g.model}`), datasets: [{ label: 'Total Rounds', data: filteredGuns.map(g => (g.initialRounds || 0) + g.rounds), backgroundColor: '#cfb53b' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, zoom: { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode: 'x' } } } } });
    charts.ammo = new Chart(ctxAmmo, { type: 'doughnut', data: { labels: Object.keys(data.ammo), datasets: [{ data: Object.values(data.ammo).map(a => a.qty), backgroundColor: ['#cfb53b', '#555', '#888', '#aaa', '#03dac6'] }] }, options: { responsive: true, maintainAspectRatio: false } });
    const usageData = {}; data.history.forEach(session => { usageData[session.caliber] = (usageData[session.caliber] || 0) + session.rounds; });
    charts.usage = new Chart(ctxUsage, { type: 'bar', data: { labels: Object.keys(usageData), datasets: [{ label: 'Rounds Fired', data: Object.values(usageData), backgroundColor: '#cf6679' }] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, zoom: { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'y' }, pan: { enabled: true, mode: 'y' } } } } });
}

function showTrend(gunId) {
    const gun = data.guns.find(g => g.id === gunId); if (!gun) return;
    document.getElementById('trend-title').innerText = `${gun.manufacturer} ${gun.model} - Round Count Over Time`;
    openModal('trend-modal');
    const gunHistory = data.history.filter(h => h.gunId === gunId).sort((a, b) => new Date(a.date) - new Date(b.date)), maintHistory = data.maintenance.filter(m => m.gunId === gunId).sort((a, b) => new Date(a.date) - new Date(b.date));
    let cumulative = gun.initialRounds || 0; const labels = ['Start'], points = [cumulative];
    gunHistory.forEach(h => { cumulative += h.rounds; labels.push(h.date); points.push(cumulative); });
    if (charts.trend) charts.trend.destroy();
    charts.trend = new Chart(document.getElementById('trendChart').getContext('2d'), { type: 'line', data: { labels: labels, datasets: [{ label: 'Cumulative Rounds', data: points, borderColor: '#cfb53b', backgroundColor: 'rgba(207, 181, 59, 0.1)', fill: true, tension: 0.1, pointRadius: 4, pointBackgroundColor: (context) => maintHistory.some(m => m.date === context.chart.data.labels[context.dataIndex]) ? '#cf6679' : '#cfb53b', pointBorderColor: (context) => maintHistory.some(m => m.date === context.chart.data.labels[context.dataIndex]) ? '#fff' : '#cfb53b' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: (context) => { const maints = maintHistory.filter(m => m.date === context.label); return maints.length > 0 ? maints.map(m => `Maintenance: ${m.type}`).join('\n') : ''; } } }, zoom: { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }, pan: { enabled: true, mode: 'xy' } } } } });
}
load();
