/* jshint esversion: 11 */

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const WEBHOOK_URL = 'https://dd54-95-56-11-27.ngrok-free.app/webhook-test/d0740166-ee1e-45e2-89d3-f242393f3916';

// ─────────────────────────────────────────────
//  TELEGRAM SDK INIT
// ─────────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
}

// ─────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────
const userAvatarEl    = document.getElementById('user-avatar');
const userNameEl      = document.getElementById('user-name');
const botNameEl       = document.getElementById('bot-name');
const messagesList    = document.getElementById('messages-list');
const emptyState      = document.getElementById('empty-state');
const appMain         = document.getElementById('app-main');
const appFooter       = document.getElementById('app-footer');

// Input bar
const webhookInput    = document.getElementById('webhook-input');
const sendBtn         = document.getElementById('send-btn');
const attachBtn       = document.getElementById('attach-btn');
const fileInput       = document.getElementById('file-input');

// Audio
const recordBtn       = document.getElementById('record-btn');
const micIcon         = document.getElementById('mic-icon');
const stopIcon        = document.getElementById('stop-icon');
const recordingBar    = document.getElementById('recording-bar');
const recTimer        = document.getElementById('rec-timer');
const recCancel       = document.getElementById('rec-cancel');

// Attachments
const attachmentPreview = document.getElementById('attachment-preview');
const attachmentItems   = document.getElementById('attachment-items');

// Commands menu
const cmdMenuBtn    = document.getElementById('cmd-menu-btn');
const cmdDropdown   = document.getElementById('cmd-dropdown');
const cmdOverlay    = document.getElementById('cmd-overlay');
const cmdItems      = document.querySelectorAll('.cmd-item');

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let pendingFiles    = []; // Array<File>
let pendingAudio    = null; // Blob | null
let mediaRecorder   = null;
let audioChunks     = [];
let recordTimerInt  = null;
let recordSeconds   = 0;
let isRecording     = false;

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
function initApp() {
    const user = tg?.initDataUnsafe?.user;

    if (user) {
        if (user.photo_url) {
            userAvatarEl.src = user.photo_url;
        } else {
            userAvatarEl.src = generateAvatar(user.first_name);
        }
        userNameEl.textContent = user.username ? `@${user.username}` : user.first_name;
    } else {
        // Outside Telegram (dev mode)
        userAvatarEl.src = generateAvatar('Dev');
        userNameEl.textContent = 'Разработчик';
    }

    botNameEl.textContent = 'AI Assistant';
    adjustLayout();
}

function generateAvatar(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=4ade80&color=0a0f1a&size=96`;
}

// Keep main area from being covered by a dynamic footer
function adjustLayout() {
    const footerH = appFooter.offsetHeight;
    appMain.style.bottom = footerH + 'px';
}

// Auto-resize textarea
webhookInput.addEventListener('input', () => {
    webhookInput.style.height = 'auto';
    webhookInput.style.height = Math.min(webhookInput.scrollHeight, 120) + 'px';
    adjustLayout();
});

// ─────────────────────────────────────────────
//  COMMANDS MENU
// ─────────────────────────────────────────────
function toggleCmdMenu(open) {
    const isOpen = cmdDropdown.classList.contains('open');
    const target = open !== undefined ? open : !isOpen;
    cmdDropdown.classList.toggle('open', target);
    cmdOverlay.classList.toggle('open', target);
}

cmdMenuBtn.addEventListener('click', () => toggleCmdMenu());
cmdOverlay.addEventListener('click', () => toggleCmdMenu(false));

cmdItems.forEach(item => {
    item.addEventListener('click', () => {
        const cmd = item.getAttribute('data-cmd');
        toggleCmdMenu(false);
        sendCommand(cmd);
    });
});

async function sendCommand(cmd) {
    addMessage('outgoing', 'text', { text: cmd });
    hideEmptyState();
    scrollToBottom();

    const typingId = addMessage('incoming', 'typing', {});

    try {
        const formData = new FormData();
        formData.append('query', cmd);
        if (tg?.initData) formData.append('initData', tg.initData);
        if (tg?.initDataUnsafe?.user) {
            formData.append('user', JSON.stringify(tg.initDataUnsafe.user));
        }

        const response = await fetch(WEBHOOK_URL, { method: 'POST', body: formData });
        removeMessage(typingId);

        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status} ${response.statusText}`);
        }

        await handleServerResponse(response);

    } catch (err) {
        removeMessage(typingId);
        addMessage('incoming', 'text', { text: '⚠️ ' + err.message, isError: true });
    }

    scrollToBottom();
}

