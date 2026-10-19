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
    if (file && file.type.startsWith('image/')) readFileAsDataURL(file, preview, urlInput, onImageSet, valid);
  });
  listen(dropZone, 'click', () => {
    // Capture before opening the native picker: returning from an old picker
    // must not attach its selected image to a newly active project or audience.
    const valid = begin(), input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = event => {
      if (!valid()) return;
      const file = event.target.files[0];
      if (file && file.type.startsWith('image/')) readFileAsDataURL(file, preview, urlInput, onImageSet, valid);
    };
    input.click();
  });
  listen(dropZone, 'keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); dropZone.click(); }
  });
  if (urlInput) listen(urlInput, 'input', () => {
    const valid = begin(), url = urlInput.value.trim();
    entry.timer = setTimeout(() => {
      if (!valid()) return;
      if (preview) { preview.src = url; preview.classList.toggle('hidden', !url); }
      onImageSet(url);
    }, 400);
  });
}

function readFileAsDataURL(file, preview, urlInput, onImageSet, valid) {
  if (!valid) { const captured = LPGImageUploads.context(); valid = () => LPGImageUploads.same(captured); }
  const reader = new FileReader();
  reader.onload = event => {
    if (!valid()) return;
    const dataUrl = event.target.result;
    if (preview) { preview.src = dataUrl; preview.classList.remove('hidden'); }
    if (urlInput) urlInput.value = '';
    onImageSet(dataUrl);
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
      <div id="drop-${escape(id)}" role="button" tabindex="0" aria-label="Upload ${escape(label)}" class="relative border-2 border-dashed border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all">
        <img id="preview-${escape(id)}" alt="" src="${hasImage ? escape(currentValue) : ''}" class="${hasImage ? '' : 'hidden'} w-16 h-16 object-cover rounded mx-auto mb-2">
        <p class="text-xs text-gray-500">Drop image or click to upload</p>
      </div>
      <input type="text" id="url-${escape(id)}" aria-label="${escape(label)} URL" value="${currentValue && !currentValue.startsWith('data:') ? escape(currentValue) : ''}" placeholder="Or paste image URL" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 outline-none">
      ${hasImage ? `<button type="button" onclick="clearImage(${escape(JSON.stringify(id))})" class="text-xs text-red-500 hover:text-red-700">✕ Remove image</button>` : ''}
    </div>
  `;
}

function clearImage(id) {
  LPGImageUploads.cancel('drop-' + id);
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
