// --- ESTADO GLOBAL E CREDENCIAIS ---
let authMode = 'login'; // 'login' ou 'register'
let userId = localStorage.getItem('clipsync_user_id') || '';
let deviceId = localStorage.getItem('clipsync_device_id') || '';
let lastReceivedMsgId = localStorage.getItem('clipsync_last_msg_id') || 0;
let socket = null;

// --- ELEMENTOS DA DOM ---
// Cards e Seções
const authCard = document.getElementById('auth-card');
const deviceSetupCard = document.getElementById('device-setup-card');
const mainCard = document.getElementById('main-card');
const sendCard = document.getElementById('send-card');
const pairSection = document.getElementById('pair-section');
const historySection = document.getElementById('history-section');
const historyList = document.getElementById('history-list');

// Header
const statusBadge = document.getElementById('status-badge');
const btnLogout = document.getElementById('btn-logout');

// Form de Autenticação
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const btnAuthSubmit = document.getElementById('btn-auth-submit');

// Setup do Dispositivo Atual
const inputDeviceName = document.getElementById('input-device-name');
const btnRegisterDevice = document.getElementById('btn-register-device');

// Pareamento de Desktop via PIN
const inputPinCode = document.getElementById('input-pin-code');
const btnApprovePin = document.getElementById('btn-approve-pin');

// Dashboard do Clipboard
const clipboardDisplay = document.getElementById('clipboard-display');
const senderInfo = document.getElementById('sender-info');
const btnCopy = document.getElementById('btn-copy');
const sendInput = document.getElementById('send-input');
const btnSend = document.getElementById('btn-send');
const btnClearHistory = document.getElementById('btn-clear-history');

// --- CONTROLE DE NAVEGAÇÃO E INTERFACE ---
function navigateUI() {
    if (!userId) {
        // TELA 1: Usuário Não Autenticado
        authCard.classList.remove('hidden');
        deviceSetupCard.classList.add('hidden');
        mainCard.classList.add('hidden');
        sendCard.classList.add('hidden');
        if (pairSection) pairSection.classList.add('hidden');
        historySection.classList.add('hidden');
        statusBadge.classList.add('hidden');
        btnLogout.classList.add('hidden');
        
        if (socket) socket.close();
    } else if (!deviceId) {
        // TELA 2: Usuário Autenticado, mas Aparelho Não Registrado
        authCard.classList.add('hidden');
        deviceSetupCard.classList.remove('hidden');
        mainCard.classList.add('hidden');
        sendCard.classList.add('hidden');
        if (pairSection) pairSection.classList.add('hidden');
        historySection.classList.add('hidden');
        statusBadge.classList.add('hidden');
        btnLogout.classList.remove('hidden');
        
        if (socket) socket.close();
    } else {
        // TELA 3: Usuário Logado + Dispositivo Registrado -> Dashboard Completo
        authCard.classList.add('hidden');
        deviceSetupCard.classList.add('hidden');
        mainCard.classList.remove('hidden');
        sendCard.classList.remove('hidden');
        if (pairSection) pairSection.classList.remove('hidden');
        historySection.classList.remove('hidden');
        statusBadge.classList.remove('hidden');
        btnLogout.classList.remove('hidden');

        renderHistory();
        connectWebSocket();
    }
}

// --- AUTENTICAÇÃO (LOGIN / REGISTRO) ---

tabLogin.addEventListener('click', () => {
    authMode = 'login';
    tabLogin.className = 'text-indigo-400 font-bold border-b-2 border-indigo-500 pb-1 cursor-pointer';
    tabRegister.className = 'text-slate-400 font-medium pb-1 cursor-pointer';
    btnAuthSubmit.textContent = 'Entrar';
});

tabRegister.addEventListener('click', () => {
    authMode = 'register';
    tabRegister.className = 'text-indigo-400 font-bold border-b-2 border-indigo-500 pb-1 cursor-pointer';
    tabLogin.className = 'text-slate-400 font-medium pb-1 cursor-pointer';
    btnAuthSubmit.textContent = 'Criar Conta';
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();

    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.detail || 'Erro na operação de autenticação.');
            return;
        }

        userId = data.id;
        localStorage.setItem('clipsync_user_id', userId);
        navigateUI();

    } catch (err) {
        console.error(err);
        alert('Falha na comunicação com o servidor.');
    }
});

// --- VINCULAÇÃO RÁPIDA DESTE APARELHO ---

