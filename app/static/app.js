// Elementos da DOM
const configCard = document.getElementById('config-card');
const mainCard = document.getElementById('main-card');
const sendCard = document.getElementById('send-card');
const historySection = document.getElementById('history-section');
const historyList = document.getElementById('history-list');
const btnClearHistory = document.getElementById('btn-clear-history');

const inputUserId = document.getElementById('input-user-id');
const inputDeviceId = document.getElementById('input-device-id');
const btnSaveConfig = document.getElementById('btn-save-config');
const statusBadge = document.getElementById('status-badge');
const clipboardDisplay = document.getElementById('clipboard-display');
const senderInfo = document.getElementById('sender-info');
const btnCopy = document.getElementById('btn-copy');
const sendInput = document.getElementById('send-input');
const btnSend = document.getElementById('btn-send');

let socket = null;
let userId = localStorage.getItem('clipsync_user_id') || '';
let deviceId = localStorage.getItem('clipsync_device_id') || '';

// Inicialização
function init() {
    if (userId && deviceId) {
        configCard.classList.add('hidden');
        mainCard.classList.remove('hidden');
        sendCard.classList.remove('hidden');
        historySection.classList.remove('hidden');
        renderHistory();
        connectWebSocket();
    } else {
        configCard.classList.remove('hidden');
    }
}

// --- GERENCIAMENTO DE HISTÓRICO LOCAL ---
function getLocalHistory() {
    try {
        return JSON.parse(localStorage.getItem('clipsync_history')) || [];
    } catch {
        return [];
    }
}

function addToHistory(content, senderName = 'Desconhecido') {
    if (!content || !content.trim()) return;

    let history = getLocalHistory();
    
    // Remove se já existir para evitar duplicatas, adicionando o mais recente no topo
    history = history.filter(item => item.content !== content);

    const newItem = {
        id: Date.now(),
        content: content,
        sender: senderName,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    history.unshift(newItem); // Adiciona no início do array

    // Mantém no máximo 20 itens no histórico do celular
    if (history.length > 20) history.pop();

    localStorage.setItem('clipsync_history', JSON.stringify(history));
    renderHistory();
}

function deleteFromHistory(id) {
    let history = getLocalHistory();
    history = history.filter(item => item.id !== id);
    localStorage.setItem('clipsync_history', JSON.stringify(history));
    renderHistory();
}

btnClearHistory.addEventListener('click', () => {
    if (confirm('Deseja realmente apagar todo o histórico local?')) {
        localStorage.removeItem('clipsync_history');
        renderHistory();
    }
});

function renderHistory() {
    const history = getLocalHistory();
    historyList.innerHTML = '';

    if (history.length === 0) {
        historyList.innerHTML = '<p class="text-xs text-slate-500 text-center py-2">Nenhum item no histórico.</p>';
        return;
    }

    history.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'bg-slate-900/80 border border-slate-700/60 rounded-xl p-3 flex flex-col gap-2 hover:border-slate-600 transition';
        
        const previewText = item.content.length > 80 ? item.content.substring(0, 80) + '...' : item.content;

        itemEl.innerHTML = `
            <div class="flex justify-between items-center text-[10px] text-slate-400">
                <span class="text-indigo-400 font-medium">De: ${escapeHtml(item.sender)}</span>
                <span>${item.time}</span>
            </div>
            <p class="text-xs font-mono text-slate-200 break-words whitespace-pre-wrap">${escapeHtml(previewText)}</p>
            <div class="flex justify-end gap-2 pt-1 border-t border-slate-800">
                <button class="btn-copy-item text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 py-1 px-2 rounded hover:bg-slate-800 transition">
                    📋 Copiar
                </button>
                <button class="btn-delete-item text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 py-1 px-2 rounded hover:bg-slate-800 transition">
                    🗑️ Excluir
                </button>
            </div>
        `;

        // Evento Copiar Item Específico
        itemEl.querySelector('.btn-copy-item').addEventListener('click', async () => {
            await copyToClipboard(item.content);
        });

        // Evento Deletar Item
        itemEl.querySelector('.btn-delete-item').addEventListener('click', () => {
            deleteFromHistory(item.id);
        });

        historyList.appendChild(itemEl);
    });
}

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, match => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[match]));
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        alert('Copiado para a área de transferência!');
    } catch {
        // Fallback para seleção de texto se permissão for negada
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = text;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextArea);
        alert('Copiado!');
    }
}

// Configurações
btnSaveConfig.addEventListener('click', () => {
    const uId = inputUserId.value.trim();
    const dId = inputDeviceId.value.trim();

    if (uId && dId) {
        localStorage.setItem('clipsync_user_id', uId);
        localStorage.setItem('clipsync_device_id', dId);
        userId = uId;
        deviceId = dId;
        init();
    } else {
        alert('Por favor, informe ambos os UUIDs.');
    }
});

// WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/clipboard/${userId}/${deviceId}`;

    updateStatus('Conectando...', 'bg-amber-500/20', 'text-amber-300', 'bg-amber-400');

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        updateStatus('Conectado', 'bg-emerald-500/20', 'text-emerald-300', 'bg-emerald-400');
    };

    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'clipboard_update' && data.sender_device_id !== deviceId) {
                clipboardDisplay.value = data.content;
                const sender = data.sender_device_name || 'Outro aparelho';
                senderInfo.textContent = `Vindo de: ${sender}`;
                
                // Adiciona automaticamente ao histórico local
                addToHistory(data.content, sender);
            }
        } catch (e) {
            console.error('Erro ao processar mensagem:', e);
        }
    };

    socket.onclose = () => {
        updateStatus('Desconectado', 'bg-rose-500/20', 'text-rose-300', 'bg-rose-400');
        setTimeout(connectWebSocket, 4000);
    };

    socket.onerror = (err) => {
        console.error('Erro no WebSocket:', err);
        socket.close();
    };
}

function updateStatus(text, bgClass, textClass, dotClass) {
    statusBadge.className = `px-3 py-1 rounded-full text-xs font-semibold ${bgClass} ${textClass} border border-current flex items-center gap-1.5`;
    statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full ${dotClass} animate-pulse"></span> ${text}`;
}

btnCopy.addEventListener('click', async () => {
    const text = clipboardDisplay.value;
    if (!text) return;
    await copyToClipboard(text);
});

btnSend.addEventListener('click', () => {
    const content = sendInput.value.trim();
    if (content && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ content }));
        addToHistory(content, 'Você (Este dispositivo)');
        sendInput.value = '';
        
        const originalText = btnSend.innerHTML;
        btnSend.innerHTML = '<span>🚀</span> Enviado!';
        setTimeout(() => { btnSend.innerHTML = originalText; }, 1500);
    }
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/sw.js').catch(console.error);
}

init();