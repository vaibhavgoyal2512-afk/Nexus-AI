/* static/image.js - AI Image Studio Frontend Logic */

let activeImageId = null;
let currentImageChats = [];

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSidebar();
  initTextareaAutoResize();
  loadImageChats();
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

function initTextareaAutoResize() {
  const textarea = document.getElementById('image-prompt-input');
  if (!textarea) return;

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      generateImage();
    }
  });
}

async function loadImageChats() {
  try {
    const res = await fetch('/get_chats');
    if (res.ok) {
      const serverChats = await res.json();
      currentImageChats = serverChats.filter(c => c.type === 'image' || (c.messages && c.messages.some(m => m.type === 'image')));
    } else {
      const raw = localStorage.getItem('image_chats');
      if (raw) currentImageChats = JSON.parse(raw);
    }
  } catch (err) {
    console.error('Using local storage for image chats due to error:', err);
    try {
      const raw = localStorage.getItem('image_chats');
      if (raw) currentImageChats = JSON.parse(raw);
    } catch (e) {}
  }

  localStorage.setItem('image_chats', JSON.stringify(currentImageChats));
  renderSidebarHistory();
}

function renderSidebarHistory() {
  const listContainer = document.getElementById('image-history-list');
  if (!listContainer) return;

  if (currentImageChats.length === 0) {
    listContainer.innerHTML = '<div style="padding:10px; font-size:0.8rem; color:var(--text-muted);">No image history yet</div>';
    return;
  }

  listContainer.innerHTML = currentImageChats.map((chat) => {
    const cid = String(chat.conversation_id || chat.id);
    const title = chat.title || (chat.messages && chat.messages[0] ? chat.messages[0].user : chat.user) || 'Untitled Image';
    const isActive = String(activeImageId) === cid;

    return `
      <div class="history-item ${isActive ? 'active' : ''}" onclick="selectImageChat('${cid}')">
        <span class="history-item-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        <div style="display:flex; align-items:center; gap:4px;">
          <button class="history-item-del" onclick="renameImageChat(event, '${cid}')" title="Rename image" style="opacity: 0.7;">
            <i data-lucide="pencil" style="width:13px; height:13px;"></i>
          </button>
          <button class="history-item-del" onclick="deleteImageChat(event, '${cid}')" title="Delete image">
            <i data-lucide="trash-2" style="width:13px; height:13px;"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

async function selectImageChat(id) {
  activeImageId = String(id);
  const chat = currentImageChats.find(c => String(c.conversation_id || c.id) === String(id));

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
      console.log('Using cached messages for image conversation:', err);
    }
  }

  if (!chat) return;

  const feed = document.getElementById('image-feed');
  feed.innerHTML = '';

  const msgs = chat.messages || [{ user: chat.user, ai: chat.ai }];
  msgs.forEach(m => {
    if (m.user) renderPromptBubble(m.user);
    if (m.ai) renderGeneratedImage(m.ai, m.user);
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

function clearImageWorkspace() {
  activeImageId = null;
  const feed = document.getElementById('image-feed');
  feed.innerHTML = `
    <div class="welcome-container" id="image-welcome-screen">
      <div class="welcome-icon" style="background: linear-gradient(135deg, #ec4899, #f43f5e);">
        <i data-lucide="palette"></i>
      </div>
      <h2 class="welcome-title">Transform Imagination into Art</h2>
      <p class="welcome-sub">Describe a scene, landscape, or futuristic concept to generate stunning visual artwork.</p>

      <div class="suggestion-grid">
        <div class="suggestion-card" onclick="useImagePreset('Cyberpunk city with glowing neon lights and flying vehicles at rain night, 8k resolution hyperrealistic.')">
          <h4>Cyberpunk Neon City</h4>
          <p>Rainy night futuristic metropolis</p>
        </div>
        <div class="suggestion-card" onclick="useImagePreset('Serene Zen garden with koi pond, cherry blossom trees, and soft morning mist, watercolor style.')">
          <h4>Zen Garden Mist</h4>
          <p>Watercolor Japanese landscape</p>
        </div>
        <div class="suggestion-card" onclick="useImagePreset('Cute 3D Pixar style robot gardening in a vibrant green greenhouse, cinematic studio lighting.')">
          <h4>3D Pixar Gardener</h4>
          <p>Cute animated character art</p>
        </div>
        <div class="suggestion-card" onclick="useImagePreset('Epic fantasy dragon soaring over snowy mountain peaks under purple aurora borealis.')">
          <h4>Fantasy Mountain Dragon</h4>
          <p>Epic mythical scenery</p>
        </div>
      </div>
    </div>
  `;
  lucide.createIcons();
  renderSidebarHistory();
  closeMobileSidebar();
}

function useImagePreset(text) {
  const textarea = document.getElementById('image-prompt-input');
  if (textarea) {
    textarea.value = text;
    generateImage();
  }
}

// Generate Image Request Flow
async function generateImage() {
  const textarea = document.getElementById('image-prompt-input');
  const prompt = textarea.value.trim();
  if (!prompt) return;

  textarea.value = '';
  textarea.style.height = 'auto';

  const welcome = document.getElementById('image-welcome-screen');
  if (welcome) welcome.remove();

  renderPromptBubble(prompt);

  const loadingId = 'img-loading-' + Date.now();
  renderImageSkeleton(loadingId);

  const sendBtn = document.getElementById('image-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const res = await fetch('/generate_image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, conversation_id: activeImageId })
    });

    const data = await res.json();
    removeElement(loadingId);

    if (data.result === 'LIMIT_REACHED') {
      showToast('Prompt limit reached! Please log in to generate more images.', 'warning');
      return;
    }

    if (data.result === 'Image generation failed' || !data.result) {
      showToast('Failed to generate image. Please try again.', 'error');
      return;
    }

    renderGeneratedImage(data.result, prompt);

    const convId = String(data.conversation_id || activeImageId || ('conv_' + Date.now()));
    const targetChatId = activeImageId || convId;
    activeImageId = convId;

    let convObj = currentImageChats.find(c => 
      String(c.conversation_id || c.id) === String(convId) || 
      String(c.conversation_id || c.id) === String(targetChatId) ||
      String(c.id) === String(convId) ||
      String(c.id) === String(targetChatId)
    );

    if (convObj) {
      convObj.conversation_id = convId;
      convObj.id = convObj.id || convId;
      if (!convObj.messages) convObj.messages = [];
      convObj.messages.push({ id: Date.now(), user: prompt, ai: data.result, type: 'image' });
    } else {
      convObj = {
        id: convId,
        conversation_id: convId,
        type: 'image',
        title: prompt.substring(0, 30),
        user: prompt,
        ai: data.result,
        messages: [{ id: Date.now(), user: prompt, ai: data.result, type: 'image' }]
      };
      currentImageChats.unshift(convObj);
    }

    localStorage.setItem('image_chats', JSON.stringify(currentImageChats));
    renderSidebarHistory();

  } catch (err) {
    removeElement(loadingId);
    console.error('Image generation error:', err);
    showToast('Network error while generating image.', 'error');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function renameImageChat(e, id) {
  if (e) e.stopPropagation();
  const chat = currentImageChats.find(c => String(c.conversation_id || c.id) === String(id));
  if (!chat) return;

  showRenameModal(chat.title || '', async (newTitle) => {
    chat.title = newTitle;
    localStorage.setItem('image_chats', JSON.stringify(currentImageChats));
    renderSidebarHistory();

    try {
      const res = await fetch(`/rename_chat/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });
      if (res.ok) {
        showToast('Image chat renamed', 'success');
      } else {
        showToast('Failed to rename image chat', 'error');
      }
    } catch (err) {
      console.error('Error renaming image chat:', err);
      showToast('Error renaming image chat', 'error');
    }
  });
}

