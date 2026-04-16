/**
 * ============================================================
 * SNACK LIST MANAGER - app.js
 * Pure JavaScript — No frameworks. All logic lives here.
 * ============================================================
 *
 * Data model (localStorage keys):
 *   "snackMembers"   → Array of member objects (today's list)
 *   "snackHistory"   → Object keyed by date strings
 *
 * Member object:
 *   { id, name, snacks: [{ id, item, price }] }
 * ============================================================
 */

// ── Constants ──────────────────────────────────────────────
const LS_MEMBERS = 'snackMembers';
const LS_HISTORY = 'snackHistory';

// ── State ──────────────────────────────────────────────────
let members = [];       // Current day's members
let searchQuery = '';   // Live search filter
let pendingDeleteId = null; // For confirm modal

// ── Utility: Generate unique ID ────────────────────────────
function uid() {
  return '_' + Math.random().toString(36).slice(2, 9);
}

// ── Utility: Get today's date string ──────────────────────
function todayKey() {
  return new Date().toISOString().slice(0, 10); // "2025-04-16"
}

// ── Utility: Format date for display ──────────────────────
function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

// ── Utility: Format currency ───────────────────────────────
function formatPrice(n) {
  return '₹' + Number(n).toFixed(2);
}

// ── Utility: Get initials ──────────────────────────────────
function initials(name) {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

// ── LocalStorage: Load members ─────────────────────────────
function loadMembers() {
  try {
    members = JSON.parse(localStorage.getItem(LS_MEMBERS)) || [];
  } catch {
    members = [];
  }
}

// ── LocalStorage: Save members ─────────────────────────────
function saveMembers() {
  localStorage.setItem(LS_MEMBERS, JSON.stringify(members));
  // Auto-save a history snapshot for today
  saveHistory();
}

// ── LocalStorage: Save to history ─────────────────────────
function saveHistory() {
  let history = {};
  try { history = JSON.parse(localStorage.getItem(LS_HISTORY)) || {}; } catch {}
  history[todayKey()] = JSON.parse(JSON.stringify(members)); // deep clone
  localStorage.setItem(LS_HISTORY, JSON.stringify(history));
}

// ── LocalStorage: Get yesterday's list ────────────────────
function getYesterdayList() {
  let history = {};
  try { history = JSON.parse(localStorage.getItem(LS_HISTORY)) || {}; } catch {}
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const key = yesterday.toISOString().slice(0, 10);
  return history[key] || null;
}

// ── Compute totals ─────────────────────────────────────────
function memberTotal(member) {
  return member.snacks.reduce((sum, s) => sum + Number(s.price || 0), 0);
}

function grandTotal() {
  return members.reduce((sum, m) => sum + memberTotal(m), 0);
}

function topSpenderId() {
  if (!members.length) return null;
  let top = members[0];
  members.forEach(m => { if (memberTotal(m) > memberTotal(top)) top = m; });
  return top.id;
}

// ── Filter members by search ───────────────────────────────
function filteredMembers() {
  if (!searchQuery) return members;
  const q = searchQuery.toLowerCase();
  return members.filter(m =>
    m.name.toLowerCase().includes(q) ||
    m.snacks.some(s => s.item.toLowerCase().includes(q))
  );
}

// ── MEMBER CRUD ────────────────────────────────────────────

/** Add a new member */
function addMember(name) {
  name = name.trim();
  if (!name) return showToast('Please enter a member name.', 'error');
  if (members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
    return showToast(`"${name}" already exists.`, 'warning');
  }
  members.push({ id: uid(), name, snacks: [] });
  saveMembers();
  renderAll();
  showToast(`${name} added!`, 'success');
}

/** Start editing a member's name (inline) */
function startEditMember(id) {
  const card = document.getElementById(`card-${id}`);
  if (!card) return;
  const nameEl = card.querySelector('.member-name-display');
  const member = members.find(m => m.id === id);
  if (!member) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = member.name;
  input.className = 'member-name-input';
  input.id = `name-input-${id}`;

  nameEl.replaceWith(input);
  input.focus();
  input.select();

  function save() {
    const newName = input.value.trim();
    if (newName && newName !== member.name) {
      if (members.some(m => m.id !== id && m.name.toLowerCase() === newName.toLowerCase())) {
        showToast('Name already taken.', 'error');
        return;
      }
      member.name = newName;
      saveMembers();
      showToast('Name updated!', 'success');
    }
    renderAll();
  }

  input.addEventListener('blur', save);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') renderAll();
  });
}

