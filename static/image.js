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

// Load Image Chats (Backend + LocalStorage 'image_chats')
async function loadImageChats() {
  let localData = [];
  try {
    const raw = localStorage.getItem('image_chats');
    if (raw) localData = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse local image_chats', err);
  }

  try {
    const res = await fetch('/get_chats');
    if (res.ok) {
      const serverChats = await res.json();
      // Filter for image chats only
      const serverImageChats = serverChats.filter(c => c.type === 'image');
      
      const mergedMap = new Map();
      serverImageChats.forEach(c => mergedMap.set(String(c.id), c));
      localData.forEach(c => {
        if (!mergedMap.has(String(c.id))) {
          mergedMap.set(String(c.id), c);
        }
      });

      currentImageChats = Array.from(mergedMap.values());
    } else {
      currentImageChats = localData;
    }
  } catch (err) {
    console.log('Using local storage for image chats:', err);
    currentImageChats = localData;
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
    const title = chat.title || chat.user || 'Untitled Image';
    return `
      <div class="history-item ${chat.id === activeImageId ? 'active' : ''}" onclick="selectImageChat('${chat.id}')">
        <span class="history-item-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        <button class="history-item-del" onclick="deleteImageChat(event, '${chat.id}')" title="Delete image">
          <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
        </button>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function selectImageChat(id) {
  activeImageId = id;
  const chat = currentImageChats.find(c => String(c.id) === String(id));
  if (!chat) return;

  const feed = document.getElementById('image-feed');
  feed.innerHTML = '';

  renderPromptBubble(chat.user);
  renderGeneratedImage(chat.ai, chat.user);
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

  // Remove welcome state if active
  const welcome = document.getElementById('image-welcome-screen');
  if (welcome) welcome.remove();

  // Render User Prompt Bubble (RIGHT side, text LEFT aligned)
  renderPromptBubble(prompt);

  // Render Skeleton Loading State (LEFT side)
  const loadingId = 'img-loading-' + Date.now();
  renderImageSkeleton(loadingId);

  const sendBtn = document.getElementById('image-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const res = await fetch('/generate_image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();
    removeElement(loadingId);

    if (data.result === 'LIMIT_REACHED') {
      alert('Prompt limit reached! Please log in to generate more images.');
      return;
    }

    if (data.result === 'Image generation failed' || !data.result) {
      alert('Failed to generate image. Please try again.');
      return;
    }

    // Render Generated Image (LEFT side, preserve aspect ratio)
    renderGeneratedImage(data.result, prompt);

    // Store in state & LocalStorage
    const newObj = {
      id: Date.now(),
      type: 'image',
      user: prompt,
      ai: data.result,
      title: prompt.substring(0, 30)
    };

    currentImageChats.unshift(newObj);
    localStorage.setItem('image_chats', JSON.stringify(currentImageChats));
    renderSidebarHistory();

  } catch (err) {
    removeElement(loadingId);
    console.error('Image generation error:', err);
    alert('Network error while generating image.');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
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

async function deleteImageChat(e, id) {
  e.stopPropagation();
  if (!confirm('Delete this saved image?')) return;

  try {
    await fetch(`/delete_chat/${id}`, { method: 'DELETE' });
  } catch (err) {
    console.log('Backend delete image chat failed:', err);
  }

  currentImageChats = currentImageChats.filter(c => String(c.id) !== String(id));
  localStorage.setItem('image_chats', JSON.stringify(currentImageChats));

  if (activeImageId === id) {
    clearImageWorkspace();
  } else {
    renderSidebarHistory();
  }
}

function scrollToBottom() {
  const feed = document.getElementById('image-feed');
  if (feed) feed.scrollTop = feed.scrollHeight;
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
