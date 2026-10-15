/** Small DOM/formatting helpers shared by the views and the controller. */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function money(n) {
  return Number.isFinite(n) ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : '—';
}

export function moneyRange([low, high]) {
  return low === high ? money(low) : `${money(low)}–${money(high)}`;
}

/** Reads a form into a nested object; `name="warranty.expires"` → `{ warranty: { expires } }`. */
export function formToObject(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    const value = el.type === 'checkbox' ? el.checked : el.value;
    const path = el.name.split('.');
    let node = out;
    path.slice(0, -1).forEach((k) => { node = node[k] ??= {}; });
    node[path.at(-1)] = value;
  }
  return out;
}

/** Shows validation messages next to the matching fields; clears old ones. */
export function showErrors(form, errors = {}) {
  form.querySelectorAll('.field-error').forEach((el) => el.remove());
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  let first = null;
  for (const [name, message] of Object.entries(errors)) {
    const input = form.querySelector(`[name="${CSS.escape(name)}"]`);
    const msg = document.createElement('p');
    msg.className = 'field-error';
    msg.textContent = message;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      (input.closest('label') ?? input).after(msg);
      first ??= input;
    } else {
      form.prepend(msg);
    }
  }
  first?.focus();
}

export function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downscales an image file to a JPEG data URL so photos fit in browser storage. */
export function compressImage(file, maxSide = 1024, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|gif|heic|heif)$/.test(file.type)) {
      reject(new Error('Choose a photo (JPEG, PNG or WebP).'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This browser could not read that image.'));
    };
    img.src = url;
  });
}