/** Confirm & delete a member */
function confirmDeleteMember(id) {
  const member = members.find(m => m.id === id);
  if (!member) return;
  pendingDeleteId = id;
  showModal(
    '🗑️ Delete Member',
    `Are you sure you want to delete <strong>${member.name}</strong> and all their snacks?`,
    () => {
      members = members.filter(m => m.id !== id);
      saveMembers();
      renderAll();
      showToast('Member deleted.', 'info');
      pendingDeleteId = null;
    }
  );
}

// ── SNACK CRUD ─────────────────────────────────────────────

/** Add a snack to a member */
function addSnack(memberId, item, price) {
  item = item.trim();
  if (!item) return showToast('Please enter a snack name.', 'error');
  const p = parseFloat(price);
  if (isNaN(p) || p < 0) return showToast('Enter a valid price.', 'error');

  const member = members.find(m => m.id === memberId);
  if (!member) return;

  member.snacks.push({ id: uid(), item, price: p });
  saveMembers();
  renderAll();
  showToast(`"${item}" added to ${member.name}!`, 'success');
}

/** Start inline edit for a snack row */
function startEditSnack(memberId, snackId) {
  const row = document.getElementById(`snack-${snackId}`);
  if (!row) return;

  const member = members.find(m => m.id === memberId);
  const snack = member?.snacks.find(s => s.id === snackId);
  if (!snack) return;

  const nameCell = row.querySelector('.snack-name-cell');
  const priceCell = row.querySelector('.snack-price-cell');
  const actionsCell = row.querySelector('.snack-actions-cell');

  // Replace with inputs
  nameCell.innerHTML = `<input class="snack-edit-input" type="text" value="${escHtml(snack.item)}" id="edit-name-${snackId}">`;
  priceCell.innerHTML = `<input class="snack-edit-input" type="number" value="${snack.price}" min="0" step="0.5" style="width:80px" id="edit-price-${snackId}">`;
  actionsCell.innerHTML = `
    <button class="btn btn-sm btn-success btn-icon" onclick="saveEditSnack('${memberId}','${snackId}')" title="Save">✓</button>
    <button class="btn btn-sm btn-secondary btn-icon" onclick="renderAll()" title="Cancel">✕</button>
  `;
}

/** Save inline snack edit */
function saveEditSnack(memberId, snackId) {
  const nameInput  = document.getElementById(`edit-name-${snackId}`);
  const priceInput = document.getElementById(`edit-price-${snackId}`);
  if (!nameInput || !priceInput) return;

  const newName = nameInput.value.trim();
  const newPrice = parseFloat(priceInput.value);

  if (!newName) return showToast('Snack name cannot be empty.', 'error');
  if (isNaN(newPrice) || newPrice < 0) return showToast('Enter a valid price.', 'error');

  const member = members.find(m => m.id === memberId);
  const snack = member?.snacks.find(s => s.id === snackId);
  if (!snack) return;

  snack.item = newName;
  snack.price = newPrice;
  saveMembers();
  renderAll();
  showToast('Snack updated!', 'success');
}

/** Delete a snack */
function deleteSnack(memberId, snackId) {
  const member = members.find(m => m.id === memberId);
  if (!member) return;
  const snack = member.snacks.find(s => s.id === snackId);
  const name = snack ? snack.item : '';
  member.snacks = member.snacks.filter(s => s.id !== snackId);
  saveMembers();
  renderAll();
  showToast(`"${name}" removed.`, 'info');
}

// ── COPY YESTERDAY'S LIST ───────────────────────────────────
function copyYesterdayList() {
  const list = getYesterdayList();
  if (!list || !list.length) {
    return showToast("No previous day's data found.", 'warning');
  }
  showModal(
    '📋 Copy Yesterday\'s List',
    `This will <strong>replace today's list</strong> with yesterday's data (${list.length} member${list.length !== 1 ? 's' : ''}). Continue?`,
    () => {
      // Deep clone with new IDs
      members = list.map(m => ({
        id: uid(),
        name: m.name,
        snacks: m.snacks.map(s => ({ id: uid(), item: s.item, price: s.price }))
      }));
      saveMembers();
      renderAll();
      showToast("Yesterday's list copied!", 'success');
    }
  );
}

