/* static/pdf.js - AI PDF Assistant Frontend Logic */

let isPdfUploaded = false;
let uploadedFileName = '';
let currentPdfChats = [];

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSidebar();
  initTextareaAutoResize();
  initDragAndDrop();
  loadPdfChats();
  lucide.createIcons();
});

// Theme Toggle
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
    lucide.createIcons();
  }
}

// Sidebar & Mobile Toggle
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

function initTextareaAutoResize() {
  const textarea = document.getElementById('pdf-question-input');
  if (!textarea) return;

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askPdfQuestion();
    }
  });
}

function initDragAndDrop() {
  const workspace = document.getElementById('pdf-workspace');
  if (!workspace) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    workspace.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      workspace.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    workspace.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      workspace.classList.remove('dragover');
    });
  });

  workspace.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  });
}

function triggerPdfUpload() {
  const fileInput = document.getElementById('pdf-file-input');
  if (fileInput) fileInput.click();
}

function handleFileSelect(event) {
  const files = event.target.files;
  if (files && files.length > 0) {
    uploadFile(files[0]);
  }
}

async function uploadFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    alert('Please select a valid .pdf document');
    return;
  }

  // Show loading indicator
  const loadingId = 'pdf-upload-loading-' + Date.now();
  renderAIMessage(`⏳ **Indexing "${file.name}" into FAISS vector database...**`);

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/upload_pdf', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (data.status === 'PDF uploaded') {
      isPdfUploaded = true;
      uploadedFileName = file.name;

      // Update Sidebar status badge
      const sidebarBadge = document.getElementById('sidebar-pdf-badge');
      const sidebarName = document.getElementById('sidebar-pdf-name');
      if (sidebarBadge && sidebarName) {
        sidebarName.innerText = file.name;
        sidebarBadge.style.display = 'block';
      }

      // Update Composer pill
      const composerPill = document.getElementById('composer-pdf-pill');
      const composerName = document.getElementById('composer-pdf-name');
      if (composerPill && composerName) {
        composerName.innerText = file.name;
        composerPill.style.display = 'inline-flex';
      }

      // Remove welcome screen if present
      const welcome = document.getElementById('pdf-welcome-screen');
      if (welcome) welcome.remove();

      renderAIMessage(`✅ **"${file.name}" uploaded & indexed successfully!**\nFAISS vector embeddings are active. Ask any question about this document below.`);
    } else {
      alert(data.status || 'Failed to upload PDF');
    }
  } catch (err) {
    console.error('PDF upload error:', err);
    alert('Network error while uploading PDF.');
  }
}

async function askPdfQuestion() {
  const textarea = document.getElementById('pdf-question-input');
  const question = textarea.value.trim();
  if (!question) return;

  if (!isPdfUploaded) {
    alert('Please select/upload a PDF document first using the attachment icon or sidebar button.');
    return;
  }

  textarea.value = '';
  textarea.style.height = 'auto';

  // Remove welcome screen if present
  const welcome = document.getElementById('pdf-welcome-screen');
  if (welcome) welcome.remove();

  // Render User Question (RIGHT side, text LEFT aligned)
  renderUserMessage(question);

  // Show Loading indicator
  const loadingId = 'pdf-loading-' + Date.now();
  renderLoadingState(loadingId);

  const sendBtn = document.getElementById('pdf-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const res = await fetch('/ask_pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });

    const data = await res.json();
    removeElement(loadingId);

    if (data.result === 'LIMIT_REACHED') {
      renderAIMessage('⚠️ **Prompt limit reached.** Free limit is 50 prompts without login. Please [Login](/login) or [Register](/register) to continue.');
      return;
    }

    renderAIMessage(data.result || 'No relevant context found in PDF.');
    loadPdfChats();

  } catch (err) {
    removeElement(loadingId);
    console.error('PDF ask error:', err);
    renderAIMessage('❌ Connection error querying PDF context.');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

async function loadPdfChats() {
  try {
    const res = await fetch('/get_chats');
    if (res.ok) {
      const allChats = await res.json();
      currentPdfChats = allChats.filter(c => c.type === 'pdf');
      renderSidebarHistory();
    }
  } catch (err) {
    console.log('Error loading PDF chats:', err);
  }
}

function renderSidebarHistory() {
  const container = document.getElementById('pdf-history-list');
  if (!container) return;

  if (currentPdfChats.length === 0) {
    container.innerHTML = '<div style="padding:10px; font-size:0.8rem; color:var(--text-muted);">No document chats saved</div>';
    return;
  }

  container.innerHTML = currentPdfChats.map((chat) => `
    <div class="history-item" onclick="selectPdfChat('${chat.id}')">
      <span class="history-item-title" title="${escapeHtml(chat.user)}">${escapeHtml(chat.user)}</span>
      <button class="history-item-del" onclick="deletePdfChat(event, '${chat.id}')">
        <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
      </button>
    </div>
  `).join('');

  lucide.createIcons();
}

function selectPdfChat(id) {
  const chat = currentPdfChats.find(c => String(c.id) === String(id));
  if (!chat) return;

  const container = document.getElementById('pdf-chat-messages');
  container.innerHTML = '';

  renderUserMessage(chat.user);
  renderAIMessage(chat.ai);
  closeMobileSidebar();
}

function closeMobileSidebar() {
  if (window.innerWidth <= 768) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      sidebar.classList.remove('mobile-open');
      if (overlay) overlay.classList.remove('active');
    }
  }
}

async function deletePdfChat(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this saved question?')) return;

  try {
    await fetch(`/delete_chat/${id}`, { method: 'DELETE' });
    currentPdfChats = currentPdfChats.filter(c => String(c.id) !== String(id));
    renderSidebarHistory();
  } catch (err) {
    console.error('Error deleting PDF chat:', err);
  }
}

function renderUserMessage(text) {
  const container = document.getElementById('pdf-chat-messages');
  const row = document.createElement('div');
  row.className = 'message-row user';
  row.innerHTML = `<div class="message-bubble">${escapeHtml(text)}</div>`;
  container.appendChild(row);
  scrollToBottom();
}

function renderAIMessage(text) {
  const container = document.getElementById('pdf-chat-messages');
  const row = document.createElement('div');
  row.className = 'message-row ai';

  let formattedHtml = text;
  if (window.marked) {
    formattedHtml = marked.parse(text);
  } else {
    formattedHtml = escapeHtml(text).replace(/\n/g, '<br>');
  }

  row.innerHTML = `
    <div class="message-avatar">
      <i data-lucide="file-text" style="width:20px; height:20px;"></i>
    </div>
    <div class="message-bubble">${formattedHtml}</div>
  `;
  container.appendChild(row);
  lucide.createIcons();
  scrollToBottom();
}

function renderLoadingState(id) {
  const container = document.getElementById('pdf-chat-messages');
  const row = document.createElement('div');
  row.className = 'message-row ai';
  row.id = id;
  row.innerHTML = `
    <div class="message-avatar">
      <i data-lucide="file-text" style="width:20px; height:20px;"></i>
    </div>
    <div class="message-bubble">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  container.appendChild(row);
  lucide.createIcons();
  scrollToBottom();
}

function scrollToBottom() {
  const container = document.getElementById('pdf-chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

function removeElement(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
