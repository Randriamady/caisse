// ==================== CONFIGURATION ====================
const API_URL = "https://script.google.com/macros/s/AKfycbzTP0hJ9RsBlvH-cogjELMGnEP8FUaLoizbqbA2I3s6qTusuUrdPz0GtzRPMNvWKU96oA/exec";

// Variables globales
let caisseData = [], cct1Data = [];
let filteredCaisse = [], filteredCct1 = [];
let sortState = { caisse: { col: null, dir: 'asc' }, cct1: { col: null, dir: 'asc' } };
let currentEdit = { type: null, row: null, oldValues: null };
let refreshInterval = null;
let columnFilters = { caisse: {}, cct1: {} };

// ==================== GESTION DU MOT DE PASSE ====================
function getPassword() {
  return sessionStorage.getItem('appPassword');
}
function setPassword(pwd) {
  sessionStorage.setItem('appPassword', pwd);
}
function clearPassword() {
  sessionStorage.removeItem('appPassword');
}

// Vérification automatique si déjà connecté
(function checkAutoLogin() {
  const savedPwd = getPassword();
  if (savedPwd) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('logoutBtn').style.display = 'inline-flex';
    showForm('caisse');
    loadAllData().catch(e => console.warn(e));
    startAutoRefresh();
  }
})();

// Déconnexion
function logout() {
  clearPassword();
  document.getElementById('app').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  btn.disabled = false;
  btnText.innerHTML = 'Connexion sécurisée';
  stopAutoRefresh();
}

// ==================== APPEL API AVEC AUTH ====================
async function fetchWithAuth(url, options = {}) {
  const pwd = getPassword();
  if (!pwd) throw new Error("Non authentifié");
  const separator = url.includes('?') ? '&' : '?';
  const authUrl = `${url}${separator}pwd=${encodeURIComponent(pwd)}`;
  const response = await fetch(authUrl, options);
  if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
  const data = await response.json();
  if (!data.success) {
    if (data.error && data.error.includes("Mot de passe")) logout();
    throw new Error(data.error || "Erreur serveur");
  }
  return data;
}

// ==================== TOAST NOTIFICATION ====================
function showToast(msg, isError = false) {
  const toast = document.getElementById('toastMsg');
  toast.textContent = msg;
  toast.style.background = isError ? '#ef4444' : '#0f172a';
  toast.style.display = 'flex';
  setTimeout(() => toast.style.display = 'none', 3000);
}

// ==================== MENU DÉROULANT ====================
function toggleSubmenu(id) {
  const el = document.getElementById(id);
  const arrow = el.previousElementSibling.querySelector('.submenu-arrow');
  el.style.display = el.style.display === 'none' ? 'flex' : 'none';
  arrow.style.transform = el.style.display === 'none' ? 'rotate(0deg)' : 'rotate(180deg)';
}

// ==================== CONNEXION ====================
document.getElementById('loginBtn').onclick = async () => {
  const password = document.getElementById('passwordInput').value;
  const errorDiv = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  errorDiv.style.display = 'none';
  if (password.length < 4) {
    errorDiv.textContent = "Mot de passe trop court (min. 4)";
    errorDiv.style.display = 'block';
    return;
  }
  btn.disabled = true;
  btnText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connexion...';
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ action: 'login', pwd: password })
    });
    const data = await res.json();
    if (data.success) {
      setPassword(password);
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      document.getElementById('logoutBtn').style.display = 'inline-flex';
      document.getElementById('passwordInput').value = '';
      showForm('caisse');
      loadAllData().catch(e => showToast('Erreur chargement données', true));
      startAutoRefresh();
    } else {
      errorDiv.textContent = data.error || "Mot de passe incorrect";
      errorDiv.style.display = 'block';
      btn.disabled = false;
      btnText.innerHTML = 'Connexion sécurisée';
    }
  } catch(e) {
    errorDiv.textContent = "Erreur de connexion";
    errorDiv.style.display = 'block';
    btn.disabled = false;
    btnText.innerHTML = 'Connexion sécurisée';
  }
};

document.getElementById('passwordInput').addEventListener('keypress', e => {
  if (e.key === 'Enter') document.getElementById('loginBtn').click();
});
document.getElementById('logoutBtn').onclick = () => logout();

