// ============================================================
// images.js — Image upload + URL handling for Loyalty Portal
// ============================================================

// Reinitializing a rendered section replaces its handlers instead of stacking
// uploads and delayed callbacks against stale item objects.
const LPGImageUploads = (() => {
  const entries = new Map();
  let epoch = 0;
  const context = () => ({ epoch,
    audience: typeof state === 'object' ? state.activeVariant : undefined,
    project: typeof projectEpoch === 'number' ? projectEpoch : undefined });
  function same(captured) {
    const current = context();
    return captured.epoch === current.epoch && captured.audience === current.audience && captured.project === current.project;
  }
  function dispose(entry) {
    entry.active = false; clearTimeout(entry.timer);
    entry.listeners.forEach(([node, event, handler]) => node.removeEventListener(event, handler));
  }
  function cancel(id) {
    const entry = entries.get(id);
    if (entry) { clearTimeout(entry.timer); entry.operation++; }
  }
  function invalidate() {
    epoch++;
    for (const entry of entries.values()) { clearTimeout(entry.timer); entry.operation++; }
  }
  return { entries, context, same, dispose, invalidate, cancel };
})();
if (typeof window !== 'undefined') window.LPGImages = { invalidate: LPGImageUploads.invalidate, captureContext: LPGImageUploads.context, isContextCurrent: LPGImageUploads.same, cancel: LPGImageUploads.cancel };