// ── RESET TODAY ────────────────────────────────────────────
function resetToday() {
  showModal(
    '🔄 Reset Today\'s List',
    'This will <strong>clear all members and snacks</strong> for today. This action cannot be undone.',
    () => {
      members = [];
      saveMembers();
      renderAll();
      showToast('Today\'s list has been reset.', 'info');
    }
  );
}

// ── RENDER ENGINE ──────────────────────────────────────────

/** Main render: stats + members list */
function renderAll() {
  renderStats();
  renderMembers();
}

/** Render the 4 stat cards at the top */
function renderStats() {
  const total = grandTotal();
  const filtered = filteredMembers();

  document.getElementById('stat-members').textContent = members.length;
  document.getElementById('stat-total').textContent = formatPrice(total);
  document.getElementById('stat-snacks').textContent = members.reduce((s, m) => s + m.snacks.length, 0);

  // Top spender name
  const topId = topSpenderId();
  const topMember = members.find(m => m.id === topId);
  document.getElementById('stat-top').textContent = topMember
    ? `${topMember.name} (${formatPrice(memberTotal(topMember))})`
    : '—';
}

/** Render all member cards */
function renderMembers() {
  const container = document.getElementById('members-container');
  const filtered = filteredMembers();
  const topId = topSpenderId();

  if (!members.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🍩</div>
        <div class="empty-title">No members yet!</div>
        <div class="empty-desc">Click <strong>"Add Member"</strong> to get started.<br>
          You can also copy yesterday's list if available.</div>
      </div>`;
    return;
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">No results found</div>
        <div class="empty-desc">Try a different search term.</div>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(m => renderMemberCard(m, m.id === topId)).join('');
}

/** Render a single member card HTML */
function renderMemberCard(member, isTop) {
  const total = memberTotal(member);
  const snackRows = member.snacks.map(s => renderSnackRow(member.id, s)).join('');

  return `
  <div class="member-card ${isTop && members.length > 1 ? 'top-spender' : ''}" id="card-${member.id}">
    <!-- Member Header -->
    <div class="member-header">
      <div class="member-avatar">${escHtml(initials(member.name))}</div>
      <div class="member-info">
        <div class="member-name">
          <span class="member-name-display">${escHtml(member.name)}</span>
          ${isTop && members.length > 1 ? '<span class="top-badge">👑 Top Spender</span>' : ''}
        </div>
        <div class="member-snack-count">${member.snacks.length} snack${member.snacks.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="member-total">
        <div class="member-total-label">Total</div>
        <div class="member-total-value">${formatPrice(total)}</div>
      </div>
      <div class="member-actions">
        <button class="btn btn-secondary btn-icon btn-sm" 
          onclick="startEditMember('${member.id}')" title="Rename member">✏️</button>
        <button class="btn btn-danger btn-icon btn-sm" 
          onclick="confirmDeleteMember('${member.id}')" title="Delete member">🗑️</button>
      </div>
    </div>

    <!-- Snack Body -->
    <div class="snack-body">
      ${member.snacks.length ? `
      <table class="snack-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Snack Item</th>
            <th>Price</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${snackRows}
        </tbody>
      </table>` : `<p style="color:var(--text-muted);font-size:13px;margin-bottom:10px;">No snacks added yet.</p>`}

      <!-- Add snack inline form -->
      <div class="add-snack-row" id="add-snack-row-${member.id}">
        <input class="form-input" type="text" 
          id="snack-item-${member.id}" 
          placeholder="Snack name (e.g. Samosa)"
          onkeydown="handleSnackKeydown(event, '${member.id}')">
        <input class="form-input" type="number" 
          id="snack-price-${member.id}" 
          placeholder="Price (₹)" min="0" step="0.5" style="max-width:120px"
          onkeydown="handleSnackKeydown(event, '${member.id}')">
        <button class="btn btn-primary btn-sm" 
          onclick="submitAddSnack('${member.id}')">
          <span>＋</span> <span class="btn-label">Add Snack</span>
        </button>
      </div>
    </div>
  </div>`;
}

/** Render a single snack table row */
function renderSnackRow(memberId, snack) {
  // Index will be looked up from DOM after render — just use item index
  return `
    <tr id="snack-${snack.id}">
      <td style="color:var(--text-muted);width:30px;">•</td>
      <td class="snack-name-cell">${escHtml(snack.item)}</td>
      <td class="snack-price-cell">${formatPrice(snack.price)}</td>
      <td class="snack-actions-cell">
        <button class="btn btn-secondary btn-icon btn-sm" 
          onclick="startEditSnack('${memberId}','${snack.id}')" title="Edit">✏️</button>
        <button class="btn btn-danger btn-icon btn-sm" 
          onclick="deleteSnack('${memberId}','${snack.id}')" title="Delete">✕</button>
      </td>
    </tr>`;
}

// ── HELPER: Escape HTML ────────────────────────────────────
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── HELPER: Submit add-snack from form ─────────────────────
function submitAddSnack(memberId) {
  const itemInput  = document.getElementById(`snack-item-${memberId}`);
  const priceInput = document.getElementById(`snack-price-${memberId}`);
  if (!itemInput || !priceInput) return;
  addSnack(memberId, itemInput.value, priceInput.value);
  // Inputs are re-rendered; focus first field
}

/** Handle Enter key inside the add-snack row */
function handleSnackKeydown(event, memberId) {
  if (event.key === 'Enter') submitAddSnack(memberId);
}

// ── TOAST NOTIFICATION ─────────────────────────────────────
function showToast(message, type = 'info', duration = 3000) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const container = document.getElementById('toast-container');

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ── MODAL ───────────────────────────────────────────────────
let _modalConfirmCallback = null;

function showModal(title, desc, onConfirm) {
  _modalConfirmCallback = onConfirm;
  document.getElementById('modal-title').innerHTML = title;
  document.getElementById('modal-desc').innerHTML = desc;
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  _modalConfirmCallback = null;
}

function confirmModal() {
  closeModal();
  if (_modalConfirmCallback) _modalConfirmCallback();
}

// ── ADD MEMBER PANEL TOGGLE ─────────────────────────────────
function toggleAddMemberPanel() {
  const panel = document.getElementById('add-member-panel');
  const isVisible = panel.classList.toggle('visible');
  if (isVisible) {
    document.getElementById('new-member-name').focus();
  }
}

function submitAddMember() {
  const input = document.getElementById('new-member-name');
  addMember(input.value);
  input.value = '';
  document.getElementById('add-member-panel').classList.remove('visible');
}

// ── SEARCH ──────────────────────────────────────────────────
function handleSearch(e) {
  searchQuery = e.target.value.trim();
  renderMembers();
}

// ── HEADER DATE ─────────────────────────────────────────────
function renderDate() {
  document.getElementById('header-date').textContent = formatDate(todayKey());
}

// ── BOOT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadMembers();
  renderDate();
  renderAll();

  // Enter key for add-member input
  document.getElementById('new-member-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAddMember();
    if (e.key === 'Escape') {
      document.getElementById('add-member-panel').classList.remove('visible');
    }
  });

  // Close modal on overlay click
  document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });

  // Live search
  document.getElementById('search-input').addEventListener('input', handleSearch);
});

// ── GROUP SNACKS: Deduplicate by name (case-insensitive) ───
/**
 * Takes a raw snacks array [{id, item, price}, ...]
 * Returns grouped array [{item, qty, unitPrice, total}, ...]
 * Items with the same name but different prices get separate rows.
 */
function groupSnacks(snacks) {
  const map = new Map();
  snacks.forEach(s => {
    // Key: lowercase item name + price (so tea@10 ≠ tea@12)
    const key = s.item.toLowerCase().trim() + '||' + Number(s.price);
    if (map.has(key)) {
      map.get(key).qty += 1;
      map.get(key).total += Number(s.price);
    } else {
      map.set(key, {
        item: s.item.trim(),
        qty: 1,
        unitPrice: Number(s.price),
        total: Number(s.price)
      });
    }
  });
  return Array.from(map.values());
}

// ── EXPORT PDF ──────────────────────────────────────────────
function exportPDF() {
  if (!members.length) {
    return showToast('No data to export. Add members first.', 'warning');
  }

  const dateStr  = formatDate(todayKey());                        // "Wednesday, April 16, 2025"
  const filename = `snack-report-${todayKey()}.pdf`;
  const gt       = grandTotal();
  const totalSnacks = members.reduce((s, m) => s + m.snacks.length, 0);
  const now      = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // ── Build member blocks HTML ──────────────────────────
  const memberBlocksHTML = members.map(member => {
    const grouped = groupSnacks(member.snacks);
    const mTotal  = memberTotal(member);

    if (!grouped.length) {
      return `
        <div class="pdf-member-block">
          <div class="pdf-member-name">&#128100; ${escHtml(member.name)}</div>
          <p style="color:#9ca3af;font-size:12px;padding:6px 10px;">No snacks recorded.</p>
          <div class="pdf-member-total-row">
            <span>Member Total</span>
            <span>&#8377;0.00</span>
          </div>
        </div>`;
    }

    const rows = grouped.map(g => `
      <tr>
        <td>${escHtml(g.item)}</td>
        <td class="pdf-qty-cell" style="text-align:center;">&#215;${g.qty}</td>
        <td class="pdf-unit-price-cell">&#8377;${g.unitPrice.toFixed(2)}</td>
        <td class="pdf-total-cell">&#8377;${g.total.toFixed(2)}</td>
      </tr>`).join('');

    return `
      <div class="pdf-member-block">
        <div class="pdf-member-name">&#128100; ${escHtml(member.name)}</div>
        <table class="pdf-snack-table">
          <thead>
            <tr>
              <th>Snack Item</th>
              <th style="text-align:center;">Qty</th>
              <th>Unit Price</th>
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div class="pdf-member-total-row">
          <span>Member Total</span>
          <span>&#8377;${mTotal.toFixed(2)}</span>
        </div>
      </div>`;
  }).join('');

  // ── Assemble complete PDF HTML ────────────────────────
  const html = `
    <div class="pdf-report">
      <!-- Company / Report Header -->
      <div class="pdf-logo-row">
        <div style="font-size:28px;">&#127849;</div>
        <div>
          <div class="pdf-company">SnackTrack</div>
          <div class="pdf-tagline">Office Daily Snack Manager</div>
        </div>
      </div>

      <hr class="pdf-header-divider">

      <div class="pdf-report-title">&#128196; Daily Snack Report</div>
      <div class="pdf-date">${dateStr}</div>

      <div class="pdf-meta-row">
        <span>&#128101; Members: ${members.length}</span>
        <span>&#127857; Snacks: ${totalSnacks}</span>
        <span>&#128336; Generated at: ${now}</span>
        <span>&#9997;&#65039; Prepared by: SnackTrack</span>
      </div>

      <!-- Member Sections -->
      ${memberBlocksHTML}

      <!-- Grand Total -->
      <div class="pdf-grand-total-bar">
        <span class="pdf-grand-total-label">&#127881; Grand Total</span>
        <span class="pdf-grand-total-value">&#8377;${gt.toFixed(2)}</span>
      </div>

      <!-- Footer -->
      <div class="pdf-footer">
        Generated by SnackTrack &bull; ${dateStr} &bull; ${now}
      </div>
    </div>`;

  // ── Inject into hidden template and export ────────────
  const template = document.getElementById('pdf-template');
  template.innerHTML = html;

  const btn = document.getElementById('btn-export-pdf');
  btn.disabled = true;
  btn.innerHTML = '<span>&#8987;</span><span class="btn-label">Generating…</span>';

  const opt = {
    margin:       [8, 8, 8, 8],          // mm
    filename,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, logging: false },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
  };

  html2pdf()
    .set(opt)
    .from(template)
    .save()
    .then(() => {
      template.innerHTML = '';
      btn.disabled = false;
      btn.innerHTML = '<span>&#128196;</span><span class="btn-label">Export PDF</span>';
      showToast(`PDF saved as "${filename}"`, 'success', 4000);
    })
    .catch(err => {
      template.innerHTML = '';
      btn.disabled = false;
      btn.innerHTML = '<span>&#128196;</span><span class="btn-label">Export PDF</span>';
      showToast('PDF export failed. Try again.', 'error');
      console.error('PDF export error:', err);
    });
}

