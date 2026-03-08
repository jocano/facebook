/**
 * Facebook Posts – app.js
 *
 * A self-contained, single-page posts feed with:
 *   • Create / edit / delete posts
 *   • Like / unlike posts
 *   • Add & display comments
 *   • LocalStorage persistence
 */

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'fb_posts';
const CURRENT_USER = { name: 'You', initials: 'YO', color: '#1877f2' };

// ── State ─────────────────────────────────────────────────────────────────────
let posts = [];
let editingPostId = null;
let pendingImageDataUrl = null;

// ── Persistence ───────────────────────────────────────────────────────────────
function loadPosts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    posts = raw ? JSON.parse(raw) : [];
  } catch {
    posts = [];
  }
}

function savePosts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60)  return 'Just now';
  if (diffMin < 60)  return `${diffMin}m`;
  if (diffHr < 24)   return `${diffHr}h`;
  if (diffDay < 7)   return `${diffDay}d`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function avatarHTML(initials, color, sizeClass = '') {
  return `<div class="avatar ${sizeClass}" style="background:${escapeHtml(color)}" aria-hidden="true">${escapeHtml(initials)}</div>`;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── Render feed ───────────────────────────────────────────────────────────────
function renderFeed() {
  const feed = $('feed');
  if (posts.length === 0) {
    feed.innerHTML = `<div class="empty-state">No posts yet. Be the first to share something!</div>`;
    return;
  }

  feed.innerHTML = posts
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(renderPost)
    .join('');

  // Attach per-post event listeners after rendering
  posts.forEach((post) => {
    attachPostListeners(post.id);
  });
}

function renderPost(post) {
  const isLarge = post.text.length < 130 && !post.image;
  const likeLabel = post.likes === 1 ? '1 Like' : `${post.likes} Likes`;
  const commentCount = post.comments.length;
  const commentLabel = commentCount === 1 ? '1 Comment' : `${commentCount} Comments`;

  return `
  <article class="card post-card" data-id="${escapeHtml(post.id)}">
    <div class="post-header">
      ${avatarHTML(post.author.initials, post.author.color)}
      <div class="post-author">
        <div class="post-author-name">${escapeHtml(post.author.name)}</div>
        <div class="post-meta">
          <span>${formatDate(post.createdAt)}</span>
          ${post.edited ? '<span>· Edited</span>' : ''}
          <span>🌐</span>
        </div>
      </div>
      <div style="position:relative">
        <button class="post-options-btn" aria-label="Post options" data-action="toggleOptions" data-postid="${escapeHtml(post.id)}">···</button>
        <div class="post-options-menu hidden" id="optionsMenu-${escapeHtml(post.id)}">
          <button data-action="editPost" data-postid="${escapeHtml(post.id)}">✏️ Edit post</button>
          <button data-action="deletePost" data-postid="${escapeHtml(post.id)}">🗑️ Delete post</button>
        </div>
      </div>
    </div>

    <div class="post-body">
      <p class="post-text ${isLarge ? 'post-text-large' : ''}">${escapeHtml(post.text)}</p>
      ${post.image ? `<img class="post-image" src="${escapeHtml(post.image)}" alt="Post image" loading="lazy" />` : ''}
    </div>

    ${post.likes > 0 || commentCount > 0 ? `
    <div class="reaction-bar">
      <div class="like-count-display">
        ${post.likes > 0 ? `<span class="like-emoji">👍</span><span>${escapeHtml(likeLabel)}</span>` : ''}
      </div>
      ${commentCount > 0 ? `<span>${escapeHtml(commentLabel)}</span>` : ''}
    </div>` : ''}

    <div class="post-actions">
      <button class="action-btn ${post.likedByMe ? 'liked' : ''}" data-action="likePost" data-postid="${escapeHtml(post.id)}" aria-pressed="${post.likedByMe}">
        👍 ${post.likedByMe ? 'Liked' : 'Like'}
      </button>
      <button class="action-btn" data-action="toggleComments" data-postid="${escapeHtml(post.id)}">
        💬 Comment
      </button>
    </div>

    <div class="comments-section hidden" id="comments-${escapeHtml(post.id)}">
      <div class="comment-list" id="commentList-${escapeHtml(post.id)}">
        ${post.comments.map(renderComment).join('')}
      </div>
      <div class="comment-input-row">
        ${avatarHTML(CURRENT_USER.initials, CURRENT_USER.color, 'avatar-xs')}
        <textarea
          class="comment-input"
          id="commentInput-${escapeHtml(post.id)}"
          placeholder="Write a comment…"
          rows="1"
          maxlength="1000"
          aria-label="Write a comment"
        ></textarea>
        <button class="comment-send-btn" id="commentSend-${escapeHtml(post.id)}" aria-label="Post comment" disabled>➤</button>
      </div>
    </div>
  </article>`;
}

function renderComment(comment) {
  return `
  <div class="comment-item">
    ${avatarHTML(comment.author.initials, comment.author.color, 'avatar-xs')}
    <div class="comment-bubble">
      <div class="comment-author">${escapeHtml(comment.author.name)}</div>
      <div class="comment-text">${escapeHtml(comment.text)}</div>
      <div class="comment-time">${formatDate(comment.createdAt)}</div>
    </div>
  </div>`;
}

// ── Post listeners (delegated per post) ───────────────────────────────────────
function attachPostListeners(postId) {
  const commentInput = $(`commentInput-${postId}`);
  const commentSend  = $(`commentSend-${postId}`);

  if (commentInput) {
    commentInput.addEventListener('input', () => {
      const hasText = commentInput.value.trim().length > 0;
      commentSend.disabled = !hasText;
      // Auto-grow
      commentInput.style.height = 'auto';
      commentInput.style.height = commentInput.scrollHeight + 'px';
    });

    commentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!commentSend.disabled) submitComment(postId);
      }
    });
  }

  if (commentSend) {
    commentSend.addEventListener('click', () => submitComment(postId));
  }
}