// ─────────────────────────────────────────────
//  SEND MESSAGE
// ─────────────────────────────────────────────
async function handleSend() {
    const text = webhookInput.value.trim();
    const hasFiles = pendingFiles.length > 0;
    const hasAudio = !!pendingAudio;

    if (!text && !hasFiles && !hasAudio) return;

    // Show outgoing message
    if (text) addMessage('outgoing', 'text', { text });
    if (hasAudio) addMessage('outgoing', 'audio', { blob: pendingAudio, duration: recordSeconds });
    if (hasFiles) pendingFiles.forEach(f => addMessage('outgoing', 'file', { file: f }));

    // Clear state
    webhookInput.value = '';
    webhookInput.style.height = 'auto';
    const filesToSend  = [...pendingFiles];
    const audioToSend  = pendingAudio;
    pendingFiles  = [];
    pendingAudio  = null;
    clearAttachmentPreview();
    adjustLayout();
    hideEmptyState();
    scrollToBottom();

    // Show typing indicator
    const typingId = addMessage('incoming', 'typing', {});

    try {
        const formData = new FormData();

        if (text)       formData.append('query', text);
        if (tg?.initData) formData.append('initData', tg.initData);
        if (tg?.initDataUnsafe?.user) {
            formData.append('user', JSON.stringify(tg.initDataUnsafe.user));
        }
        if (audioToSend) {
            formData.append('audio', audioToSend, 'voice.webm');
        }
        filesToSend.forEach((f, i) => formData.append(`file_${i}`, f, f.name));

        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            body: formData,
        });

        removeMessage(typingId);

        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status} ${response.statusText}`);
        }

        await handleServerResponse(response);

    } catch (err) {
        removeMessage(typingId);
        addMessage('incoming', 'text', { text: '⚠️ ' + err.message, isError: true });
    }

    scrollToBottom();
}

// ─────────────────────────────────────────────
//  HANDLE SERVER RESPONSE (text, json, file)
// ─────────────────────────────────────────────
async function handleServerResponse(response) {
    const contentType = response.headers.get('content-type') || '';

    // Binary file response (PDF, zip, image, etc.)
    if (
        contentType.includes('application/octet-stream') ||
        contentType.includes('application/pdf') ||
        contentType.includes('application/zip') ||
        contentType.includes('image/') ||
        contentType.includes('audio/') ||
        contentType.includes('video/')
    ) {
        const disposition = response.headers.get('content-disposition') || '';
        let filename = 'file';
        const match = disposition.match(/filename[*]?=["']?(?:UTF-8'')?([^"';\n]+)/i);
        if (match) {
            filename = decodeURIComponent(match[1]);
        } else {
            // Guess extension from content type
            const extMap = {
                'application/pdf': 'document.pdf',
                'application/zip': 'archive.zip',
                'image/png': 'image.png',
                'image/jpeg': 'image.jpg',
            };
            filename = extMap[contentType.split(';')[0]] || 'file';
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        addMessage('incoming', 'download', { url, filename, size: blob.size });
        return;
    }

    // JSON response
    if (contentType.includes('application/json')) {
        const data = await response.json();

        // Server may return files array + text
        if (data.files && Array.isArray(data.files)) {
            data.files.forEach(f => {
                addMessage('incoming', 'download', {
                    url: f.url,
                    filename: f.name || f.filename || 'file',
                    size: f.size || 0
                });
            });
        }

        const reply = typeof data === 'string'
            ? data
            : (data.reply || data.message || data.text || (data.files ? null : JSON.stringify(data, null, 2)));

        if (reply) {
            addMessage('incoming', 'text', { text: reply });
        }
        return;
    }

    // Plain text
    const text = (await response.text()).trim() || 'Получен пустой ответ';
    addMessage('incoming', 'text', { text });
}

// ─────────────────────────────────────────────
//  MESSAGE RENDERING
// ─────────────────────────────────────────────
let msgIdCounter = 0;

function addMessage(direction, type, payload) {
    const id = 'msg-' + (++msgIdCounter);
    const row = document.createElement('div');
    row.className = `msg-row ${direction}`;
    row.id = id;

    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    let inner = '';

    if (type === 'typing') {
        inner = `
          <div class="msg-bubble incoming">
            <div class="typing-bubble">
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
              <span class="typing-dot"></span>
            </div>
          </div>`;
    }

    else if (type === 'text') {
        const extraStyle = payload.isError ? 'border-color:rgba(239,68,68,0.3);' : '';
        inner = `
          <div class="msg-bubble" style="${extraStyle}">${escapeHtml(payload.text)}</div>
          <span class="msg-time">${time}</span>`;
    }

    else if (type === 'audio') {
        const bars = Array.from({ length: 20 }, (_, i) => {
            const h = 10 + Math.random() * 18;
            return `<div class="waveform-bar" style="height:${h}px; animation-delay:${(i * 0.06).toFixed(2)}s;"></div>`;
        }).join('');
        const dur = formatDuration(payload.duration || 0);
        const url = URL.createObjectURL(payload.blob);

        inner = `
          <div class="msg-bubble audio-bubble" data-audio-url="${url}">
            <button class="audio-play-btn" onclick="toggleAudio(this, '${url}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 3l14 9-14 9V3z"/>
              </svg>
            </button>
            <div class="audio-waveform">${bars}</div>
            <span class="audio-duration">${dur}</span>
          </div>
          <span class="msg-time">${time}</span>`;
    }

    else if (type === 'file') {
        const f = payload.file;
        const fileUrl = URL.createObjectURL(f);
        inner = `
          <div class="msg-bubble file-bubble">
            <div class="file-icon">${fileTypeIcon(f.name)}</div>
            <div class="file-info">
              <div class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
              <div class="file-size">${formatBytes(f.size)}</div>
            </div>
            <button class="file-download-btn" onclick="downloadFile('${fileUrl}', '${escapeHtml(f.name)}')" title="Скачать">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <span class="msg-time">${time}</span>`;
    }

    else if (type === 'download') {
        // Incoming file from server
        const name = payload.filename || 'file';
        const size = payload.size || 0;
        const url  = payload.url;
        inner = `
          <div class="msg-bubble file-bubble">
            <div class="file-icon">${fileTypeIcon(name)}</div>
            <div class="file-info">
              <div class="file-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
              ${size ? `<div class="file-size">${formatBytes(size)}</div>` : ''}
            </div>
            <button class="file-download-btn" onclick="downloadFile('${url}', '${escapeHtml(name)}')" title="Скачать">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
          <span class="msg-time">${time}</span>`;
    }

    row.innerHTML = inner;
    messagesList.appendChild(row);
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

// ─────────────────────────────────────────────
//  AUDIO PLAYBACK
// ─────────────────────────────────────────────
let currentAudio = null;

function toggleAudio(btn, url) {
    if (currentAudio && !currentAudio.paused) {
        currentAudio.pause();
        resetPlayBtn(btn);
        return;
    }
    if (currentAudio) { currentAudio.pause(); }
    currentAudio = new Audio(url);
    currentAudio.play();
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
    </svg>`;
    currentAudio.onended = () => resetPlayBtn(btn);
}

