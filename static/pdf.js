/* static/pdf.js - AI PDF Assistant Frontend Logic */

let isPdfUploaded = false;
let uploadedFileName = '';
let uploadedFileSize = 0;
let uploadedFileChunks = 0;
let currentPdfBlobUrl = null;
let currentPdfChats = [];

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSidebar();
  initTextareaAutoResize();
  initDragAndDrop();
  loadPdfChats();
  checkExistingPdf();
  if (window.lucide) {
    lucide.createIcons();
  }

  // Keyboard shortcut: ESC to close preview modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePdfPreviewModal();
    }
  });
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
    const file = files[0];
    event.target.value = '';
    uploadFile(file);
  }
}

function renderUploadLoadingState(id, filename) {
  const container = document.getElementById('pdf-chat-messages');
  const welcome = document.getElementById('pdf-welcome-screen');
  if (welcome) welcome.remove();

  const row = document.createElement('div');
  row.className = 'message-row ai';
  row.id = id;
  row.innerHTML = `
    <div class="message-avatar">
      <i data-lucide="file-text" style="width:20px; height:20px;"></i>
    </div>
    <div class="message-bubble">
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="typing-indicator" style="display:inline-flex;">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </span>
        <span>Indexing <strong>${escapeHtml(filename)}</strong> into FAISS vector database...</span>
      </div>
    </div>
  `;
  container.appendChild(row);
  lucide.createIcons();
  scrollToBottom();
}

async function uploadFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Please select a valid .pdf document', 'warning');
    return;
  }

  // Create local blob URL for instant preview
  if (currentPdfBlobUrl) {
    try { URL.revokeObjectURL(currentPdfBlobUrl); } catch (e) {}
  }
  currentPdfBlobUrl = URL.createObjectURL(file);
  uploadedFileName = file.name;
  uploadedFileSize = file.size;

  // Show removable loading indicator
  const loadingId = 'pdf-upload-loading-' + Date.now();
  renderUploadLoadingState(loadingId, file.name);

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/upload_pdf', {
      method: 'POST',
      body: formData
    });

    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      if (res.status === 413) {
        data = { status: 'error', message: 'The PDF file is too large to process.' };
      } else {
        data = { status: 'error', message: `Server error (${res.status}): Please check backend logs.` };
      }
    }

    removeElement(loadingId);

    if (res.ok && data.status === 'PDF uploaded') {
      isPdfUploaded = true;
      uploadedFileName = file.name;
      uploadedFileSize = data.size || file.size;
      uploadedFileChunks = data.chunk_count || 0;

      // Update composer pill and modal metadata
      updateActivePdfDisplay(file.name, uploadedFileSize, uploadedFileChunks);

      // Remove welcome screen if present
      const welcome = document.getElementById('pdf-welcome-screen');
      if (welcome) welcome.remove();

      // 1. Render ChatGPT-style document bubble on the RIGHT
      renderDocumentCard(file.name, uploadedFileSize, uploadedFileChunks);

      // 2. Render ChatGPT-style conversational response on the LEFT
      const docTitle = data.title || file.name.replace(/\.pdf$/i, '');
      const pageCount = data.page_count || 1;
      const pageWord = pageCount === 1 ? '1 page / slide' : `${pageCount} slides`;
      const shortName = file.name.length > 20 ? file.name.substring(0, 18) + '...' : file.name;

      const aiIntroText = `I've received the **${escapeHtml(docTitle)}** presentation PDF. It contains ${pageWord} covering key concepts and contents. <span class="inline-doc-pill" onclick="openPdfPreviewModal()" title="Preview ${escapeHtml(file.name)}"><svg width="12" height="14" viewBox="0 0 24 28" fill="none" style="vertical-align:middle; margin-right:3px;"><path d="M2 4C2 2.89543 2.89543 2 4 2H14.5858C15.1163 2 15.6251 2.21071 16 2.58579L21.4142 8C21.7893 8.37486 22 8.88368 22 9.41421V24C22 25.1046 21.1046 26 20 26H4C2.89543 26 2 25.1046 2 24V4Z" stroke="#ef4444" stroke-width="2"/><path d="M14 2V8C14 8.55228 14.4477 9 15 9H21" stroke="#ef4444" stroke-width="2"/></svg>${escapeHtml(shortName)}</span>\n\nTell me what you want me to do with it—for example:`;

      renderAIMessageWithSuggestions(aiIntroText, [
        'Explain every slide in detail',
        'Prepare viva questions + answers',
        'Summarize the main objectives and findings',
        'Explain technical architecture and modules'
      ]);

      showToast(`Uploaded "${file.name}" successfully`, 'success');
    } else {
      const errorMsg = data.message || data.status || 'Failed to upload and index PDF.';
      renderAIMessage(`❌ **PDF Upload Error:** ${escapeHtml(errorMsg)}`);
      showToast(errorMsg, 'error');
    }
  } catch (err) {
    removeElement(loadingId);
    console.error('PDF upload error:', err);
    const detail = err && err.message ? ` (${err.message})` : '';
    renderAIMessage(`❌ **Upload Failed:** Server connection error while processing "${escapeHtml(file.name)}"${detail}. Please verify that the Flask server is running and try again.`);
    showToast('Network error while uploading PDF.', 'error');
  }
}