/** Attach one set of image handlers to a rendered upload widget. */
function initImageUpload(dropZoneId, previewId, urlInputId, onImageSet) {
  for (const [id, old] of LPGImageUploads.entries) {
    if (document.getElementById(id) !== old.node) { LPGImageUploads.dispose(old); LPGImageUploads.entries.delete(id); }
  }
  const previous = LPGImageUploads.entries.get(dropZoneId);
  if (previous) { LPGImageUploads.dispose(previous); LPGImageUploads.entries.delete(dropZoneId); }
  const dropZone = document.getElementById(dropZoneId);
  const preview = document.getElementById(previewId);
  const urlInput = document.getElementById(urlInputId);
  if (!dropZone) return;
  const statusId = dropZoneId.replace(/^drop-/, 'status-');
  if (!document.getElementById(statusId)) {
    const status = document.createElement('p');
    status.id = statusId; status.className = 'text-xs text-gray-500';
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    status.textContent = 'PNG, JPEG or WebP · up to 12 MB. Images are optimized before saving.';
    dropZone.insertAdjacentElement('afterend', status);
  }
  const describedBy = new Set((dropZone.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  describedBy.add(statusId); dropZone.setAttribute('aria-describedby', [...describedBy].join(' '));
  const entry = { node: dropZone, active: true, listeners: [], timer: null, operation: 0 };
  LPGImageUploads.entries.set(dropZoneId, entry);
  function listen(node, event, handler) {
    node.addEventListener(event, handler); entry.listeners.push([node, event, handler]);
  }
  function begin() {
    clearTimeout(entry.timer);
    const captured = LPGImageUploads.context(), operation = ++entry.operation;
    return () => entry.active && operation === entry.operation && LPGImageUploads.same(captured) &&
      document.getElementById(dropZoneId) === dropZone;
  }
  listen(dropZone, 'dragover', event => { event.preventDefault(); dropZone.classList.add('border-blue-400', 'bg-blue-50'); });
  listen(dropZone, 'dragleave', () => { dropZone.classList.remove('border-blue-400', 'bg-blue-50'); });
  listen(dropZone, 'drop', event => {
    event.preventDefault(); dropZone.classList.remove('border-blue-400', 'bg-blue-50');
    const valid = begin(), file = event.dataTransfer.files[0];
    if (file) readFileAsDataURL(file, preview, urlInput, onImageSet, valid, dropZoneId);
  });
  listen(dropZone, 'click', () => {
    // Capture before opening the native picker: returning from an old picker
    // must not attach its selected image to a newly active project or audience.
    const valid = begin(), input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = event => {
      if (!valid()) return;
      const file = event.target.files[0];
      if (file) readFileAsDataURL(file, preview, urlInput, onImageSet, valid, dropZoneId);
    };
    input.click();
  });
  listen(dropZone, 'keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); dropZone.click(); }
  });
  if (urlInput) listen(urlInput, 'input', () => {
    const valid = begin(), url = urlInput.value.trim();
    entry.timer = setTimeout(async () => {
      if (!valid()) return;
      try {
        let image = url;
        if (url.startsWith('data:')) {
          if (!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(url) || url.length > Math.ceil(LPG_UPLOAD_SOURCE_LIMIT * 4 / 3) + 128) throw new Error('Use a PNG, JPEG, or WebP image, or an HTTP(S) image URL.');
          image = await optimizeUploadedImage(url, uploadImagePolicy(dropZoneId));
        } else if (url) {
          const parsed = new URL(url);
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an HTTP(S) image URL.');
        }
        if (!valid()) return;
        validateUploadProjectBudget(image, preview?.getAttribute('src') || '');
        if (preview) { preview.src = image; preview.classList.toggle('hidden', !image); }
        onImageSet(image); uploadImageStatus(dropZoneId, image ? 'Image ready.' : 'Image removed.');
      } catch (error) { if (valid()) uploadImageStatus(dropZoneId, (error.message || 'Use a valid HTTP(S) image URL.') + ' The existing image has been kept.', true); }
    }, 400);
  });
}

// Limits apply to encoded data stored in a project, not just the original file.
const LPG_UPLOAD_SOURCE_LIMIT = 12 * 1024 * 1024;
function uploadImagePolicy(id = '') {
  const compact = /(?:badge|benefit-(?!cover)|card-mark|logo|avatar)/.test(id);
  return { maxEdge: compact ? 512 : 1600, maxLength: (compact ? 120 : 400) * 1024 };
}
function validateUploadProjectBudget(nextImage, previousImage = '') {
  if (typeof state !== 'object' || !state) return;
  const encoder = new TextEncoder();
  const serialized = JSON.stringify(state);
  const prior = previousImage && serialized.includes(JSON.stringify(previousImage)) ? encoder.encode(JSON.stringify(previousImage)).byteLength : 0;
  const added = encoder.encode(JSON.stringify(nextImage)).byteLength;
  const limit = typeof MAX_PROJECT_BYTES === 'number' ? MAX_PROJECT_BYTES : 19 * 1024 * 1024;
  // Reserve room for editor metadata and future small text edits. Only count one
  // existing occurrence as replaced; shared/repeated assets remain in the budget.
  const projected = encoder.encode(serialized).byteLength - prior + added;
  if (projected > limit - 64 * 1024) throw new Error('This project is nearly full. Remove unused images or use a smaller image before adding this one.');
}
function uploadImageStatus(id, message, error = false) {
  const node = document.getElementById(id.replace(/^drop-/, 'status-'));
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('text-red-600', error);
}
// Inspect raster dimensions before asking the browser to allocate a decoded image.
// Only a bounded header prefix is decoded here (JPEG metadata can be sizable).
function uploadedImageDimensions(dataUrl) {
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1, dataUrl.indexOf(',') + 1 + 349524)), c => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const ascii = (start, count) => String.fromCharCode(...bytes.slice(start, start + count));
  if (bytes.length >= 24 && ascii(1, 3) === 'PNG' && view.getUint32(0) === 0x89504e47 && ascii(12, 4) === 'IHDR') return [view.getUint32(16), view.getUint32(20)];
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      const length = view.getUint16(offset);
      if (length < 2) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && offset + 7 <= bytes.length) return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
      offset += length;
    }
  }
  if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    if (ascii(12, 4) === 'VP8X') return [1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)];
    if (ascii(12, 4) === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    if (ascii(12, 4) === 'VP8L' && bytes[20] === 0x2f) return [1 + bytes[21] + ((bytes[22] & 0x3f) << 8), 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10)];
  }
  throw new Error('The file does not have a supported raster image header.');
}
function validateUploadDimensions(width, height) {
  if (!width || !height || width > 16000 || height > 16000 || width * height > 32000000)
    throw new Error('Image dimensions are too large. Use an image under 32 megapixels and 16,000 pixels per side.');
}
async function optimizeUploadedImage(dataUrl, policy) {
  validateUploadDimensions(...uploadedImageDimensions(dataUrl));
  const source = await new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('Image decoding timed out. Try a smaller image.')), 15000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('This file could not be decoded as an image.')); };
    img.src = dataUrl;
  });
  const width = source.naturalWidth, height = source.naturalHeight;
  validateUploadDimensions(width, height);
  if (Math.max(width, height) <= policy.maxEdge && dataUrl.length <= policy.maxLength) return dataUrl;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image optimization is unavailable. Try a smaller image.');
  const scale = Math.min(1, policy.maxEdge / Math.max(width, height));
  try {
    for (const factor of [1, 0.8, 0.6, 0.4, 0.25]) {
      canvas.width = Math.max(1, Math.round(width * scale * factor));
      canvas.height = Math.max(1, Math.round(height * scale * factor));
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      // WebP retains transparency; PNG is the transparent fallback for browsers
      // without a WebP encoder. JPEG input can use JPEG without losing alpha.
      for (const quality of [0.86, 0.72, 0.55]) {
        let encoded = canvas.toDataURL('image/webp', quality);
        if (!/^data:image\/webp;base64,/i.test(encoded)) encoded = canvas.toDataURL(/^data:image\/jpeg;/i.test(dataUrl) ? 'image/jpeg' : 'image/png', quality);
        if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(encoded) && encoded.length <= policy.maxLength) return encoded;
      }
    }
    throw new Error('This image could not fit the upload budget. Try a simpler or smaller image.');
  } finally { canvas.width = 1; canvas.height = 1; }
}
function readFileAsDataURL(file, preview, urlInput, onImageSet, valid, dropZoneId = '') {
  if (!valid) { const captured = LPGImageUploads.context(); valid = () => LPGImageUploads.same(captured); }
  const status = (message, error) => { if (valid()) uploadImageStatus(dropZoneId, message, error); };
  if (!/^image\/(?:png|jpeg|webp)$/i.test(file.type)) { status('Use a PNG, JPEG, or WebP image. SVG and animated formats are not supported for uploads.', true); return; }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > LPG_UPLOAD_SOURCE_LIMIT) { status('Choose an image up to 12 MB. The existing image has been kept.', true); return; }
  status('Checking and optimizing image…');
  const reader = new FileReader();
  reader.onerror = () => status('The file could not be read. The existing image has been kept.', true);
  reader.onload = async event => {
    if (!valid()) return;
    try {
      const original = event.target.result;
      if (typeof original !== 'string' || original.length > Math.ceil(LPG_UPLOAD_SOURCE_LIMIT * 4 / 3) + 128 || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(original)) throw new Error('The file is not a supported image.');
      const dataUrl = await optimizeUploadedImage(original, uploadImagePolicy(dropZoneId));
      if (!valid()) return;
      validateUploadProjectBudget(dataUrl, preview?.getAttribute('src') || '');
      if (preview) { preview.src = dataUrl; preview.classList.remove('hidden'); }
      if (urlInput) urlInput.value = '';
      onImageSet(dataUrl);
      status(dataUrl === original ? 'Image ready.' : 'Image optimized for saving (' + Math.ceil(dataUrl.length / 1024) + ' KB encoded).');
    } catch (error) { status((error.message || 'Image processing failed.') + ' The existing image has been kept.', true); }
  };
  reader.readAsDataURL(file);
}

