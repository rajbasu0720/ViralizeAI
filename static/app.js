/* ============================================================
   ViralizeAI — App Logic (app.js)
   ============================================================ */

// ── State ──────────────────────────────────────────────────────
const state = {
  selectedFormat: null,   // 'twitter' | 'linkedin' | 'reel'
  cards: [],              // [{ format, label, icon, content }]
  currentIndex: 0,
  isLoading: false,
};

const FORMAT_CONFIG = {
  twitter:  { label: 'Twitter / X Thread',      icon: '𝕏' },
  linkedin: { label: 'LinkedIn Post',            icon: '💼' },
  reel:     { label: 'Reel / Shorts Script',     icon: '🎬' },
};

// ── DOM refs ───────────────────────────────────────────────────
const contentInput   = document.getElementById('content-input');
const charCount      = document.getElementById('char-count');
const formatBtns     = document.querySelectorAll('.format-btn');
const generateBtn    = document.getElementById('generate-btn');
const generateHint   = document.getElementById('generate-hint');
const errorToast     = document.getElementById('error-toast');
const errorMessage   = document.getElementById('error-message');
const outputSection  = document.getElementById('output-section');
const loadingCard    = document.getElementById('loading-card');
const loadingLabel   = document.getElementById('loading-label');
const carouselWrap   = document.getElementById('carousel-wrap');
const carouselTrack  = document.getElementById('carousel-track');
const dotsContainer  = document.getElementById('dots-container');
const outputCount    = document.getElementById('output-count');
const prevBtn        = document.getElementById('prev-btn');
const nextBtn        = document.getElementById('next-btn');

// ── Character count ────────────────────────────────────────────
contentInput.addEventListener('input', () => {
  const len = contentInput.value.length;
  charCount.textContent = `${len.toLocaleString()} character${len !== 1 ? 's' : ''}`;
  charCount.classList.toggle('warning', len > 8000);
  updateGenerateBtn();
});

// ── Format selection ───────────────────────────────────────────
formatBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const fmt = btn.dataset.format;
    if (state.isLoading) return;

    // Deselect all, select clicked
    formatBtns.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
    state.selectedFormat = fmt;
    updateGenerateBtn();
  });
});

function updateGenerateBtn() {
  const hasContent = contentInput.value.trim().length >= 50;
  const hasFormat  = state.selectedFormat !== null;
  generateBtn.disabled = !hasContent || !hasFormat || state.isLoading;

  if (!hasContent && !hasFormat) {
    generateHint.textContent = 'Paste your content and select a format above';
  } else if (!hasContent) {
    generateHint.textContent = 'Add more content (at least 50 characters)';
  } else if (!hasFormat) {
    generateHint.textContent = 'Select a format above to get started';
  } else {
    const existing = state.cards.find(c => c.format === state.selectedFormat);
    generateHint.textContent = existing
      ? `Click to regenerate a new ${FORMAT_CONFIG[state.selectedFormat].label}`
      : `Ready to generate your ${FORMAT_CONFIG[state.selectedFormat].label}`;
  }
}

// ── Generate ───────────────────────────────────────────────────
generateBtn.addEventListener('click', async () => {
  const content = contentInput.value.trim();
  const format  = state.selectedFormat;
  if (!content || !format || state.isLoading) return;

  await generate(content, format);
});

async function generate(content, format) {
  state.isLoading = true;
  generateBtn.disabled = true;
  generateBtn.innerHTML = '<div class="spinner"></div> Generating…';

  hideError();
  showLoading(format);

  try {
    const resp = await fetch('/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, format }),
    });

    const data = await resp.json();

    if (resp.status === 429) {
      // Parse retry seconds from message e.g. "Please wait 41 seconds"
      const match = (data.detail || '').match(/(\d+) second/);
      const err = new Error(data.detail || 'Rate limited — please wait and try again.');
      err.isRateLimit = true;
      err.retryAfter = match ? parseInt(match[1]) : 60;
      throw err;
    }

    if (!resp.ok) {
      throw new Error(data.detail || 'Something went wrong. Please try again.');
    }

    addOrReplaceCard({
      format: data.format,
      label:  data.label,
      icon:   FORMAT_CONFIG[format].icon,
      content: data.output,
    });

    // Mark the format button as done
    const btn = document.getElementById(`fmt-${format}`);
    if (btn) btn.classList.add('done');

  } catch (err) {
    if (err.isRateLimit) {
      showRateLimitError(err.message, err.retryAfter);
    } else {
      showError(err.message);
    }
  } finally {
    state.isLoading = false;
    generateBtn.innerHTML = 'Generate';
    updateGenerateBtn();
    hideLoading();
  }
}

// ── Card management ────────────────────────────────────────────
function addOrReplaceCard({ format, label, icon, content }) {
  const existingIdx = state.cards.findIndex(c => c.format === format);

  if (existingIdx !== -1) {
    // Replace existing card
    state.cards[existingIdx] = { format, label, icon, content };
    renderCarousel();
    navigateTo(existingIdx);
  } else {
    // Add new card
    state.cards.push({ format, label, icon, content });
    renderCarousel();
    navigateTo(state.cards.length - 1);
  }

  showOutputSection();
}