// ==================== RAFRAÎCHISSEMENT AUTO ====================
function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(silentRefresh, 10000);
}
function stopAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = null;
}

async function silentRefresh() {
  if (document.getElementById('editModal').style.display === 'flex') return;
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) return;
  if (!getPassword()) { logout(); return; }
  try {
    const data = await fetchWithAuth(`${API_URL}?action=getAll`);
    const newCaisse = data.caisse || [];
    const newCct1 = data.cct1 || [];
    if (caisseData.length !== newCaisse.length || JSON.stringify(caisseData) !== JSON.stringify(newCaisse)) {
      caisseData = newCaisse;
      initFilters('caisse');
      if (document.getElementById('consultCaisse').style.display === 'block') applyFilter('caisse');
      else renderTable('caisse');
    }
    if (cct1Data.length !== newCct1.length || JSON.stringify(cct1Data) !== JSON.stringify(newCct1)) {
      cct1Data = newCct1;
      initFilters('cct1');
      if (document.getElementById('consultCCT1').style.display === 'block') applyFilter('cct1');
      else renderTable('cct1');
    }
  } catch(e) { console.warn(e); }
}

// ==================== CHARGEMENT DES DONNÉES ====================
async function loadAllData() {
  const data = await fetchWithAuth(`${API_URL}?action=getAll`);
  caisseData = data.caisse || [];
  cct1Data = data.cct1 || [];
  initFilters('caisse');
  initFilters('cct1');
  renderTable('caisse');
  renderTable('cct1');
  updateTotalCounts();
  showToast(`✅ ${caisseData.length} caisse, ${cct1Data.length} cct1`);
}

// ==================== FILTRES (global + colonnes) ====================
function initFilters(type) {
  const data = type === 'caisse' ? caisseData : cct1Data;
  const select = document.getElementById(type === 'caisse' ? 'societeFilterCaisse' : 'societeFilterCCT1');
  if (!select) return;
  const societes = [...new Set(data.map(r => String(r.SOCIETE || r.SOCIETES || '').trim()).filter(Boolean))].sort();
  select.innerHTML = '<option value="">Toutes</option>' + societes.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  const searchInput = document.getElementById(type === 'caisse' ? 'searchCaisse' : 'searchCCT1');
  if (searchInput && !searchInput.dataset.listener) {
    searchInput.addEventListener('input', debounce(() => applyFilter(type), 300));
    searchInput.dataset.listener = true;
  }
}

function debounce(fn, delay) {
  let t;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, delay);
  };
}

function applyFilter(type) {
  const data = type === 'caisse' ? caisseData : cct1Data;
  const search = document.getElementById(type === 'caisse' ? 'searchCaisse' : 'searchCCT1')?.value.toLowerCase() || '';
  const societe = document.getElementById(type === 'caisse' ? 'societeFilterCaisse' : 'societeFilterCCT1')?.value.toLowerCase() || '';
  const colFilters = columnFilters[type] || {};
  const filtered = data.filter(row => {
    const text = type === 'caisse' ? `${row.CLIENT||''} ${row.LIBELLE||''} ${row.FACTURE||''}`.toLowerCase() : `${row.LIBELLE||''} ${row.COMMENTAIRES||''} ${row.SOCIETES||''}`.toLowerCase();
    if (search && !text.includes(search)) return false;
    const soc = String(row.SOCIETE || row.SOCIETES || '').toLowerCase();
    if (societe && soc !== societe) return false;
    for (let col in colFilters) {
      const filterVal = colFilters[col];
      if (filterVal === '') continue;
      const cellVal = String(row[col] || '').toLowerCase();
      if (!cellVal.includes(filterVal.toLowerCase())) return false;
    }
    return true;
  });
  if (type === 'caisse') filteredCaisse = filtered;
  else filteredCct1 = filtered;
  renderTable(type, filtered);
  updateTotalCounts();
}

function resetFilters(type) {
  document.getElementById(type === 'caisse' ? 'searchCaisse' : 'searchCCT1').value = '';
  document.getElementById(type === 'caisse' ? 'societeFilterCaisse' : 'societeFilterCCT1').value = '';
  sortState[type] = { col: null, dir: 'asc' };
  columnFilters[type] = {};
  applyFilter(type);
}

