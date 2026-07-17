// ============================================================
// images.js — Image upload + URL handling for Loyalty Portal
// ============================================================

/**
 * Initialize a drop zone for image upload
 * @param {string} dropZoneId - ID of the drop zone element
 * @param {string} previewId - ID of the preview img element
 * @param {string} urlInputId - ID of the URL text input
 * @param {Function} onImageSet - callback(dataOrUrl) when image is set
 */
function initImageUpload(dropZoneId, previewId, urlInputId, onImageSet) {
  const dropZone = document.getElementById(dropZoneId);
  const preview = document.getElementById(previewId);
  const urlInput = document.getElementById(urlInputId);
  if (!dropZone) return;

  // Drag & drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-blue-400', 'bg-blue-50');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-blue-400', 'bg-blue-50');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-blue-400', 'bg-blue-50');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      readFileAsDataURL(file, preview, urlInput, onImageSet);
    }
  });

  // Click to upload
  dropZone.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) readFileAsDataURL(file, preview, urlInput, onImageSet);
    };
    input.click();
  });

  // URL input change
  if (urlInput) {
    urlInput.addEventListener('input', debounce(() => {
      const url = urlInput.value.trim();
      if (url) {
        if (preview) {
          preview.src = url;
          preview.classList.remove('hidden');
        }
        onImageSet(url);
      } else {
        if (preview) { preview.src = ''; preview.classList.add('hidden'); }
        onImageSet('');
      }
    }, 400));
  }
}

function readFileAsDataURL(file, preview, urlInput, onImageSet) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    if (preview) {
      preview.src = dataUrl;
      preview.classList.remove('hidden');
    }
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
  const hasImage = currentValue && currentValue.length > 0;
  return `
    <div class="space-y-2">
      <label class="block text-xs font-600 text-gray-700">${label}</label>
      <div id="drop-${id}" class="relative border-2 border-dashed border-gray-300 rounded-lg p-3 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all">
        <img id="preview-${id}" src="${hasImage ? currentValue : ''}" class="${hasImage ? '' : 'hidden'} w-16 h-16 object-cover rounded mx-auto mb-2">
        <p class="text-xs text-gray-500">Drop image or click to upload</p>
      </div>
      <input type="text" id="url-${id}" value="${currentValue && !currentValue.startsWith('data:') ? currentValue : ''}" placeholder="Or paste image URL" class="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400 outline-none">
      ${hasImage ? `<button type="button" onclick="clearImage('${id}')" class="text-xs text-red-500 hover:text-red-700">✕ Remove image</button>` : ''}
    </div>
  `;
}

function clearImage(id) {
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