btnRegisterDevice.addEventListener('click', async () => {
    const name = inputDeviceName.value.trim() || 'Smartphone Web';

    try {
        const response = await fetch('/api/devices/quick-add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: name, user_id: userId })
        });

        const data = await response.json();

        if (response.ok) {
            deviceId = data.device_id;
            localStorage.setItem('clipsync_device_id', deviceId);
            navigateUI();
        } else {
            alert(data.detail || 'Erro ao registrar este dispositivo.');
        }
    } catch (err) {
        console.error(err);
        alert('Erro ao conectar dispositivo com o servidor.');
    }
});

// --- PAREAMENTO DE DESKTOP / APPLET VIA PIN ---

if (btnApprovePin) {
    btnApprovePin.addEventListener('click', async () => {
        const code = inputPinCode.value.trim();
        if (code.length !== 6) {
            alert('Por favor, informe o PIN de 6 dígitos exibido no seu computador.');
            return;
        }

        try {
            const response = await fetch('/api/auth/pair-device', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code, user_id: userId })
            });

            const data = await response.json();

            if (response.ok) {
                alert('✅ Dispositivo autorizado com sucesso!');
                inputPinCode.value = '';
            } else {
                alert(data.detail || 'Falha ao autorizar o código.');
            }
        } catch (err) {
            console.error(err);
            alert('Erro na comunicação ao autorizar PIN.');
        }
    });
}

// --- LOGOUT ---

btnLogout.addEventListener('click', () => {
    if (confirm('Deseja realmente sair da sua conta neste dispositivo?')) {
        localStorage.clear();
        userId = '';
        deviceId = '';
        lastReceivedMsgId = 0;
        navigateUI();
    }
});

// --- CONEXÃO WEBSOCKET ---

function connectWebSocket() {
    if (!userId || !deviceId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/clipboard/${userId}/${deviceId}?last_msg_id=${lastReceivedMsgId}`;

    updateStatus('Conectando...', 'bg-amber-500/20', 'text-amber-300', 'bg-amber-400');

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        updateStatus('Conectado', 'bg-emerald-500/20', 'text-emerald-300', 'bg-emerald-400');
        
        // Re-sincronização do buffer
        if (lastReceivedMsgId > 0) {
            socket.send(JSON.stringify({
                type: 'sync_request',
                last_msg_id: Number(lastReceivedMsgId)
            }));
        }
    };

    socket.onmessage = (event) => {
        console.log(event);
        try {
            const data = JSON.parse(event.data);

            if (data.type === 'clipboard_update') {
                if (data.msg_id) {
                    lastReceivedMsgId = data.msg_id;
                    localStorage.setItem('clipsync_last_msg_id', data.msg_id);
                }

                if (data.sender_device_id !== deviceId) {
                    clipboardDisplay.value = data.content;
                    const sender = data.sender_device_name || 'Outro aparelho';
                    senderInfo.textContent = `Vindo de: ${sender}`;
                    
                    addToHistory(data.content, sender);
                }
            }
        } catch (e) {
            console.error('Erro ao processar mensagem do WebSocket:', e);
        }
        return true;
    };

    socket.onclose = () => {
        updateStatus('Desconectado', 'bg-rose-500/20', 'text-rose-300', 'bg-rose-400');
        // Tenta reconexão automática a cada 4 segundos
        setTimeout(() => {
            if (userId && deviceId) connectWebSocket();
        }, 4000);
        return true;
    };

    socket.onerror = (err) => {
        console.error('Erro na conexão WebSocket:', err);
        socket.close();
        return true;
    };

}

function updateStatus(text, bgClass, textClass, dotClass) {
    statusBadge.className = `px-3 py-1 rounded-full text-xs font-semibold ${bgClass} ${textClass} border border-current flex items-center gap-1.5`;
    statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full ${dotClass} animate-pulse"></span> ${text}`;
}

// --- AÇÕES DE ENVIO E CÓPIA ---

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

// --- HISTÓRICO LOCAL DO DISPOSITIVO (LOCALSTORAGE) ---

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
    history = history.filter(item => item.content !== content);

    const newItem = {
        id: Date.now(),
        content: content,
        sender: senderName,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    history.unshift(newItem);
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
    if (confirm('Deseja apagar todo o histórico local deste dispositivo?')) {
        localStorage.removeItem('clipsync_history');
        renderHistory();
    }
});

function renderHistory() {
    const history = getLocalHistory();
    historyList.innerHTML = '';

    if (history.length === 0) {
        historyList.innerHTML = '<p class="text-xs text-slate-500 text-center py-2">Nenhum item salvo no histórico local.</p>';
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

        itemEl.querySelector('.btn-copy-item').addEventListener('click', async () => {
            await copyToClipboard(item.content);
        });

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
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = text;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextArea);
        alert('Copiado!');
    }
}

// --- INICIALIZAÇÃO DO SERVICE WORKER (PWA) ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/sw.js').catch(console.error);
}

// Inicialização da interface
navigateUI();