let activePdfConvId = null;

async function askPdfQuestion() {
  const textarea = document.getElementById('pdf-question-input');
  const question = textarea.value.trim();
  if (!question) return;

  if (!isPdfUploaded) {
    showToast('Please select/upload a PDF document first using the attachment icon or sidebar button.', 'warning');
    return;
  }

  textarea.value = '';
  textarea.style.height = 'auto';

  const welcome = document.getElementById('pdf-welcome-screen');
  if (welcome) welcome.remove();

  renderUserMessage(question);

  const loadingId = 'pdf-loading-' + Date.now();
  renderLoadingState(loadingId);

  const sendBtn = document.getElementById('pdf-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const res = await fetch('/ask_pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, conversation_id: activePdfConvId })
    });

    const data = await res.json();
    removeElement(loadingId);

    if (data.result === 'LIMIT_REACHED') {
      renderAIMessage('⚠️ **Prompt limit reached.** Free limit is 50 prompts without login. Please [Login](/login) or [Register](/register) to continue.');
      return;
    }

    const aiResponse = data.result || 'No relevant context found in PDF.';
    renderAIMessage(aiResponse);

    const convId = String(data.conversation_id || activePdfConvId || ('conv_' + Date.now()));
    const targetChatId = activePdfConvId || convId;
    activePdfConvId = convId;

    let convObj = currentPdfChats.find(c => 
      String(c.conversation_id || c.id) === String(convId) || 
      String(c.conversation_id || c.id) === String(targetChatId) ||
      String(c.id) === String(convId) ||
      String(c.id) === String(targetChatId)
    );

    if (convObj) {
      convObj.conversation_id = convId;
      convObj.id = convObj.id || convId;
      if (!convObj.messages) convObj.messages = [];
      convObj.messages.push({ id: Date.now(), user: question, ai: aiResponse, type: 'pdf' });
    } else {
      convObj = {
        id: convId,
        conversation_id: convId,
        type: 'pdf',
        title: question.substring(0, 30),
        user: question,
        ai: aiResponse,
        messages: [{ id: Date.now(), user: question, ai: aiResponse, type: 'pdf' }]
      };
      currentPdfChats.unshift(convObj);
    }

    localStorage.setItem('pdf_chats', JSON.stringify(currentPdfChats));
    renderSidebarHistory();

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
      currentPdfChats = allChats.filter(c => c.type === 'pdf' || (c.messages && c.messages.some(m => m.type === 'pdf')));
    } else {
      const raw = localStorage.getItem('pdf_chats');
      if (raw) currentPdfChats = JSON.parse(raw);
    }
  } catch (err) {
    console.error('Using local storage for PDF chats due to error:', err);
    try {
      const raw = localStorage.getItem('pdf_chats');
      if (raw) currentPdfChats = JSON.parse(raw);
    } catch (e) {}
  }

  localStorage.setItem('pdf_chats', JSON.stringify(currentPdfChats));
  renderSidebarHistory();
}