// ==================== AFFICHAGE DES TABLEAUX ====================
function renderTable(type, data = null) {
  const source = data || (type === 'caisse' ? caisseData : cct1Data);
  const container = document.getElementById(type === 'caisse' ? 'tableCaisse' : 'tableCCT1');
  const wrapper = container.closest('.double-table-wrapper');
  if (!wrapper) return;

  // Tri
  const sortCol = sortState[type].col;
  const sortDir = sortState[type].dir;
  let sorted = [...source];
  if (sortCol) {
    sorted.sort((a,b) => {
      let va = a[sortCol], vb = b[sortCol];
      let na = parseFloat(va), nb = parseFloat(vb);
      if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na;
      va = String(va).toLowerCase();
      vb = String(vb).toLowerCase();
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }

  if (!sorted.length) {
    container.innerHTML = '<div style="padding:40px; text-align:center;">Aucune donnée</div>';
    return;
  }

  const headers = Object.keys(sorted[0]).filter(h => h !== '_uid');
  const html = `<table><tbody>${sorted.map(row => `
    <tr>
      <td style="text-align: center;"><button class="edit-btn" onclick="openEditModal('${type}', '${row._uid}')"><i class="fas fa-edit"></i></button></td>
      ${headers.map(h => `<td>${escapeHtml(formatDateForDisplay(row[h] || ''))}</td>`).join('')}
    </tr>
  `).join('')}</tbody></table>`;
  container.innerHTML = html;

  // Création de l'en-tête fixe avec filtres par colonne
  let fixedDiv = wrapper.querySelector('.table-fixed-header');
  if (!fixedDiv) {
    fixedDiv = document.createElement('div');
    fixedDiv.className = 'table-fixed-header';
    wrapper.insertBefore(fixedDiv, container);
  }
  const currentColFilters = columnFilters[type] || {};
  let headerHtml = `<table><thead>`;
  headerHtml += `<tr><th>Éditer</th>${headers.map(h => `<th data-col="${escapeHtml(h)}">${escapeHtml(h)} ${sortCol === h ? (sortDir === 'asc' ? '▲' : '▼') : ''}</th>`).join('')}</tr>`;
  headerHtml += `<tr><th></th>${headers.map(h => `<th><input type="text" class="filter-input" data-col="${escapeHtml(h)}" placeholder="Filtrer ${escapeHtml(h)}" value="${escapeHtml(currentColFilters[h] || '')}"></th>`).join('')}</tr>`;
  headerHtml += `</thead></table>`;
  fixedDiv.innerHTML = headerHtml;

  // Tri au clic sur colonne
  fixedDiv.querySelectorAll('th[data-col]').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortState[type].col === col) sortState[type].dir = sortState[type].dir === 'asc' ? 'desc' : 'asc';
      else { sortState[type].col = col; sortState[type].dir = 'asc'; }
      applyFilter(type);
    });
  });

  // Filtres dynamiques par colonne
  fixedDiv.querySelectorAll('.filter-input').forEach(input => {
    input.addEventListener('input', debounce(() => {
      const col = input.dataset.col;
      const val = input.value;
      if (!columnFilters[type]) columnFilters[type] = {};
      columnFilters[type][col] = val;
      applyFilter(type);
    }, 300));
  });

  // Synchronisation du scroll horizontal
  const syncScroll = (src, tgt) => {
    if (src && tgt) src.onscroll = () => { tgt.scrollLeft = src.scrollLeft; };
  };
  syncScroll(container, fixedDiv);
  syncScroll(fixedDiv, container);

  setTimeout(() => {
    syncColumnWidths(type);
    adjustContainerPadding(type);
  }, 20);
  setTimeout(() => adjustContainerPadding(type), 100);
}

