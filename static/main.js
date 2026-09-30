/* static/main.js - Shared Layout & Navigation Logic */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSidebar();
  initProfileDropdown();
  if (window.lucide) {
    lucide.createIcons();
  }
});

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
    if (window.lucide) {
      lucide.createIcons();
    }
  }
}

// Sidebar Controls
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const appContainer = document.querySelector('.app-container');
  if (!sidebar) return;
  const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
  if (isCollapsed && window.innerWidth > 768) {
    sidebar.classList.add('collapsed');
    if (appContainer) appContainer.classList.add('sidebar-is-collapsed');
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobile-overlay');
  const appContainer = document.querySelector('.app-container');
  if (!sidebar) return;

  if (window.innerWidth <= 768) {
    sidebar.classList.toggle('mobile-open');
    if (overlay) overlay.classList.toggle('active');
  } else {
    sidebar.classList.toggle('collapsed');
    const isNowCollapsed = sidebar.classList.contains('collapsed');
    if (appContainer) {
      appContainer.classList.toggle('sidebar-is-collapsed', isNowCollapsed);
    }
    localStorage.setItem('sidebar_collapsed', isNowCollapsed ? 'true' : 'false');
  }
}

// Profile Dropdown & Modal Logic
function initProfileDropdown() {
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('profile-wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
      closeProfileMenu();
    }

    const modal = document.getElementById('account-modal');
    if (modal && e.target === modal) {
      closeAccountModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProfileMenu();
      closeAccountModal();
    }
  });
}

function toggleProfileMenu(e) {
  if (e) {
    e.stopPropagation();
  }
  const dropdown = document.getElementById('profile-dropdown');
  const trigger = document.getElementById('profile-trigger');
  if (!dropdown) return;

  const isOpen = dropdown.classList.contains('open');
  if (isOpen) {
    dropdown.classList.remove('open');
    if (trigger) trigger.classList.remove('active');
  } else {
    dropdown.classList.add('open');
    if (trigger) trigger.classList.add('active');
  }
}

function closeProfileMenu() {
  const dropdown = document.getElementById('profile-dropdown');
  const trigger = document.getElementById('profile-trigger');
  if (dropdown) dropdown.classList.remove('open');
  if (trigger) trigger.classList.remove('active');
}

function openAccountModal() {
  closeProfileMenu();
  const modal = document.getElementById('account-modal');
  if (modal) modal.classList.add('active');
}

function closeAccountModal() {
  const modal = document.getElementById('account-modal');
  if (modal) modal.classList.remove('active');
}

// ==========================================================================
// Toast Notification System
// ==========================================================================

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconName = 'check-circle-2';
  if (type === 'error') iconName = 'alert-circle';
  if (type === 'warning') iconName = 'alert-triangle';
  if (type === 'info') iconName = 'info';

  toast.innerHTML = `
    <i data-lucide="${iconName}" style="width:18px; height:18px; flex-shrink:0;"></i>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }, 3200);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================================================
// Custom Rename Modal Dialog
// ==========================================================================

let renameCallback = null;

function showRenameModal(initialTitle, onRename) {
  renameCallback = onRename;
  let modal = document.getElementById('rename-modal');

  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'rename-modal';
    modal.innerHTML = `
      <div class="custom-modal-card">
        <div class="modal-header">
          <h3 class="modal-title">Rename Conversation</h3>
          <button type="button" class="modal-close-btn" onclick="closeRenameModal()" title="Close">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="modal-body" style="margin: 16px 0;">
          <label class="form-label" for="rename-input" style="margin-bottom: 8px; display:block;">Conversation Name</label>
          <input type="text" id="rename-input" class="form-input" style="width:100%; padding:10px 14px; border-radius:10px; background:rgba(255,255,255,0.05); border:1px solid var(--border-card); color:var(--text-main); font-size:0.92rem; outline:none;" placeholder="Enter new title..." autocomplete="off">
        </div>
        <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn-secondary" onclick="closeRenameModal()" style="padding:8px 16px;">Cancel</button>
          <button type="button" class="btn-primary" id="btn-submit-rename" style="padding:8px 18px;">Rename</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (window.lucide) lucide.createIcons();

    const input = modal.querySelector('#rename-input');
    const submitBtn = modal.querySelector('#btn-submit-rename');

    submitBtn.addEventListener('click', handleRenameSubmit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleRenameSubmit();
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeRenameModal();
    });
  }

  const input = modal.querySelector('#rename-input');
  input.value = initialTitle || '';
  modal.classList.add('active');
  setTimeout(() => {
    input.focus();
    input.select();
  }, 50);
}

function handleRenameSubmit() {
  const modal = document.getElementById('rename-modal');
  const input = modal ? modal.querySelector('#rename-input') : null;
  if (!input) return;

  const newTitle = input.value.trim();
  if (!newTitle) {
    showToast('Title cannot be empty', 'warning');
    return;
  }

  closeRenameModal();
  if (renameCallback) {
    renameCallback(newTitle);
  }
}

function closeRenameModal() {
  const modal = document.getElementById('rename-modal');
  if (modal) modal.classList.remove('active');
}

// ==========================================================================
// Custom Delete Confirmation Modal Dialog
// ==========================================================================

let deleteCallback = null;

function showDeleteModal(onDelete, customMessage = 'This conversation and all its messages will be permanently deleted.') {
  deleteCallback = onDelete;
  let modal = document.getElementById('delete-modal');

  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'delete-modal';
    modal.innerHTML = `
      <div class="custom-modal-card">
        <div class="modal-header">
          <h3 class="modal-title" style="color: #f87171;">Delete Conversation?</h3>
          <button type="button" class="modal-close-btn" onclick="closeDeleteModal()" title="Close">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="modal-body" style="margin: 16px 0;">
          <p class="modal-description" id="delete-modal-msg"></p>
        </div>
        <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn-secondary" onclick="closeDeleteModal()" style="padding:8px 16px;">Cancel</button>
          <button type="button" class="btn-danger" id="btn-submit-delete" style="padding:8px 18px;">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (window.lucide) lucide.createIcons();

    const submitBtn = modal.querySelector('#btn-submit-delete');
    submitBtn.addEventListener('click', handleDeleteSubmit);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeDeleteModal();
    });
  }

  const msgEl = modal.querySelector('#delete-modal-msg');
  if (msgEl) msgEl.textContent = customMessage;

  modal.classList.add('active');
}

function handleDeleteSubmit() {
  closeDeleteModal();
  if (deleteCallback) {
    deleteCallback();
  }
}

function closeDeleteModal() {
  const modal = document.getElementById('delete-modal');
  if (modal) modal.classList.remove('active');
}

// Global keydown listener for Escape key to close any active modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeRenameModal();
    closeDeleteModal();
  }
});

