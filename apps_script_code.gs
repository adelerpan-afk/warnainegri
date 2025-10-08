/**
 * Google Apps Script Web App untuk Galeri SVG (ketat: hanya image/svg+xml)
 * - List file dalam folder Drive (filter server-side)
 * - Counter unduhan (Spreadsheet)
 * - Endpoint RAW (hanya SVG, CORS)
 * - Endpoint HIT (increment)
 * - Endpoint DL (increment + redirect ke Google Drive)
 *
 * Catatan:
 * - Wajib aktifkan Advanced Drive Service (Services → Drive API).
 * - Query filter hanya mengembalikan file dengan MIME type 'image/svg+xml'.
 */

// ====== KONFIGURASI ======
const FOLDER_ID = '1HJMFQzyD9d9NrKKgKEqcw2dr4Np-Scb6';         // <-- ganti dengan Folder ID Anda
const USE_SHEET = true;                                         // tetap true
const SHEET_ID = '1s75PycSV2r6sYJDx6uX4anhrz9_r70PUlTeGJfw8qtE'; // <-- ganti dengan Sheet ID Anda

// ====== LOGGING ======
function log_(message) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    message: message
  }));
}

// ====== STORAGE (Spreadsheet) ======
function getStore_() {
  if (!USE_SHEET) {
    return {
      get: (_id) => 0,
      inc: (_id) => 1
    };
  }

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName('downloads');
    if (!sheet) sheet = ss.insertSheet('downloads');
    if (sheet.getLastRow() === 0) sheet.appendRow(['fileId', 'count']);

    function findRowIndex_(id) {
      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (values[i][0] === id) return i + 1; // 1-based row
      }
      return -1;
    }

    return {
      get: (id) => {
        const idx = findRowIndex_(id);
        if (idx > 0) return Number(sheet.getRange(idx, 2).getValue() || 0);
        return 0;
      },
      inc: (id) => {
        const idx = findRowIndex_(id);
        if (idx > 0) {
          const count = Number(sheet.getRange(idx, 2).getValue() || 0) + 1;
          sheet.getRange(idx, 2).setValue(count);
          return count;
        } else {
          sheet.appendRow([id, 1]);
          return 1;
        }
      }
    };
  } catch (error) {
    log_('Error accessing spreadsheet: ' + error.toString());
    // Fallback ke memory storage jika spreadsheet error
    const memoryStore = {};
    return {
      get: (id) => memoryStore[id] || 0,
      inc: (id) => {
        memoryStore[id] = (memoryStore[id] || 0) + 1;
        return memoryStore[id];
      }
    };
  }
}

// ====== UTIL CORS ======
function withCors_(out, contentType) {
  if (contentType) out.setHeader('Content-Type', contentType);
  return out
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type')
    .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
}

// ====== ROUTER ======
function doGet(e) {
  const action = (e.parameter.action || 'list').toLowerCase();
  const id = e.parameter.id;

  // Handle preflight OPTIONS request
  if (e.parameter['_headers'] && e.parameter['_headers']['origin']) {
    return withCors_(ContentService.createTextOutput(''), 'text/plain');
  }

  // Validasi ID untuk mencegah injection
  if (id && !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return withCors_(
      ContentService.createTextOutput(JSON.stringify({ error: 'ID tidak valid' })),
      'application/json'
    );
  }

  try {
    log_(`Request: action=${action}, id=${id || 'none'}`);

    if (action === 'list') return handleList_();
    if (action === 'hit' && id) return handleHit_(id);
    if (action === 'dl' && id) return handleDownload_(id);
    if (action === 'raw' && id) return handleRaw_(id);

    return withCors_(
      ContentService.createTextOutput(JSON.stringify({ error: 'Aksi tidak valid' })),
      'application/json'
    );
  } catch (err) {
    log_('Global error: ' + err.toString());
    return withCors_(
      ContentService.createTextOutput(JSON.stringify({ 
        error: 'Terjadi kesalahan server',
        details: String(err)
      })),
      'application/json'
    );
  }
}

// Handle OPTIONS request untuk CORS preflight
function doOptions() {
  return withCors_(ContentService.createTextOutput(''), 'text/plain');
}

/**
 * LIST (ketat): hanya kembalikan SVG berdasarkan MIME 'image/svg+xml'
 * Menggunakan Advanced Drive Service (Drive.Files.list) dengan query q.
 */
function handleList_() {
  try {
    const store = getStore_();
    
    // Validasi folder exists
    try {
      DriveApp.getFolderById(FOLDER_ID);
    } catch (e) {
      throw new Error('Folder tidak ditemukan atau akses ditolak. Periksa FOLDER_ID.');
    }

    const q = [
      `'${FOLDER_ID}' in parents`,
      "mimeType = 'image/svg+xml'",
      'trashed = false'
    ].join(' and ');

    // Panggilan dengan fields untuk konsistensi
    const res = Drive.Files.list({ 
      q: q,
      fields: 'files(id,name,mimeType,thumbnailLink,webContentLink)',
      orderBy: 'name'
    });

    // Gunakan res.files untuk konsistensi (v3 API)
    const list = (res && res.files) || [];
    log_(`Found ${list.length} SVG files`);

    const files = list.map(f => {
      const id = f.id;
      const name = f.name || 'tanpa-nama';
      const mime = (f.mimeType || '').toLowerCase();

      // Validasi MIME type sekali lagi
      if (mime !== 'image/svg+xml') {
        log_(`File ${id} has wrong MIME type: ${mime}`);
        return null;
      }

      // Thumbnail: pakai thumbnailLink jika ada, fallback ke lh3
      const thumb = f.thumbnailLink || `https://lh3.googleusercontent.com/d/${id}=w300-h300-c`;

      return {
        id: id,
        name: name,
        mimeType: mime,
        thumb: thumb,
        previewUrl: `https://drive.google.com/uc?export=view&id=${id}`,
        downloadUrl: ScriptApp.getService().getUrl() + `?action=dl&id=${id}`,
        rawUrl: ScriptApp.getService().getUrl() + `?action=raw&id=${id}`,
        downloads: store.get(id)
      };
    }).filter(f => f !== null); // Hapus null entries

    return withCors_(
      ContentService.createTextOutput(JSON.stringify({ 
        success: true,
        files: files,
        count: files.length
      })),
      'application/json'
    );
    
  } catch (err) {
    log_('Error in handleList_: ' + err.toString());
    return withCors_(
      ContentService.createTextOutput(JSON.stringify({ 
        error: 'Gagal memuat daftar file',
        details: String(err)
      })),
      'application/json'
    );
  }
}