function syncColumnWidths(type) {
  const body = document.getElementById(type === 'caisse' ? 'tableCaisse' : 'tableCCT1');
  const fixed = body?.closest('.double-table-wrapper')?.querySelector('.table-fixed-header');
  if (!body || !fixed) return;
  const bodyTable = body.querySelector('table');
  const headTable = fixed.querySelector('table');
  if (!bodyTable || !headTable) return;
  const cols = headTable.querySelectorAll('th').length;
  let widths = Array(cols).fill(0);
  headTable.querySelectorAll('th').forEach((th,i) => widths[i] = th.getBoundingClientRect().width);
  bodyTable.querySelectorAll('tbody tr').forEach(tr => {
    tr.querySelectorAll('td').forEach((td,i) => {
      if (i < cols) widths[i] = Math.max(widths[i], td.getBoundingClientRect().width);
    });
  });
  [bodyTable, headTable].forEach(t => {
    let cg = t.querySelector('colgroup');
    if (!cg) { cg = document.createElement('colgroup'); t.prepend(cg); }
    cg.innerHTML = widths.map(w => `<col style="width:${w}px; min-width:${w}px;">`).join('');
  });
}

function adjustContainerPadding(type) {
  const consultDiv = document.getElementById(type === 'caisse' ? 'consultCaisse' : 'consultCCT1');
  if (!consultDiv) return;
  const sectionHeader = consultDiv.querySelector('.section-header');
  const filterBar = consultDiv.querySelector('.filter-bar');
  if (sectionHeader && filterBar) {
    const headerHeight = sectionHeader.offsetHeight;
    const filterHeight = filterBar.offsetHeight;
    const totalOffset = headerHeight + filterHeight;
    const wrapper = consultDiv.querySelector('.double-table-wrapper');
    if (wrapper) wrapper.style.paddingTop = totalOffset + 'px';
  }
}

function updateTotalCounts() {
  document.getElementById('totalCaisse').innerText = filteredCaisse.length || caisseData.length;
  document.getElementById('totalCCT1').innerText = filteredCct1.length || cct1Data.length;
}

// ==================== ÉDITION (MODAL) ====================
function openEditModal(type, uid) {
  const arr = type === 'caisse' ? caisseData : cct1Data;
  const row = arr.find(r => r._uid === uid);
  if (!row) return showToast("Ligne introuvable", true);
  currentEdit = { type, row, oldValues: { ...row } };
  const modalBody = document.getElementById('editModalBody');
  modalBody.innerHTML = '';

  if (type === 'caisse') {
    const leftFields = ['DATE', 'SOCIETE', 'DEPARTEMENT', 'DR/DA', 'RV SAGE/MANUEL', 'MODE DE PAIEMENT', 'ECHEANCE BANQUE', 'DATE DE VERSEMENT', 'BQ VERSEMENT'];
    const rightFields = ['CLIENT', 'CODE CLIENT', 'FACTURE', 'LIBELLE', 'ENCAISSEMENT', 'DECAISSEMENT', 'MONTANT', 'OBSERVATION'];
    const existingLeft = leftFields.filter(f => row.hasOwnProperty(f));
    const existingRight = rightFields.filter(f => row.hasOwnProperty(f));
    existingLeft.forEach(field => {
      const div = document.createElement('div'); div.className = 'edit-field';
      div.innerHTML = `<label>${escapeHtml(field)}</label><input type="text" id="edit_${field}" value="${escapeHtml(row[field] || '')}">`;
      modalBody.appendChild(div);
    });
    existingRight.forEach(field => {
      const div = document.createElement('div'); div.className = 'edit-field';
      div.innerHTML = `<label>${escapeHtml(field)}</label><input type="text" id="edit_${field}" value="${escapeHtml(row[field] || '')}">`;
      modalBody.appendChild(div);
    });
  } else if (type === 'cct1') {
    const leftFields = ['DATE', 'N°RV', 'DR-DA', 'LIBELLE'];
    const rightFields = ['RECETTE', 'DEPENSE', 'SOLDE', 'SOCIETES'];
    const commentField = 'COMMENTAIRES';
    const existingLeft = leftFields.filter(f => row.hasOwnProperty(f));
    const existingRight = rightFields.filter(f => row.hasOwnProperty(f));
    existingLeft.forEach(field => {
      const div = document.createElement('div'); div.className = 'edit-field';
      div.innerHTML = `<label>${escapeHtml(field)}</label><input type="text" id="edit_${field}" value="${escapeHtml(row[field] || '')}">`;
      modalBody.appendChild(div);
    });
    existingRight.forEach(field => {
      const div = document.createElement('div'); div.className = 'edit-field';
      div.innerHTML = `<label>${escapeHtml(field)}</label><input type="text" id="edit_${field}" value="${escapeHtml(row[field] || '')}">`;
      modalBody.appendChild(div);
    });
    if (row.hasOwnProperty(commentField)) {
      const div = document.createElement('div'); div.className = 'edit-field full-width';
      div.innerHTML = `<label>${escapeHtml(commentField)}</label><input type="text" id="edit_${commentField}" value="${escapeHtml(row[commentField] || '')}">`;
      modalBody.appendChild(div);
    }
  } else {
    const headers = Object.keys(row).filter(h => h !== '_uid');
    const half = Math.ceil(headers.length / 2);
    const leftHeaders = headers.slice(0, half);
    const rightHeaders = headers.slice(half);
    leftHeaders.forEach(h => {
      const div = document.createElement('div'); div.className = 'edit-field';
      div.innerHTML = `<label>${escapeHtml(h)}</label><input type="text" id="edit_${h}" value="${escapeHtml(row[h] || '')}">`;
      modalBody.appendChild(div);
    });
    rightHeaders.forEach(h => {
      const div = document.createElement('div'); div.className = 'edit-field';
      div.innerHTML = `<label>${escapeHtml(h)}</label><input type="text" id="edit_${h}" value="${escapeHtml(row[h] || '')}">`;
      modalBody.appendChild(div);
    });
  }

  document.getElementById('editModal').style.display = 'flex';
  const allEditFields = Array.from(modalBody.querySelectorAll('input')).map(inp => inp.id.replace('edit_', ''));
  document.getElementById('editModal').dataset.headers = JSON.stringify(allEditFields);
}

