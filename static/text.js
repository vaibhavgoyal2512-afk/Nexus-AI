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

// Load Chat History (Backend + LocalStorage 'ai_chats')
async function loadChats() {
  let localData = [];
  try {
    const raw = localStorage.getItem('ai_chats');
    if (raw) localData = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse local ai_chats', err);
  }

  try {
    const res = await fetch('/get_chats');
    if (res.ok) {
      const serverChats = await res.json();
      // Filter for text chats only
      const serverTextChats = serverChats.filter(c => c.type === 'text');
      
      // Merge server chats and local chats avoiding duplicates
      const mergedMap = new Map();
      serverTextChats.forEach(c => mergedMap.set(String(c.id), c));
      localData.forEach(c => {
        if (!mergedMap.has(String(c.id))) {
          mergedMap.set(String(c.id), c);
        }
      });

      currentChats = Array.from(mergedMap.values());
    } else {
      currentChats = localData;
    }
  } catch (err) {
    console.log('Offline or error loading backend chats, using local storage:', err);
    currentChats = localData;
  }

  // Save merged
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
    const title = chat.title || chat.user || 'Untitled Chat';
    return `
      <div class="history-item ${chat.id === activeChatId ? 'active' : ''}" onclick="selectChat('${chat.id}')">
        <span class="history-item-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        <button class="history-item-del" onclick="deleteChat(event, '${chat.id}')" title="Delete chat">
          <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
        </button>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function selectChat(id) {
  activeChatId = id;
  const chat = currentChats.find(c => String(c.id) === String(id));
  if (!chat) return;

  const container = document.getElementById('chat-messages');
  container.innerHTML = '';

  renderUserMessage(chat.user);
  renderAIMessage(chat.ai);
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

  // Hide welcome screen if present
  const welcome = document.getElementById('welcome-screen');
  if (welcome) welcome.remove();

  // Render User Message (RIGHT side, LEFT text)
  renderUserMessage(prompt);

  // Show AI Loading Indicator (LEFT side)
  const loadingId = 'loading-' + Date.now();
  renderLoadingState(loadingId);

  // Show stop button, disable send button
  setGeneratingState(true);

  abortController = new AbortController();

  try {
    const res = await fetch('/generate_text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
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

    // Save to state & LocalStorage
    const newChatObj = {
      id: Date.now(),
      type: 'text',
      user: prompt,
      ai: aiResponse,
      title: prompt.substring(0, 30)
    };

    currentChats.unshift(newChatObj);
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

async function deleteChat(e, id) {
  e.stopPropagation();
  if (!confirm('Are you sure you want to delete this chat?')) return;

  // Try backend delete
  try {
    await fetch(`/delete_chat/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.log('Backend delete skipped or failed:', err);
  }

  // Delete from local array
  currentChats = currentChats.filter(c => String(c.id) !== String(id));
  localStorage.setItem('ai_chats', JSON.stringify(currentChats));

  if (activeChatId === id) {
    startNewChat();
  } else {
    renderSidebarHistory();
  }
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