function renderSidebarHistory() {
  const container = document.getElementById('pdf-history-list');
  if (!container) return;

  if (currentPdfChats.length === 0) {
    container.innerHTML = '<div style="padding:10px; font-size:0.8rem; color:var(--text-muted);">No document chats saved</div>';
    return;
  }

  container.innerHTML = currentPdfChats.map((chat) => {
    const cid = String(chat.conversation_id || chat.id);
    const title = chat.title || (chat.messages && chat.messages[0] ? chat.messages[0].user : chat.user) || 'Untitled Document Chat';
    const isActive = String(activePdfConvId) === cid;

    return `
      <div class="history-item ${isActive ? 'active' : ''}" onclick="selectPdfChat('${cid}')">
        <span class="history-item-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        <div style="display:flex; align-items:center; gap:4px;">
          <button class="history-item-del" onclick="renamePdfChat(event, '${cid}')" title="Rename chat" style="opacity: 0.7;">
            <i data-lucide="pencil" style="width:13px; height:13px;"></i>
          </button>
          <button class="history-item-del" onclick="deletePdfChat(event, '${cid}')" title="Delete chat">
            <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

async function selectPdfChat(id) {
  activePdfConvId = String(id);
  const chat = currentPdfChats.find(c => String(c.conversation_id || c.id) === String(id));

  if (chat) {
    try {
      const res = await fetch(`/get_conversation/${id}`);
      if (res.ok) {
        const serverMsgs = await res.json();
        if (serverMsgs && serverMsgs.length > 0) {
          chat.messages = serverMsgs;
        }
      }
    } catch (err) {
      console.log('Using cached messages for PDF conversation:', err);
    }
  }

  if (!chat) return;

  const container = document.getElementById('pdf-chat-messages');
  container.innerHTML = '';

  const msgs = chat.messages || [{ user: chat.user, ai: chat.ai }];
  msgs.forEach(m => {
    if (m.user) renderUserMessage(m.user);
    if (m.ai) renderAIMessage(m.ai);
  });

  renderSidebarHistory();
  closeMobileSidebar();
}

function startNewPdfChat() {
  activePdfConvId = null;
  const container = document.getElementById('pdf-chat-messages');
  container.innerHTML = `
    <div class="welcome-container" id="pdf-welcome-screen">
      <div class="welcome-icon">
        <i data-lucide="file-text"></i>
      </div>
      <h2 class="welcome-title">PDF Document Assistant</h2>
      <p class="welcome-sub">Upload a PDF document to query concepts, summarize findings, or extract technical data.</p>
    </div>
  `;
  lucide.createIcons();
  renderSidebarHistory();
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

function renamePdfChat(e, id) {
  if (e) e.stopPropagation();
  const chat = currentPdfChats.find(c => String(c.conversation_id || c.id) === String(id));
  if (!chat) return;

  showRenameModal(chat.title || '', async (newTitle) => {
    chat.title = newTitle;
    localStorage.setItem('pdf_chats', JSON.stringify(currentPdfChats));
    renderSidebarHistory();

    try {
      const res = await fetch(`/rename_chat/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });
      if (res.ok) {
        showToast('Document chat renamed', 'success');
      } else {
        showToast('Failed to rename document chat', 'error');
      }
    } catch (err) {
      console.error('Error renaming PDF chat:', err);
      showToast('Error renaming document chat', 'error');
    }
  });
}

