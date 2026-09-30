/* static/text.js - Text Generator Frontend Logic */

let activeChatId = null;
let currentChats = [];
let abortController = null;

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSidebar();
  initTextareaAutoResize();
  loadChats();
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

// Sidebar Drawer & Desktop Collapse Toggle
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

// Textarea Auto-Resize & Enter key handler
function initTextareaAutoResize() {
  const textarea = document.getElementById('prompt-input');
  if (!textarea) return;

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

async function loadChats() {
  try {
    const res = await fetch('/get_chats');
    if (res.ok) {
      const serverChats = await res.json();
      currentChats = serverChats.filter(c => c.type === 'text' || !c.type || (c.messages && c.messages.some(m => m.type === 'text')));
    } else {
      const raw = localStorage.getItem('ai_chats');
      if (raw) currentChats = JSON.parse(raw);
    }
  } catch (err) {
    console.error('Using local storage for text chats due to error:', err);
    try {
      const raw = localStorage.getItem('ai_chats');
      if (raw) currentChats = JSON.parse(raw);
    } catch (e) {}
  }

  localStorage.setItem('ai_chats', JSON.stringify(currentChats));
  renderSidebarHistory();
}

function renderSidebarHistory() {
  const listContainer = document.getElementById('history-list');
  if (!listContainer) return;

  if (currentChats.length === 0) {
    listContainer.innerHTML = '<div style="padding:10px; font-size:0.8rem; color:var(--text-muted);">No text chats yet</div>';
    return;
  }

  listContainer.innerHTML = currentChats.map((chat) => {
    const cid = String(chat.conversation_id || chat.id);
    const title = chat.title || (chat.messages && chat.messages[0] ? chat.messages[0].user : chat.user) || 'Untitled Chat';
    const isActive = String(activeChatId) === cid;

    return `
      <div class="history-item ${isActive ? 'active' : ''}" onclick="selectChat('${cid}')">
        <span class="history-item-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        <div style="display:flex; align-items:center; gap:4px;">
          <button class="history-item-del" onclick="renameChat(event, '${cid}')" title="Rename chat" style="opacity: 0.7;">
            <i data-lucide="pencil" style="width:13px; height:13px;"></i>
          </button>
          <button class="history-item-del" onclick="deleteChat(event, '${cid}')" title="Delete chat">
            <i data-lucide="trash-2" style="width:13px; height:13px;"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

async function selectChat(id) {
  activeChatId = String(id);
  const chat = currentChats.find(c => String(c.conversation_id || c.id) === String(id));
  
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
      console.log('Using cached messages for conversation:', err);
    }
  }

  if (!chat) return;

  const container = document.getElementById('chat-messages');
  container.innerHTML = '';

  const msgs = chat.messages || [{ user: chat.user, ai: chat.ai }];
  msgs.forEach(m => {
    if (m.user) renderUserMessage(m.user);
    if (m.ai) renderAIMessage(m.ai);
  });

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

function startNewChat() {
  activeChatId = null;
  const container = document.getElementById('chat-messages');
  container.innerHTML = `
    <div class="welcome-container" id="welcome-screen">
      <div class="welcome-icon">
        <i data-lucide="bot"></i>
      </div>
      <h2 class="welcome-title">How can Nexus AI assist you today?</h2>
      <p class="welcome-sub">Type a prompt below or pick one of these suggestions to get started.</p>

      <div class="suggestion-grid">
        <div class="suggestion-card" onclick="useSuggestion('Write a clean Python script for web scraping HTML tables.')">
          <h4>Python Web Scraper</h4>
          <p>Scrape tables into clean JSON data</p>
        </div>
        <div class="suggestion-card" onclick="useSuggestion('Explain quantum computing in simple terms for a beginner.')">
          <h4>Quantum Computing</h4>
          <p>Simple conceptual explanation</p>
        </div>
        <div class="suggestion-card" onclick="useSuggestion('Draft a professional email proposing a project partnership.')">
          <h4>Business Email</h4>
          <p>Partnership proposal draft</p>
        </div>
        <div class="suggestion-card" onclick="useSuggestion('Create an optimized SQL query for user activity metrics.')">
          <h4>SQL Metrics Query</h4>
          <p>Data aggregation & indexing</p>
        </div>
      </div>
    </div>
  `;
  lucide.createIcons();
  renderSidebarHistory();
  closeMobileSidebar();
}

function useSuggestion(text) {
  const textarea = document.getElementById('prompt-input');
  if (textarea) {
    textarea.value = text;
    sendMessage();
  }
}

// Send Message Flow
async function sendMessage() {
  const textarea = document.getElementById('prompt-input');
  const prompt = textarea.value.trim();
  if (!prompt) return;

  textarea.value = '';
  textarea.style.height = 'auto';

  const welcome = document.getElementById('welcome-screen');
  if (welcome) welcome.remove();

  renderUserMessage(prompt);

  const loadingId = 'loading-' + Date.now();
  renderLoadingState(loadingId);

  setGeneratingState(true);
  abortController = new AbortController();

  try {
    const res = await fetch('/generate_text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, conversation_id: activeChatId }),
      signal: abortController.signal
    });

    const data = await res.json();
    removeElement(loadingId);

    if (data.result === 'LIMIT_REACHED') {
      renderAIMessage('⚠️ **Prompt limit reached.** Free limit is 50 prompts without login. Please [Login](/login) or [Register](/register) to continue using Nexus AI.');
      setGeneratingState(false);
      return;
    }

    const aiResponse = data.result || 'An error occurred generating text.';
    renderAIMessage(aiResponse);

    const convId = String(data.conversation_id || activeChatId || ('conv_' + Date.now()));
    const targetChatId = activeChatId || convId;
    activeChatId = convId;

    let convObj = currentChats.find(c => 
      String(c.conversation_id || c.id) === String(convId) || 
      String(c.conversation_id || c.id) === String(targetChatId) ||
      String(c.id) === String(convId) ||
      String(c.id) === String(targetChatId)
    );

    if (convObj) {
      convObj.conversation_id = convId;
      convObj.id = convObj.id || convId;
      if (!convObj.messages) convObj.messages = [];
      convObj.messages.push({ id: Date.now(), user: prompt, ai: aiResponse, type: 'text' });
    } else {
      convObj = {
        id: convId,
        conversation_id: convId,
        type: 'text',
        title: prompt.substring(0, 30),
        user: prompt,
        ai: aiResponse,
        messages: [{ id: Date.now(), user: prompt, ai: aiResponse, type: 'text' }]
      };
      currentChats.unshift(convObj);
    }

    localStorage.setItem('ai_chats', JSON.stringify(currentChats));
    renderSidebarHistory();

  } catch (err) {
    removeElement(loadingId);
    if (err.name === 'AbortError') {
      renderAIMessage('_Generation stopped by user._');
    } else {
      console.error('Error generating text:', err);
      renderAIMessage('❌ Connection error. Please check your server or network.');
    }
  } finally {
    setGeneratingState(false);
  }
}

function renameChat(e, id) {
  if (e) e.stopPropagation();
  const chat = currentChats.find(c => String(c.conversation_id || c.id) === String(id));
  if (!chat) return;

  showRenameModal(chat.title || '', async (newTitle) => {
    chat.title = newTitle;
    localStorage.setItem('ai_chats', JSON.stringify(currentChats));
    renderSidebarHistory();

    try {
      const res = await fetch(`/rename_chat/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });
      if (res.ok) {
        showToast('Conversation renamed', 'success');
      } else {
        showToast('Failed to rename conversation', 'error');
      }
    } catch (err) {
      console.error('Error renaming conversation:', err);
      showToast('Error renaming conversation', 'error');
    }
  });
}

