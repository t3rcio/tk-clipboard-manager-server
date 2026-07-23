
// Elementos da DOM
const configCard = document.getElementById('config-card');
const mainCard = document.getElementById('main-card');
const sendCard = document.getElementById('send-card');
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
        connectWebSocket();
    } else {
        configCard.classList.remove('hidden');
    }
}

// Salvar Configurações
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

// Conectar ao WebSocket
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
                senderInfo.textContent = `Vindo de: ${data.sender_device_name || 'Outro aparelho'}`;
                
                // Tenta copiar automaticamente se o navegador permitir
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(data.content).catch(() => {
                        // Navegadores mobile costumam exigir clique do usuário para writeText
                    });
                }
            }
        } catch (e) {
            console.error('Erro ao processar mensagem:', e);
        }
    };

    socket.onclose = () => {
        updateStatus('Desconectado', 'bg-rose-500/20', 'text-rose-300', 'bg-rose-400');
        setTimeout(connectWebSocket, 4000); // Reconexão automática
    };

    socket.onerror = (err) => {
        console.error('Erro no WebSocket:', err);
        socket.close();
    };
}

// Atualizar a Badge de Status
function updateStatus(text, bgClass, textClass, dotClass) {
    statusBadge.className = `px-3 py-1 rounded-full text-xs font-semibold ${bgClass} ${textClass} border border-current flex items-center gap-1.5`;
    statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full ${dotClass} animate-pulse"></span> ${text}`;
}

// Botão de Copiar Manual para a Área de Transferência do Smartphone
btnCopy.addEventListener('click', async () => {
    const text = clipboardDisplay.value;
    if (!text) return;

    try {
        await navigator.clipboard.writeText(text);
        const originalText = btnCopy.innerHTML;
        btnCopy.innerHTML = '<span>✅</span> Copiado com sucesso!';
        btnCopy.classList.replace('bg-indigo-600', 'bg-emerald-600');
        
        setTimeout(() => {
            btnCopy.innerHTML = originalText;
            btnCopy.classList.replace('bg-emerald-600', 'bg-indigo-600');
        }, 2000);
    } catch (err) {
        alert('Erro ao copiar. Selecione o texto manualmente.');
    }
});

// Enviar texto do Celular para os outros dispositivos
btnSend.addEventListener('click', () => {
    const content = sendInput.value.trim();
    if (content && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ content }));
        sendInput.value = '';
        
        // Exibe confirmação visual
        const originalText = btnSend.innerHTML;
        btnSend.innerHTML = '<span>🚀</span> Enviado!';
        setTimeout(() => { btnSend.innerHTML = originalText; }, 1500);
    }
});

// Registra o Service Worker (PWA)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/static/sw.js').catch(console.error);
}

init();