function resetPlayBtn(btn) {
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5 3l14 9-14 9V3z"/>
    </svg>`;
}

// ─────────────────────────────────────────────
//  AUDIO RECORDING
// ─────────────────────────────────────────────
recordBtn.addEventListener('click', async () => {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
});

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks   = [];
        recordSeconds = 0;
        isRecording   = true;

        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            pendingAudio = new Blob(audioChunks, { type: 'audio/webm' });
            stream.getTracks().forEach(t => t.stop());
            addAudioAttachmentChip();
        };

        mediaRecorder.start();

        // UI
        micIcon.style.display  = 'none';
        stopIcon.style.display = 'block';
        recordBtn.classList.add('recording');
        recordingBar.style.display = 'flex';
        recTimer.textContent = '0:00';

        recordTimerInt = setInterval(() => {
            recordSeconds++;
            recTimer.textContent = formatDuration(recordSeconds);
        }, 1000);

        adjustLayout();
    } catch (e) {
        addMessage('incoming', 'text', { text: '⚠️ Нет доступа к микрофону: ' + e.message, isError: true });
    }
}

function stopRecording(cancel = false) {
    if (!mediaRecorder) return;
    clearInterval(recordTimerInt);
    isRecording = false;

    if (cancel) {
        mediaRecorder.onstop = () => {
            mediaRecorder.stream?.getTracks().forEach(t => t.stop());
        };
    }
    mediaRecorder.stop();

    // UI
    micIcon.style.display  = 'block';
    stopIcon.style.display = 'none';
    recordBtn.classList.remove('recording');
    recordingBar.style.display = 'none';

    if (cancel) { pendingAudio = null; }
    adjustLayout();
}

recCancel.addEventListener('click', () => stopRecording(true));

function addAudioAttachmentChip() {
    const dur = formatDuration(recordSeconds);
    addChip('🎙️ Аудио ' + dur, () => { pendingAudio = null; adjustLayout(); });
    adjustLayout();
}

// ─────────────────────────────────────────────
//  FILE ATTACHMENT
// ─────────────────────────────────────────────
attachBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files);
    files.forEach(f => {
        pendingFiles.push(f);
        addChip(f.name, () => {
            pendingFiles = pendingFiles.filter(x => x !== f);
            if (pendingFiles.length === 0 && !pendingAudio) clearAttachmentPreview();
        });
    });
    fileInput.value = '';
    adjustLayout();
});

function addChip(label, onRemove) {
    attachmentPreview.style.display = 'block';
    const chip = document.createElement('div');
    chip.className = 'att-chip';
    chip.innerHTML = `
        <span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(label)}</span>
        <button class="att-chip-remove" title="Удалить">×</button>
    `;
    chip.querySelector('.att-chip-remove').addEventListener('click', () => {
        chip.remove();
        onRemove();
        if (attachmentItems.children.length === 0) {
            attachmentPreview.style.display = 'none';
        }
        adjustLayout();
    });
    attachmentItems.appendChild(chip);
}

function clearAttachmentPreview() {
    attachmentItems.innerHTML = '';
    attachmentPreview.style.display = 'none';
}

// ─────────────────────────────────────────────
//  EVENT LISTENERS
// ─────────────────────────────────────────────
sendBtn.addEventListener('click', handleSend);

webhookInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function hideEmptyState() {
    if (emptyState) emptyState.style.display = 'none';
}

function downloadFile(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'file';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function scrollToBottom() {
    setTimeout(() => { appMain.scrollTop = appMain.scrollHeight; }, 50);
}

function formatDuration(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fileTypeIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const svgPath = (() => {
        if (['jpg','jpeg','png','gif','webp','svg'].includes(ext))
            return 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z';
        if (['mp4','mov','avi','mkv'].includes(ext))
            return 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z';
        if (['mp3','ogg','wav','flac'].includes(ext))
            return 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z';
        if (['pdf'].includes(ext))
            return 'M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5z';
        return 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z';
    })();

    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="${svgPath}"/>
    </svg>`;
}

// ─────────────────────────────────────────────
//  RESIZE OBSERVER (keeps layout tight on keyboard)
// ─────────────────────────────────────────────
const resObs = new ResizeObserver(() => adjustLayout());
resObs.observe(appFooter);
window.addEventListener('resize', adjustLayout);

// ─────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initApp);