// ── Global event delegation ───────────────────────────────────────────────────
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) {
    // Close any open options menus on outside click
    closeAllOptionMenus();
    return;
  }

  const action = btn.dataset.action;
  const postId = btn.dataset.postid;

  switch (action) {
    case 'toggleOptions':  toggleOptionsMenu(postId); break;
    case 'editPost':       openEditPostModal(postId); break;
    case 'deletePost':     deletePost(postId); break;
    case 'likePost':       toggleLike(postId); break;
    case 'toggleComments': toggleComments(postId); break;
  }
});

// ── Options menu ──────────────────────────────────────────────────────────────
function closeAllOptionMenus() {
  document.querySelectorAll('.post-options-menu').forEach((m) => m.classList.add('hidden'));
}

function toggleOptionsMenu(postId) {
  const menu = $(`optionsMenu-${postId}`);
  if (!menu) return;
  const isHidden = menu.classList.contains('hidden');
  closeAllOptionMenus();
  if (isHidden) menu.classList.remove('hidden');
}

// ── Like ──────────────────────────────────────────────────────────────────────
function toggleLike(postId) {
  const post = posts.find((p) => p.id === postId);
  if (!post) return;
  post.likedByMe = !post.likedByMe;
  post.likes += post.likedByMe ? 1 : -1;
  savePosts();
  renderFeed();
}

// ── Comments ──────────────────────────────────────────────────────────────────
function toggleComments(postId) {
  const section = $(`comments-${postId}`);
  if (!section) return;
  section.classList.toggle('hidden');
  if (!section.classList.contains('hidden')) {
    const input = $(`commentInput-${postId}`);
    if (input) input.focus();
  }
}

function updateReactionBar(post) {
  const article = document.querySelector(`[data-id="${CSS.escape(post.id)}"]`);
  if (!article) return;

  const likeLabel    = post.likes === 1 ? '1 Like' : `${post.likes} Likes`;
  const commentCount = post.comments.length;
  const commentLabel = commentCount === 1 ? '1 Comment' : `${commentCount} Comments`;

  // Remove existing reaction bar if present
  const existing = article.querySelector('.reaction-bar');
  if (existing) existing.remove();

  if (post.likes > 0 || commentCount > 0) {
    const bar = document.createElement('div');
    bar.className = 'reaction-bar';
    bar.innerHTML = `
      <div class="like-count-display">
        ${post.likes > 0 ? `<span class="like-emoji">👍</span><span>${escapeHtml(likeLabel)}</span>` : ''}
      </div>
      ${commentCount > 0 ? `<span>${escapeHtml(commentLabel)}</span>` : ''}`;

    const actions = article.querySelector('.post-actions');
    if (actions) article.insertBefore(bar, actions);
  }
}

function submitComment(postId) {
  const input = $(`commentInput-${postId}`);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  post.comments.push({
    id: generateId(),
    author: { ...CURRENT_USER },
    text,
    createdAt: new Date().toISOString(),
  });

  savePosts();

  // Re-render just the comment list to preserve textarea focus
  const listEl = $(`commentList-${postId}`);
  if (listEl) listEl.innerHTML = post.comments.map(renderComment).join('');

  input.value = '';
  input.style.height = 'auto';
  $(`commentSend-${postId}`).disabled = true;

  // Update just the reaction bar of this post
  updateReactionBar(post);

  // Ensure the comments section stays visible
  const section = $(`comments-${postId}`);
  if (section) section.classList.remove('hidden');
}