function deleteChat(e, id) {
  if (e) e.stopPropagation();

  showDeleteModal(async () => {
    currentChats = currentChats.filter(c => String(c.conversation_id || c.id) !== String(id));
    localStorage.setItem('ai_chats', JSON.stringify(currentChats));

    if (String(activeChatId) === String(id)) {
      startNewChat();
    } else {
      renderSidebarHistory();
    }

    try {
      const res = await fetch(`/delete_chat/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Conversation deleted', 'success');
      } else {
        showToast('Failed to delete conversation', 'error');
      }
    } catch (err) {
      console.error('Error deleting conversation:', err);
      showToast('Error deleting conversation', 'error');
    }
  });
}

function stopGeneration() {
  if (abortController) {
    abortController.abort();
  }
}

function setGeneratingState(isGenerating) {
  const sendBtn = document.getElementById('send-btn');
  const stopBtn = document.getElementById('stop-btn');
  if (sendBtn) sendBtn.disabled = isGenerating;
  if (stopBtn) stopBtn.style.display = isGenerating ? 'inline-flex' : 'none';
}

// Render User Bubble (RIGHT side, text LEFT aligned)
function renderUserMessage(text) {
  const container = document.getElementById('chat-messages');
  const row = document.createElement('div');
  row.className = 'message-row user';
  row.innerHTML = `
    <div class="message-bubble">${escapeHtml(text)}</div>
  `;
  container.appendChild(row);
  scrollToBottom();
}

// Render AI Bubble (LEFT side) with Markdown & Action Buttons
function renderAIMessage(text) {
  const container = document.getElementById('chat-messages');
  const row = document.createElement('div');
  row.className = 'message-row ai';

  let formattedHtml = text;
  if (window.marked) {
    formattedHtml = marked.parse(text);
  } else {
    formattedHtml = escapeHtml(text).replace(/\n/g, '<br>');
  }

  const msgId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
  row.setAttribute('id', msgId);
  row.setAttribute('data-raw-text', text);

  row.innerHTML = `
    <div class="message-avatar">
      <i data-lucide="bot" style="width:20px; height:20px;"></i>
    </div>
    <div class="message-bubble">
      <div class="message-text-content">${formattedHtml}</div>
      <div class="message-actions-bar">
        <button class="btn-msg-action" onclick="copyMessageText(this)" title="Copy Text">
          <i data-lucide="copy" style="width:13px; height:13px;"></i>
          <span>Copy</span>
        </button>
        <button class="btn-msg-action" onclick="exportMessageToPdf('${msgId}')" title="Generate PDF Document">
          <i data-lucide="file-down" style="width:13px; height:13px; color:var(--primary);"></i>
          <span>Export PDF</span>
        </button>
      </div>
    </div>
  `;
  container.appendChild(row);

  // Apply Code Highlighting & Copy Buttons
  row.querySelectorAll('pre code').forEach((block) => {
    if (window.hljs) hljs.highlightElement(block);
    
    const pre = block.parentElement;
    if (!pre.querySelector('.copy-code-btn')) {
      const btn = document.createElement('button');
      btn.className = 'copy-code-btn';
      btn.innerText = 'Copy';
      btn.onclick = () => {
        navigator.clipboard.writeText(block.innerText);
        btn.innerText = 'Copied!';
        setTimeout(() => btn.innerText = 'Copy', 2000);
      };
      pre.appendChild(btn);
    }
  });

  lucide.createIcons();
  scrollToBottom();
}

function copyMessageText(btn) {
  const row = btn.closest('.message-row');
  const rawText = row ? row.getAttribute('data-raw-text') : '';
  if (rawText) {
    navigator.clipboard.writeText(rawText);
    const span = btn.querySelector('span');
    if (span) {
      const orig = span.innerText;
      span.innerText = 'Copied!';
      setTimeout(() => span.innerText = orig, 2000);
    }
  }
}

function exportMessageToPdf(msgId) {
  const row = document.getElementById(msgId);
  const messageTextEl = row ? row.querySelector('.message-text-content') : null;
  const rawText = row ? row.getAttribute('data-raw-text') : '';
  if (!messageTextEl && !rawText) return;

  // Build a styled HTML container for PDF generation
  const pdfContainer = document.createElement('div');
  pdfContainer.style.padding = '24px';
  pdfContainer.style.fontFamily = "'Plus Jakarta Sans', Arial, sans-serif";
  pdfContainer.style.color = '#0f172a';
  pdfContainer.style.backgroundColor = '#ffffff';
  pdfContainer.style.fontSize = '14px';
  pdfContainer.style.lineHeight = '1.6';

  const htmlContent = messageTextEl ? messageTextEl.innerHTML : (window.marked ? marked.parse(rawText) : rawText.replace(/\n/g, '<br>'));

  pdfContainer.innerHTML = `
    <div style="border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2 style="margin: 0; color: #4f46e5; font-size: 18px; font-weight: 800;">Nexus AI - Generated Report</h2>
        <span style="color: #64748b; font-size: 11px;">Exported on: ${new Date().toLocaleString()}</span>
      </div>
    </div>
    <div class="pdf-body" style="color: #1e293b;">
      ${htmlContent}
    </div>
  `;

  // Clean elements not needed in PDF
  pdfContainer.querySelectorAll('.copy-code-btn').forEach(btn => btn.remove());
  pdfContainer.querySelectorAll('.message-actions-bar').forEach(bar => bar.remove());

  // Style pre code blocks cleanly for PDF document
  pdfContainer.querySelectorAll('pre').forEach(pre => {
    pre.style.background = '#0f172a';
    pre.style.color = '#f8fafc';
    pre.style.padding = '14px';
    pre.style.borderRadius = '8px';
    pre.style.margin = '14px 0';
    pre.style.fontFamily = 'monospace';
    pre.style.whiteSpace = 'pre-wrap';
  });

  const opt = {
    margin: [12, 12, 12, 12],
    filename: `Nexus-AI-Report-${Date.now()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  if (window.html2pdf) {
    html2pdf().set(opt).from(pdfContainer).save();
  } else {
    // Printable window fallback
    const printWin = window.open('', '_blank');
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Nexus AI PDF Report</title>
          <style>
            body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; padding: 40px; color: #0f172a; line-height: 1.6; }
            h1, h2, h3 { color: #4f46e5; }
            pre { background: #0f172a; color: #f8fafc; padding: 14px; border-radius: 8px; }
            hr { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }
          </style>
        </head>
        <body>${pdfContainer.innerHTML}</body>
        <script>window.onload = function() { window.print(); }</script>
      </html>
    `);
    printWin.document.close();
  }
}

function renderLoadingState(id) {
  const container = document.getElementById('chat-messages');
  const row = document.createElement('div');
  row.className = 'message-row ai';
  row.id = id;
  row.innerHTML = `
    <div class="message-avatar">
      <i data-lucide="bot" style="width:20px; height:20px;"></i>
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
  const container = document.getElementById('chat-messages');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

function removeElement(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}
