// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;

// DOM Elements
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const botName = document.getElementById('bot-name');
const webhookInput = document.getElementById('webhook-input');
const sendButton = document.getElementById('send-button');
const outputWindow = document.getElementById('output-window');

// Configuration
// Replace this with your actual webhook URL
const WEBHOOK_URL = 'https://dd54-95-56-11-27.ngrok-free.app/webhook-test/d0740166-ee1e-45e2-89d3-f242393f3916'; 

// Setup Mini App
function initApp() {
    tg.expand(); // Expand the app to full height
    tg.ready();

    // Get User Data
    const user = tg.initDataUnsafe?.user;
    
    if (user) {
        if (user.photo_url) {
            userAvatar.src = user.photo_url;
        } else {
            // Fallback if no photo
            userAvatar.src = `https://ui-avatars.com/api/?name=${user.first_name}&background=4ade80&color=0f172a`;
        }
        
        userName.textContent = user.username ? `@${user.username}` : user.first_name;
    } else {
        // Fallback for development/testing outside TG
        console.warn('App is running outside of Telegram');
        userName.textContent = 'Разработчик';
        userAvatar.src = 'https://ui-avatars.com/api/?name=Dev&background=4ade80&color=0f172a';
    }

    // Set Bot Name (You can customize this)
    botName.textContent = 'AI Assistant Bot';
}

// Handle request sending
async function handleSendRequest() {
    const query = webhookInput.value.trim();
    if (!query) return;

    // UI Feedback
    webhookInput.disabled = true;
    sendButton.disabled = true;
    outputWindow.classList.remove('empty');
    outputWindow.textContent = 'Отправка запроса...';
    outputWindow.classList.add('loading-neon');

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            mode: 'cors', // Enable CORS
            body: JSON.stringify({ 
                query: query,
                user: tg.initDataUnsafe?.user,
                initData: tg.initData
            })
        });

        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }

        const data = await response.json();
        
        // Handle different response formats (string or object with reply field)
        const reply = typeof data === 'string' ? data : (data.reply || data.message || JSON.stringify(data, null, 2));
        
        outputWindow.textContent = reply;
        outputWindow.classList.remove('empty');
        webhookInput.value = '';

    } catch (error) {
        let errorMsg = error.message;
        if (WEBHOOK_URL.includes('your-webhook-endpoint.com')) {
            errorMsg = 'Вы не указали реальный адрес вебхука в строке 14 файла main.js';
        }
        outputWindow.textContent = 'Ошибка: ' + errorMsg;
    } finally {
        outputWindow.classList.remove('loading-neon');
        webhookInput.disabled = false;
        sendButton.disabled = false;
    }
}

// Event Listeners
sendButton.addEventListener('click', handleSendRequest);

webhookInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleSendRequest();
    }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', initApp);