async function saveEdit() {
  const { type, row, oldValues } = currentEdit;
  if (!row) return;
  const headers = JSON.parse(document.getElementById('editModal').dataset.headers || '[]');
  headers.forEach(h => {
    const input = document.getElementById(`edit_${h}`);
    if (input) row[h] = input.value;
  });
  applyFilter(type);
  closeEditModal();
  showToast("Mise à jour en cours...");
  const formData = new URLSearchParams();
  formData.append('action', 'update');
  formData.append('sheet', type);
  formData.append('uid', row._uid);
  for (let [k,v] of Object.entries(row)) if (k !== '_uid') formData.append(k, v);
  try {
    const data = await fetchWithAuth(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: formData });
    if (data.success) showToast("✅ Modification enregistrée");
    else throw new Error(data.error);
  } catch(err) {
    showToast("❌ Erreur serveur, restauration", true);
    Object.assign(row, oldValues);
    applyFilter(type);
  }
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  currentEdit = { type: null, row: null, oldValues: null };
}

// ==================== SOUMISSION DES FORMULAIRES ====================
function enableEnterNavigation(form) {
  const inputs = Array.from(form.querySelectorAll('input, select, textarea'));
  inputs.forEach((input, index) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const next = inputs[index + 1];
        if (next) next.focus();
        else form.querySelector('button[type="submit"]')?.focus();
      }
    });
  });
}
enableEnterNavigation(document.getElementById('formCaisse'));
enableEnterNavigation(document.getElementById('formCCT1'));

async function submitForm(formElement, btnElement) {
  const originalHtml = btnElement.innerHTML;
  btnElement.disabled = true;
  btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...';
  const formData = new FormData(formElement);
  const params = new URLSearchParams();
  for (let [key, value] of formData.entries()) {
    params.append(key, value);
  }
  try {
    const data = await fetchWithAuth(API_URL, { method: 'POST', body: params });
    if (data.success) {
      showToast("Envoi réussi !");
      formElement.reset();
      // Déverrouillage spécifique pour le formulaire Caisse (mode Espèce)
      if (formElement.id === 'formCaisse') {
        const fieldsToUnlock = ['ECHEANCE BANQUE', 'DATE DE VERSEMENT', 'BQ VERSEMENT', 'CODE CLIENT'];
        fieldsToUnlock.forEach(f => {
          const input = document.querySelector(`#formCaisse [name="${f}"]`);
          if (input) {
            input.readOnly = false;
            input.style.backgroundColor = '';
          }
        });
        if (window.updateCaisseLock) window.updateCaisseLock();
      }
      loadAllData();
    } else throw new Error(data.error);
  } catch(e) {
    showToast("Erreur envoi", true);
  } finally {
    btnElement.disabled = false;
    btnElement.innerHTML = originalHtml;
  }
}