function deletePdfChat(e, id) {
  if (e) e.stopPropagation();

  showDeleteModal(async () => {
    currentPdfChats = currentPdfChats.filter(c => String(c.conversation_id || c.id) !== String(id));
    localStorage.setItem('pdf_chats', JSON.stringify(currentPdfChats));

    if (String(activePdfConvId) === String(id)) {
      startNewPdfChat();
    } else {
      renderSidebarHistory();
    }

    try {
      const res = await fetch(`/delete_chat/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Document chat deleted', 'success');
      } else {
        showToast('Failed to delete document chat', 'error');
      }
    } catch (err) {
      console.error('Error deleting PDF chat:', err);
      showToast('Error deleting document chat', 'error');
    }
  }, 'This document conversation will be permanently deleted.');
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

/* ----------------- Document Preview & Display Handlers (ChatGPT Style) ----------------- */

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function updateActivePdfDisplay(filename, size, chunkCount) {
  isPdfUploaded = true;
  uploadedFileName = filename;
  uploadedFileSize = size || uploadedFileSize || 0;
  uploadedFileChunks = chunkCount || uploadedFileChunks || 0;

  // 1. Sidebar status badge
  const sidebarBadge = document.getElementById('sidebar-pdf-badge');
  const sidebarName = document.getElementById('sidebar-pdf-name');
  if (sidebarBadge && sidebarName) {
    sidebarName.innerText = filename;
    sidebarBadge.style.display = 'block';
  }

  // 2. Composer Pill (ChatGPT compact chip)
  const composerPill = document.getElementById('composer-pdf-pill');
  const composerName = document.getElementById('composer-pdf-name');
  if (composerPill && composerName) {
    composerName.innerText = filename;
    composerPill.style.display = 'inline-flex';
  }

  // 3. Update preview modal details
  const modalFilename = document.getElementById('preview-modal-filename');
  const modalSize = document.getElementById('preview-modal-size');
  const modalChunks = document.getElementById('preview-modal-chunks');
  const chunksBadge = document.getElementById('preview-chunks-badge');
  if (modalFilename) modalFilename.innerText = filename;
  if (modalSize) modalSize.innerText = formatBytes(uploadedFileSize);
  if (modalChunks) modalChunks.innerText = `${uploadedFileChunks || 0} text chunks indexed`;
  if (chunksBadge) chunksBadge.innerText = uploadedFileChunks || 0;

  if (window.lucide) lucide.createIcons();
}

function renderDocumentCard(filename, size, chunkCount) {
  const container = document.getElementById('pdf-chat-messages');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'user-doc-row';
  row.innerHTML = `
    <div class="chatgpt-doc-bubble" onclick="openPdfPreviewModal()" title="Click to preview ${escapeHtml(filename)}">
      <div class="chatgpt-pdf-icon-wrap">
        <svg width="24" height="28" viewBox="0 0 24 28" fill="none">
          <path d="M2 4C2 2.89543 2.89543 2 4 2H14.5858C15.1163 2 15.6251 2.21071 16 2.58579L21.4142 8C21.7893 8.37486 22 8.88368 22 9.41421V24C22 25.1046 21.1046 26 20 26H4C2.89543 26 2 25.1046 2 24V4Z" stroke="#ef4444" stroke-width="2"/>
          <path d="M14 2V8C14 8.55228 14.4477 9 15 9H21" stroke="#ef4444" stroke-width="2"/>
          <text x="5" y="21" fill="#ef4444" font-size="7" font-weight="bold" font-family="system-ui, -apple-system, sans-serif">PDF</text>
        </svg>
      </div>
      <div class="chatgpt-doc-meta-wrap">
        <div class="chatgpt-doc-name">${escapeHtml(filename)}</div>
        <div class="chatgpt-doc-type">PDF</div>
      </div>
    </div>
  `;
  container.appendChild(row);
  scrollToBottom();
}

function renderAIMessageWithSuggestions(introMarkdown, suggestions) {
  const container = document.getElementById('pdf-chat-messages');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'message-row ai';

  let formattedHtml = introMarkdown;
  if (window.marked) {
    formattedHtml = marked.parse(introMarkdown);
  } else {
    formattedHtml = escapeHtml(introMarkdown).replace(/\n/g, '<br>');
  }

  const suggestionsHtml = suggestions && suggestions.length > 0 ? `
    <ul class="chatgpt-suggestion-list">
      ${suggestions.map(s => `
        <li class="chatgpt-suggestion-item" onclick="quickAskQuestion('${escapeHtml(s)}')">
          ${escapeHtml(s)}
        </li>
      `).join('')}
    </ul>
  ` : '';

  row.innerHTML = `
    <div class="message-avatar">
      <i data-lucide="sparkles" style="width:20px; height:20px;"></i>
    </div>
    <div class="message-bubble">
      ${formattedHtml}
      ${suggestionsHtml}
    </div>
  `;

  container.appendChild(row);
  if (window.lucide) lucide.createIcons();
  scrollToBottom();
}

async function openPdfPreviewModal(e) {
  if (e) e.stopPropagation();

  if (!isPdfUploaded && !uploadedFileName) {
    showToast('No PDF is currently uploaded. Please upload a PDF first.', 'warning');
    return;
  }

  const modal = document.getElementById('pdf-preview-modal');
  if (!modal) return;

  const iframe = document.getElementById('pdf-preview-iframe');
  const modalFilename = document.getElementById('preview-modal-filename');
  const modalSize = document.getElementById('preview-modal-size');
  const modalChunks = document.getElementById('preview-modal-chunks');
  const popoutLink = document.getElementById('preview-modal-popout');
  const downloadLink = document.getElementById('preview-modal-download');
  const fallbackOpenBtn = document.getElementById('fallback-open-btn');

  const activeName = uploadedFileName || 'Document.pdf';
  if (modalFilename) modalFilename.innerText = activeName;
  if (modalSize) modalSize.innerText = formatBytes(uploadedFileSize);
  if (modalChunks) modalChunks.innerText = `${uploadedFileChunks || 0} text chunks indexed`;

  // Set Iframe source: prefer blob URL if in memory, or backend /view_pdf
  const pdfSource = currentPdfBlobUrl || '/view_pdf#toolbar=1';
  if (iframe) {
    iframe.src = pdfSource;
  }

  if (popoutLink) {
    popoutLink.href = currentPdfBlobUrl || '/view_pdf';
  }
  if (downloadLink) {
    downloadLink.href = '/download_pdf';
  }
  if (fallbackOpenBtn) {
    fallbackOpenBtn.href = currentPdfBlobUrl || '/view_pdf';
  }

  // Load Extracted Chunks
  loadExtractedChunks();

  // Show modal
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  if (window.lucide) lucide.createIcons();
}

function closePdfPreviewModal() {
  const modal = document.getElementById('pdf-preview-modal');
  if (modal) modal.classList.remove('active');
  document.body.style.overflow = '';
}

function handlePreviewOverlayClick(e) {
  if (e.target && e.target.classList.contains('pdf-preview-overlay')) {
    closePdfPreviewModal();
  }
}

function switchPreviewTab(tab) {
  const viewerPane = document.getElementById('preview-pane-viewer');
  const chunksPane = document.getElementById('preview-pane-chunks');
  const tabBtnViewer = document.getElementById('tab-btn-viewer');
  const tabBtnChunks = document.getElementById('tab-btn-chunks');

  if (tab === 'viewer') {
    if (viewerPane) viewerPane.classList.add('active');
    if (chunksPane) chunksPane.classList.remove('active');
    if (tabBtnViewer) tabBtnViewer.classList.add('active');
    if (tabBtnChunks) tabBtnChunks.classList.remove('active');
  } else {
    if (viewerPane) viewerPane.classList.remove('active');
    if (chunksPane) chunksPane.classList.add('active');
    if (tabBtnViewer) tabBtnViewer.classList.remove('active');
    if (tabBtnChunks) tabBtnChunks.classList.add('active');
  }
  if (window.lucide) lucide.createIcons();
}

async function loadExtractedChunks() {
  const container = document.getElementById('preview-chunks-list');
  const chunksBadge = document.getElementById('preview-chunks-badge');
  if (!container) return;

  container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:30px;">Loading extracted vector chunks...</div>';

  try {
    const res = await fetch('/get_current_pdf');
    if (res.ok) {
      const data = await res.json();
      if (data.chunks && data.chunks.length > 0) {
        if (chunksBadge) chunksBadge.innerText = data.chunks.length;
        container.innerHTML = data.chunks.map((chunk, idx) => `
          <div class="chunk-card">
            <div class="chunk-card-header">
              <span>Vector Chunk #${idx + 1} (${chunk.length} characters)</span>
              <button class="chunk-copy-btn" onclick="copyChunkText(this, ${idx})" title="Copy chunk text">
                Copy
              </button>
            </div>
            <div class="chunk-card-text" id="chunk-content-${idx}" style="white-space: pre-wrap;">${escapeHtml(chunk)}</div>
          </div>
        `).join('');
        return;
      }
    }
    container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:30px;">No extracted chunks available yet.</div>';
  } catch (e) {
    container.innerHTML = '<div style="color:var(--text-sub); text-align:center; padding:30px;">Could not load chunks preview.</div>';
  }
}

function copyChunkText(btn, idx) {
  const el = document.getElementById(`chunk-content-${idx}`);
  if (el) {
    navigator.clipboard.writeText(el.innerText).then(() => {
      const prev = btn.innerText;
      btn.innerText = 'Copied!';
      setTimeout(() => btn.innerText = prev, 1500);
    });
  }
}

function quickAskQuestion(q) {
  closePdfPreviewModal();
  const textarea = document.getElementById('pdf-question-input');
  if (textarea) {
    textarea.value = q;
    textarea.focus();
    askPdfQuestion();
  }
}

async function checkExistingPdf() {
  try {
    const res = await fetch('/get_current_pdf');
    if (res.ok) {
      const data = await res.json();
      if (data.has_pdf && data.filename) {
        updateActivePdfDisplay(data.filename, data.size, data.chunk_count);
        // If welcome screen is still there and no messages exist:
        const container = document.getElementById('pdf-chat-messages');
        const welcome = document.getElementById('pdf-welcome-screen');
        if (welcome && container && container.children.length <= 1) {
          welcome.remove();
          renderDocumentCard(data.filename, data.size, data.chunk_count);
          const docTitle = data.title || data.filename.replace(/\.pdf$/i, '');
          const pageCount = data.page_count || 1;
          const pageWord = pageCount === 1 ? '1 page / slide' : `${pageCount} slides`;
          const shortName = data.filename.length > 20 ? data.filename.substring(0, 18) + '...' : data.filename;

          const aiIntroText = `I've received the **${escapeHtml(docTitle)}** presentation PDF. It contains ${pageWord} covering key concepts and contents. <span class="inline-doc-pill" onclick="openPdfPreviewModal()" title="Preview ${escapeHtml(data.filename)}"><svg width="12" height="14" viewBox="0 0 24 28" fill="none" style="vertical-align:middle; margin-right:3px;"><path d="M2 4C2 2.89543 2.89543 2 4 2H14.5858C15.1163 2 15.6251 2.21071 16 2.58579L21.4142 8C21.7893 8.37486 22 8.88368 22 9.41421V24C22 25.1046 21.1046 26 20 26H4C2.89543 26 2 25.1046 2 24V4Z" stroke="#ef4444" stroke-width="2"/><path d="M14 2V8C14 8.55228 14.4477 9 15 9H21" stroke="#ef4444" stroke-width="2"/></svg>${escapeHtml(shortName)}</span>\n\nTell me what you want me to do with it—for example:`;

          renderAIMessageWithSuggestions(aiIntroText, [
            'Explain every slide in detail',
            'Prepare viva questions + answers',
            'Summarize the main objectives and findings',
            'Explain technical architecture and modules'
          ]);
        }
      }
    }
  } catch (e) {
    console.log('No existing PDF detected:', e);
  }
}
