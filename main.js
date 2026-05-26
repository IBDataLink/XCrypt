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
const WEBHOOK_URL = 'https://your-webhook-endpoint.com/api'; 

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
        // In a real scenario, you would send this to your server/webhook
        // For demonstration, we'll simulate a fetch
        
        /* 
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                query: query,
                user: tg.initDataUnsafe?.user 
            })
        });
        const data = await response.json();
        outputWindow.textContent = data.reply || 'Запрос отправлен успешно';
        */

        // Simulated delay for demonstration
        setTimeout(() => {
            outputWindow.textContent = `Вы отправили: "${query}"\n\nЭто демонстрационный ответ. Пожалуйста, укажите реальный URL вебхука в main.js для интеграции с вашим бэкендом.`;
            outputWindow.classList.remove('loading-neon');
            webhookInput.disabled = false;
            sendButton.disabled = false;
            webhookInput.value = '';
        }, 1500);

    } catch (error) {
        outputWindow.textContent = 'Ошибка при отправке запроса: ' + error.message;
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