/**
 * Create the HTML for an image upload drop zone + URL input
 * @param {string} id - Base ID for the elements
 * @param {string} label - Label text
 * @param {string} currentValue - Current image URL/data
 * @returns {string} HTML string
 */
function imageUploadHTML(id, label, currentValue) {
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  currentValue = typeof currentValue === 'string' ? currentValue : '';
  const hasImage = currentValue.length > 0;
  return `
    <div class="space-y-2">
      <label class="block text-xs font-600 text-gray-700">${escape(label)}</label>
      <div id="drop-${escape(id)}" role="button" tabindex="0" aria-label="Upload ${escape(label)}" aria-describedby="status-${escape(id)}" class="relative border-2 border-dashed border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all">
        <img id="preview-${escape(id)}" alt="" src="${hasImage ? escape(currentValue) : ''}" class="${hasImage ? '' : 'hidden'} w-16 h-16 object-cover rounded mx-auto mb-2">
        <p class="text-xs text-gray-500">Drop image or click to upload</p>
      </div>
      <p id="status-${escape(id)}" role="status" aria-live="polite" class="text-xs text-gray-500">PNG, JPEG or WebP · up to 12 MB. Images are optimized before saving.</p>
      <input type="text" id="url-${escape(id)}" aria-label="${escape(label)} URL" value="${currentValue && !currentValue.startsWith('data:') ? escape(currentValue) : ''}" placeholder="Or paste image URL" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 outline-none">
      ${hasImage ? `<button type="button" onclick="clearImage(${escape(JSON.stringify(id))})" class="text-xs text-red-500 hover:text-red-700">✕ Remove image</button>` : ''}
    </div>
  `;
}

function clearImage(id) {
  LPGImageUploads.cancel('drop-' + id);
  uploadImageStatus('drop-' + id, 'Image removed.');
  const preview = document.getElementById('preview-' + id);
  const urlInput = document.getElementById('url-' + id);
  if (preview) { preview.src = ''; preview.classList.add('hidden'); }
  if (urlInput) urlInput.value = '';
  // Trigger state update via custom event
  document.dispatchEvent(new CustomEvent('imageClear', { detail: { id } }));
}

// Debounce helper
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