function renderCarousel() {
  // Build track
  carouselTrack.innerHTML = '';
  state.cards.forEach((card, idx) => {
    const el = createCardElement(card, idx);
    carouselTrack.appendChild(el);
  });

  // Build dots
  dotsContainer.innerHTML = '';
  state.cards.forEach((_, idx) => {
    const dot = document.createElement('button');
    dot.className = 'dot' + (idx === state.currentIndex ? ' active' : '');
    dot.setAttribute('aria-label', `Go to card ${idx + 1}`);
    dot.addEventListener('click', () => navigateTo(idx));
    dotsContainer.appendChild(dot);
  });

  updateCarouselNav();
  outputCount.textContent = `${state.cards.length} of 3 generated`;
}

function createCardElement(card, idx) {
  const cardEl = document.createElement('div');
  cardEl.className = 'output-card';
  cardEl.setAttribute('aria-label', `${card.label} output`);
  cardEl.id = `card-${card.format}`;

  cardEl.innerHTML = `
    <div class="output-card-header">
      <div class="output-card-label">
        <div class="output-card-icon">${card.icon}</div>
        <span class="output-card-name">${card.label}</span>
      </div>
      <button class="copy-btn" id="copy-${card.format}" aria-label="Copy ${card.label}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
        </svg>
        Copy
      </button>
    </div>
    <div class="output-content" id="content-${card.format}">${escapeHtml(card.content)}</div>
  `;

  // Wire copy button
  cardEl.querySelector(`#copy-${card.format}`).addEventListener('click', () => {
    copyToClipboard(card.content, card.format);
  });

  return cardEl;
}

function navigateTo(index) {
  state.currentIndex = Math.max(0, Math.min(index, state.cards.length - 1));
  carouselTrack.style.transform = `translateX(-${state.currentIndex * 100}%)`;
  updateCarouselNav();

  // Update dots
  document.querySelectorAll('.dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === state.currentIndex);
  });
}

function updateCarouselNav() {
  const total = state.cards.length;
  prevBtn.disabled = state.currentIndex === 0;
  nextBtn.disabled = state.currentIndex === total - 1;

  // Hide arrows if only one card
  prevBtn.style.visibility = total > 1 ? 'visible' : 'hidden';
  nextBtn.style.visibility = total > 1 ? 'visible' : 'hidden';
  dotsContainer.style.visibility = total > 1 ? 'visible' : 'hidden';
}

prevBtn.addEventListener('click', () => navigateTo(state.currentIndex - 1));
nextBtn.addEventListener('click', () => navigateTo(state.currentIndex + 1));

// Touch / swipe support
let touchStartX = 0;
let touchEndX   = 0;

document.querySelector('.carousel-viewport')?.addEventListener('touchstart', e => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.querySelector('.carousel-viewport')?.addEventListener('touchend', e => {
  touchEndX = e.changedTouches[0].screenX;
  const diff = touchStartX - touchEndX;
  if (Math.abs(diff) > 40) {
    if (diff > 0) navigateTo(state.currentIndex + 1); // swipe left
    else          navigateTo(state.currentIndex - 1); // swipe right
  }
}, { passive: true });

// ── Copy to clipboard ──────────────────────────────────────────
async function copyToClipboard(text, format) {
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById(`copy-${format}`);
    if (!btn) return;
    btn.classList.add('copied');
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Copied!
    `;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
        </svg>
        Copy
      `;
    }, 2200);
  } catch {
    showError('Could not copy to clipboard. Please copy the text manually.');
  }
}

// ── Loading / error helpers ────────────────────────────────────
function showLoading(format) {
  loadingLabel.textContent = `Generating your ${FORMAT_CONFIG[format].label}…`;
  loadingCard.style.display = 'block';
  carouselWrap.style.display = 'none';
  showOutputSection();
}

function hideLoading() {
  loadingCard.style.display = 'none';
  if (state.cards.length > 0) {
    carouselWrap.style.display = 'block';
  }
}

function showOutputSection() {
  outputSection.classList.add('visible');
  setTimeout(() => {
    outputSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorToast.style.display = 'flex';
  setTimeout(() => hideError(), 6000);
}

let countdownInterval = null;

function showRateLimitError(msg, seconds) {
  // Clear any existing countdown
  if (countdownInterval) clearInterval(countdownInterval);

  let remaining = seconds;
  const update = () => {
    errorMessage.innerHTML = `⏱ Rate limited — retrying in <strong>${remaining}s</strong>. ${msg}`;
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      errorMessage.textContent = 'Ready to retry. Click Generate again.';
      generateBtn.disabled = false;
    }
    remaining--;
  };

  errorToast.style.display = 'flex';
  generateBtn.disabled = true;
  update();
  countdownInterval = setInterval(update, 1000);
}

function hideError() {
  errorToast.style.display = 'none';
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

// ── Utilities ──────────────────────────────────────────────────
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Init ───────────────────────────────────────────────────────
updateGenerateBtn();