/**
 * HIT: increment counter tanpa redirect
 */
function handleHit_(fileId) {
  try {
    // Validasi file exists
    try {
      DriveApp.getFileById(fileId);
    } catch (e) {
      throw new Error('File tidak ditemukan');
    }

    const store = getStore_();
    const count = store.inc(fileId);
    
    log_(`Counter incremented for ${fileId}: ${count}`);
    
    return withCors_(
      ContentService.createTextOutput(JSON.stringify({ 
        ok: true, 
        count: count,
        fileId: fileId
      })),
      'application/json'
    );
  } catch (err) {
    log_('Error in handleHit_: ' + err.toString());
    return withCors_(
      ContentService.createTextOutput(JSON.stringify({ 
        error: 'Gagal increment counter',
        details: String(err)
      })),
      'application/json'
    );
  }
}

/**
 * DL: increment + redirect ke link download Google Drive
 */
function handleDownload_(fileId) {
  try {
    // Validasi file exists dan MIME type
    let file;
    try {
      file = DriveApp.getFileById(fileId);
    } catch (e) {
      throw new Error('File tidak ditemukan');
    }

    const mime = (file.getMimeType() || '').toLowerCase();
    if (mime !== 'image/svg+xml') {
      throw new Error('File bukan SVG');
    }

    const store = getStore_();
    const count = store.inc(fileId);
    log_(`Download triggered for ${fileId}: ${count}`);

    const driveDl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    const html = HtmlService.createHtmlOutput(
      `<html>
        <head>
          <meta http-equiv="refresh" content="0; url='${driveDl}'">
          <title>Redirecting...</title>
        </head>
        <body>
          <div style="text-align: center; padding: 50px;">
            <h3>Mengarahkan ke Google Drive...</h3>
            <p>Jika tidak redirect otomatis, <a href="${driveDl}">klik di sini</a>.</p>
          </div>
        </body>
      </html>`
    );
    
    return html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    
  } catch (err) {
    log_('Error in handleDownload_: ' + err.toString());
    const errorHtml = HtmlService.createHtmlOutput(
      `<html>
        <body>
          <div style="text-align: center; padding: 50px; color: red;">
            <h3>Error</h3>
            <p>${err.message}</p>
            <a href="javascript:history.back()">Kembali</a>
          </div>
        </body>
      </html>`
    );
    return errorHtml;
  }
}

/**
 * RAW (ketat): hanya layani file dengan MIME image/svg+xml
 * Mengembalikan isi SVG sebagai 'image/svg+xml; charset=utf-8'
 */
function handleRaw_(fileId) {
  try {
    // Validasi fileId
    if (!fileId || typeof fileId !== 'string') {
      throw new Error('File ID tidak valid');
    }
    
    let file;
    try {
      file = DriveApp.getFileById(fileId);
    } catch (e) {
      throw new Error('File tidak ditemukan');
    }
    
    const blob = file.getBlob();
    const mime = (blob.getContentType() || '').toLowerCase();

    // Validasi MIME type ketat
    if (mime !== 'image/svg+xml') {
      log_(`RAW endpoint rejected non-SVG file: ${fileId} (${mime})`);
      return withCors_(
        ContentService.createTextOutput('File bukan SVG'),
        'text/plain'
      ).setMimeType(ContentService.MimeType.TEXT);
    }

    const text = blob.getDataAsString('UTF-8');
    
    // Validasi konten SVG dasar
    if (!text || !text.includes('<svg')) {
      throw new Error('Konten file tidak valid (bukan SVG)');
    }

    log_(`RAW content served for: ${fileId} (${text.length} chars)`);
    
    const out = ContentService.createTextOutput(text);
    return withCors_(out, 'image/svg+xml; charset=utf-8');
    
  } catch (err) {
    log_('Error in handleRaw_: ' + err.toString());
    return withCors_(
      ContentService.createTextOutput(`Error: ${err.message}`),
      'text/plain'
    ).setMimeType(ContentService.MimeType.TEXT);
  }
}

/**
 * Utility function untuk testing
 */
function test_() {
  log_('Testing started');
  
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    log_(`Folder: ${folder.getName()}`);
    
    const files = folder.getFilesByType(MimeType.SVG);
    let count = 0;
    while (files.hasNext()) {
      const file = files.next();
      log_(`File: ${file.getName()} (${file.getId()})`);
      count++;
    }
    log_(`Total SVG files: ${count}`);
    
  } catch (e) {
    log_('Test error: ' + e.toString());
  }
}