document.getElementById('formCaisse').addEventListener('submit', e => {
  e.preventDefault();
  submitForm(e.target, document.getElementById('submitCaisseBtn'));
});
document.getElementById('formCCT1').addEventListener('submit', e => {
  e.preventDefault();
  submitForm(e.target, document.getElementById('submitCCT1Btn'));
});

// ==================== NAVIGATION ENTRE PAGES ====================
function showForm(page) {
  document.querySelectorAll('.glass-form, .consult-section').forEach(el => el.style.display = 'none');
  if (page === 'caisse') document.getElementById('formCaisse').style.display = 'block';
  else if (page === 'cct1') document.getElementById('formCCT1').style.display = 'block';
  else if (page === 'consultCaisse') {
    document.getElementById('consultCaisse').style.display = 'block';
    applyFilter('caisse');
  }
  else if (page === 'consultCCT1') {
    document.getElementById('consultCCT1').style.display = 'block';
    applyFilter('cct1');
  }
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
}

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => showForm(btn.dataset.page)));

// ==================== EXPORT CSV ====================
function exportCSV(type) {
  const data = type === 'caisse' ? (filteredCaisse.length ? filteredCaisse : caisseData) : (filteredCct1.length ? filteredCct1 : cct1Data);
  if (!data.length) return showToast("Aucune donnée", true);
  const headers = Object.keys(data[0]).filter(h => h !== '_uid');
  const csv = [headers.join(','), ...data.map(r => headers.map(h => JSON.stringify(r[h] || '')).join(','))].join('\n');
  const blob = new Blob(["\uFEFF" + csv], {type: 'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `${type}_${new Date().toISOString().slice(0,19)}.csv`; a.click();
  URL.revokeObjectURL(a.href);
  showToast(`Export ${type} terminé`);
}

// ==================== UTILITAIRES ====================
function escapeHtml(str) {
  return String(str).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function formatDateForDisplay(value) {
  if (value === null || value === undefined || value === '') return '';
  const str = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  let isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoMatch) {
    const [_, y, m, d] = isoMatch;
    return `${d}/${m}/${y}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${d}/${m}/${y}`;
  }
  return str;
}

// ==================== VERROUILLAGE CONDITIONNEL POUR CAISSE (ESPÈCE) ====================
function initCaisseFormConditions() {
  const modeSelect = document.querySelector('#formCaisse select[name="MODE DE PAIEMENT"]');
  if (!modeSelect) return;
  const fieldsToLock = ['ECHEANCE BANQUE', 'DATE DE VERSEMENT', 'BQ VERSEMENT', 'CODE CLIENT'];
  const inputs = {};
  fieldsToLock.forEach(f => {
    inputs[f] = document.querySelector(`#formCaisse [name="${f}"]`);
  });
  function updateLock() {
    const isEspece = (modeSelect.value === 'espece');
    fieldsToLock.forEach(f => {
      const input = inputs[f];
      if (input) {
        if (isEspece) {
          input.readOnly = true;
          input.value = '';
          input.style.backgroundColor = '#f1f5f9';
        } else {
          input.readOnly = false;
          input.style.backgroundColor = '';
        }
      }
    });
  }
  modeSelect.addEventListener('change', updateLock);
  updateLock();
  window.updateCaisseLock = updateLock;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCaisseFormConditions);
} else {
  initCaisseFormConditions();
}

// Ajustement du padding lors du redimensionnement
window.addEventListener('resize', () => {
  if (document.getElementById('consultCaisse').style.display === 'block') adjustContainerPadding('caisse');
  if (document.getElementById('consultCCT1').style.display === 'block') adjustContainerPadding('cct1');
});

// Exposer certaines fonctions globalement (appelées depuis HTML)
window.applyFilter = applyFilter;
window.resetFilters = resetFilters;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveEdit = saveEdit;
window.exportCSV = exportCSV;
window.toggleSubmenu = toggleSubmenu;