// ── Delete post ───────────────────────────────────────────────────────────────
function deletePost(postId) {
  if (!confirm('Delete this post?')) return;
  posts = posts.filter((p) => p.id !== postId);
  savePosts();
  renderFeed();
}

// ── Create / Edit modal ───────────────────────────────────────────────────────
function openCreatePostModal() {
  editingPostId = null;
  pendingImageDataUrl = null;
  $('modalTitle').textContent = 'Create post';
  $('postContent').value = '';
  $('charCount').textContent = '0';
  $('submitPost').disabled = true;
  $('imagePreviewWrap').classList.add('hidden');
  $('imagePreview').src = '';
  $('postImageInput').value = '';
  openModal();
}

function openEditPostModal(postId) {
  closeAllOptionMenus();
  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  editingPostId = postId;
  pendingImageDataUrl = post.image || null;
  $('modalTitle').textContent = 'Edit post';
  $('postContent').value = post.text;
  $('charCount').textContent = post.text.length;
  $('submitPost').disabled = post.text.trim().length === 0;

  if (post.image) {
    $('imagePreview').src = post.image;
    $('imagePreviewWrap').classList.remove('hidden');
  } else {
    $('imagePreview').src = '';
    $('imagePreviewWrap').classList.add('hidden');
  }

  openModal();
}

function openModal() {
  $('postModalBackdrop').classList.remove('hidden');
  $('postContent').focus();
}

function closeModal() {
  $('postModalBackdrop').classList.add('hidden');
  editingPostId = null;
  pendingImageDataUrl = null;
}

function submitPost() {
  const text = $('postContent').value.trim();
  if (!text && !pendingImageDataUrl) return;

  if (editingPostId) {
    const post = posts.find((p) => p.id === editingPostId);
    if (post) {
      post.text   = text;
      post.image  = pendingImageDataUrl;
      post.edited = true;
    }
  } else {
    posts.push({
      id:        generateId(),
      author:    { ...CURRENT_USER },
      text,
      image:     pendingImageDataUrl,
      likes:     0,
      likedByMe: false,
      comments:  [],
      createdAt: new Date().toISOString(),
      edited:    false,
    });
  }

  savePosts();
  closeModal();
  renderFeed();
}

// ── Image upload ──────────────────────────────────────────────────────────────
function handleImageUpload(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingImageDataUrl = e.target.result;
    $('imagePreview').src = pendingImageDataUrl;
    $('imagePreviewWrap').classList.remove('hidden');
    $('submitPost').disabled = $('postContent').value.trim().length === 0 && !pendingImageDataUrl;
  };
  reader.readAsDataURL(file);
}

// ── Wiring ────────────────────────────────────────────────────────────────────
function init() {
  loadPosts();

  // Populate current user avatar in header & create-post card
  const headerAvatar   = $('currentUserAvatar');
  const createAvatar   = $('createPostAvatar');
  const modalAvatarEl  = $('modalAvatar');

  [headerAvatar, createAvatar, modalAvatarEl].forEach((el) => {
    if (!el) return;
    el.textContent = CURRENT_USER.initials;
    el.style.background = CURRENT_USER.color;
  });

  $('currentUserName').textContent  = CURRENT_USER.name;
  $('modalUserName').textContent    = CURRENT_USER.name;

  // Open modal
  $('openCreatePostModal').addEventListener('click', openCreatePostModal);
  $('closePostModal').addEventListener('click', closeModal);

  // Close modal on backdrop click
  $('postModalBackdrop').addEventListener('click', (e) => {
    if (e.target === $('postModalBackdrop')) closeModal();
  });

  // Keyboard: Escape closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Post textarea
  $('postContent').addEventListener('input', () => {
    const len = $('postContent').value.length;
    $('charCount').textContent = len;
    $('submitPost').disabled = $('postContent').value.trim().length === 0 && !pendingImageDataUrl;
  });

  // Submit post
  $('submitPost').addEventListener('click', submitPost);

  // Image upload
  $('postImageInput').addEventListener('change', (e) => {
    handleImageUpload(e.target.files[0]);
  });

  // Remove image
  $('removeImage').addEventListener('click', () => {
    pendingImageDataUrl = null;
    $('imagePreview').src = '';
    $('imagePreviewWrap').classList.add('hidden');
    $('postImageInput').value = '';
    $('submitPost').disabled = $('postContent').value.trim().length === 0;
  });

  renderFeed();
}

document.addEventListener('DOMContentLoaded', init);
