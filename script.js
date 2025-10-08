// --- Perbaikan ringan utk SVG: hapus BOM, pastikan xmlns, tambah xmlns:xlink bila perlu, hilangkan <script>
function ensureSvgBasics(svgText) {
  svgText = String(svgText || '').replace(/^\uFEFF/, ''); // hapus BOM
  if (!/^\s*<svg[\s>]/i.test(svgText)) {
    throw new Error('Konten bukan SVG (tidak diawali <svg>).');
  }
  // Tambah xmlns bila hilang
  svgText = svgText.replace(
    /<svg\b(?![^>]*\bxmlns=)/i,
    '<svg xmlns="http://www.w3.org/2000/svg"'
  );
  // Tambah xmlns:xlink bila ada xlink:href tapi belum ada namespace
  if (/\bxlink:href=/.test(svgText) && !/\bxmlns:xlink=/.test(svgText)) {
    svgText = svgText.replace(
      /<svg\b/i,
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"'
    );
  }
  // Hapus <script> di dalam SVG untuk keamanan & stabilitas render
  svgText = svgText.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  return svgText;
}

// --- Cek parsererror DOMParser
function hasParserError(svgText) {
  try {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    return !!doc.getElementsByTagName('parsererror').length;
  } catch {
    return true;
  }
}

// --- Frontend functionality untuk galeri
class SvgGallery {
  constructor() {
    this.scriptUrl = 'https://script.google.com/macros/s/AKfycbyn8vaUYShpeXlBB4lwnPwU3Bdy8wswkrAKAiXO8tOyFHiP82o1wTpdOrWfiVfQpxePGg/exec';
    this.gallery = document.getElementById('gallery');
    this.loading = document.getElementById('loading');
    this.status = document.getElementById('status');
  }

  async init() {
    try {
      this.showLoading();
      await this.loadGallery();
    } catch (error) {
      this.showError('Gagal memuat galeri: ' + error.message);
    } finally {
      this.hideLoading();
    }
  }

  async loadGallery() {
    const url = `${this.scriptUrl}?action=list`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }

    this.renderGallery(data.files || []);
  }

  renderGallery(files) {
    if (files.length === 0) {
      this.gallery.innerHTML = `
        <div class="col-12">
          <div class="alert alert-warning text-center">
            Tidak ada file SVG ditemukan di folder.
          </div>
        </div>
      `;
      return;
    }

    this.gallery.innerHTML = files.map(file => `
      <div class="col-sm-6 col-md-4 col-lg-3">
        <div class="card h-100">
          <img src="${file.thumb}" 
               class="card-img-top" 
               alt="${file.name}"
               loading="lazy"
               onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4='">
          <div class="card-body">
            <h6 class="card-title">${this.escapeHtml(file.name)}</h6>
            <div class="d-flex justify-content-between align-items-center mb-2">
              <small class="text-muted">${file.id}</small>
              <span class="badge bg-primary badge-downloads">${file.downloads}×</span>
            </div>
            <div class="btn-group-vertical w-100">
              <button class="btn btn-sm btn-outline-primary" onclick="gallery.previewSvg('${file.id}')">
                Preview SVG
              </button>
              <button class="btn btn-sm btn-outline-success" onclick="gallery.downloadSvg('${file.id}')">
                Download
              </button>
              <button class="btn btn-sm btn-outline-info" onclick="gallery.downloadAsPng('${file.id}')">
                Download PNG
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  async previewSvg(fileId) {
    try {
      this.showLoading();
      const url = `${this.scriptUrl}?action=raw&id=${fileId}`;
      const response = await fetch(url);
      
      if (!response.ok) throw new Error('Gagal memuat SVG');
      
      const svgText = await response.text();
      const cleanedSvg = ensureSvgBasics(svgText);
      
      if (hasParserError(cleanedSvg)) {
        throw new Error('SVG mengandung error');
      }
      
      // Tampilkan preview di modal
      this.showModal(cleanedSvg, fileId);
      
      // Hit counter
      await this.incrementCounter(fileId);
      
    } catch (error) {
      this.showError('Gagal memuat preview: ' + error.message);
    } finally {
      this.hideLoading();
    }
  }

  async downloadSvg(fileId) {
    try {
      this.showStatus('Mempersiapkan download...', 'info');
      
      // Increment counter terlebih dahulu
      await this.incrementCounter(fileId);
      
      // Redirect ke endpoint download
      window.location.href = `${this.scriptUrl}?action=dl&id=${fileId}`;
      
    } catch (error) {
      this.showError('Gagal download: ' + error.message);
    }
  }

  async downloadAsPng(fileId) {
    try {
      this.showStatus('Mengkonversi ke PNG...', 'info');
      
      const svgUrl = `${this.scriptUrl}?action=raw&id=${fileId}`;
      const response = await fetch(svgUrl);
      const svgText = await response.text();
      const cleanedSvg = ensureSvgBasics(svgText);
      
      // Konversi SVG ke PNG menggunakan canvas
      await this.svgToPng(cleanedSvg, fileId);
      
      // Increment counter
      await this.incrementCounter(fileId);
      
    } catch (error) {
      this.showError('Gagal konversi PNG: ' + error.message);
    }
  }

  async svgToPng(svgText, fileId) {
    return new Promise((resolve, reject) => {
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob(blob => {
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `image-${fileId}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          URL.revokeObjectURL(url);
          URL.revokeObjectURL(downloadUrl);
          resolve();
        });
      };
      
      img.onerror = () => reject(new Error('Gagal memuat gambar'));
      img.src = url;
    });
  }

  async incrementCounter(fileId) {
    try {
      await fetch(`${this.scriptUrl}?action=hit&id=${fileId}`);
    } catch (error) {
      console.warn('Gagal increment counter:', error);
    }
  }

  showModal(svgContent, fileId) {
    const modalId = 'svgPreviewModal';
    let modal = document.getElementById(modalId);
    
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal fade';
      modal.innerHTML = `
        <div class="modal-dialog modal-xl">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">SVG Preview</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body text-center">
              <div id="svgContainer"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Tutup</button>
              <button type="button" class="btn btn-primary" onclick="gallery.downloadSvg('${fileId}')">Download SVG</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    
    document.getElementById('svgContainer').innerHTML = svgContent;
    
    // Initialize Bootstrap modal jika available
    if (typeof bootstrap !== 'undefined') {
      const bsModal = new bootstrap.Modal(modal);
      bsModal.show();
    } else {
      modal.style.display = 'block';
      modal.style.background = 'rgba(0,0,0,0.5)';
    }
  }

  showLoading() {
    this.loading.classList.remove('d-none');
  }

  hideLoading() {
    this.loading.classList.add('d-none');
  }

  showStatus(message, type = 'info') {
    this.status.textContent = message;
    this.status.className = `alert alert-${type} py-2`;
    this.status.classList.remove('d-none');
    
    // Auto hide setelah 5 detik
    setTimeout(() => {
      this.hideStatus();
    }, 5000);
  }

  hideStatus() {
    this.status.classList.add('d-none');
  }

  showError(message) {
    this.showStatus(message, 'danger');
  }

  escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// Initialize gallery ketika DOM ready
let gallery;
document.addEventListener('DOMContentLoaded', () => {
  gallery = new SvgGallery();
  gallery.init();
  
  // Tahun di footer
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
});