function deleteImageChat(e, id) {
  if (e) e.stopPropagation();

  showDeleteModal(async () => {
    currentImageChats = currentImageChats.filter(c => String(c.conversation_id || c.id) !== String(id));
    localStorage.setItem('image_chats', JSON.stringify(currentImageChats));

    if (String(activeImageId) === String(id)) {
      clearImageWorkspace();
    } else {
      renderSidebarHistory();
    }

    try {
      const res = await fetch(`/delete_chat/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Image chat deleted', 'success');
      } else {
        showToast('Failed to delete image chat', 'error');
      }
    } catch (err) {
      console.log('Backend delete image chat failed:', err);
      showToast('Error deleting image chat', 'error');
    }
  }, 'This saved image conversation will be permanently deleted.');
}

// User Prompt Bubble: RIGHT side, text LEFT aligned
function renderPromptBubble(promptText) {
  const feed = document.getElementById('image-feed');
  const row = document.createElement('div');
  row.className = 'prompt-row';
  row.innerHTML = `
    <div class="prompt-bubble">${escapeHtml(promptText)}</div>
  `;
  feed.appendChild(row);
  scrollToBottom();
}

// Generated Image: LEFT side, preserved aspect ratio
function renderGeneratedImage(base64Str, promptText) {
  const feed = document.getElementById('image-feed');
  const row = document.createElement('div');
  row.className = 'image-row';

  const imgSrc = base64Str.startsWith('data:') ? base64Str : `data:image/png;base64,${base64Str}`;

  row.innerHTML = `
    <div class="message-avatar">
      <i data-lucide="sparkles" style="width:20px; height:20px;"></i>
    </div>
    <div class="image-card-wrapper">
      <div class="generated-image-box">
        <img src="${imgSrc}" alt="${escapeHtml(promptText)}" loading="lazy" />
      </div>
      <div class="image-actions">
        <span class="image-prompt-tag" title="${escapeHtml(promptText)}">${escapeHtml(promptText)}</span>
        <button class="btn-download" onclick="downloadImage('${imgSrc}', 'nexus-art.png')">
          <i data-lucide="download" style="width:14px; height:14px;"></i>
          <span>Download</span>
        </button>
      </div>
    </div>
  `;
  feed.appendChild(row);
  lucide.createIcons();
  scrollToBottom();
}

function renderImageSkeleton(id) {
  const feed = document.getElementById('image-feed');
  const row = document.createElement('div');
  row.className = 'image-row';
  row.id = id;
  row.innerHTML = `
    <div class="message-avatar">
      <i data-lucide="sparkles" style="width:20px; height:20px;"></i>
    </div>
    <div class="image-card-wrapper">
      <div class="skeleton-image"></div>
      <div style="font-size:0.85rem; color:var(--text-sub);">Rendering with FLUX.1 Schnell...</div>
    </div>
  `;
  feed.appendChild(row);
  lucide.createIcons();
  scrollToBottom();
}

function downloadImage(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function scrollToBottom() {
  const feed = document.getElementById('image-feed');
  if (feed) feed.scrollTop = feed.scrollHeight;
}

function removeElement(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}
