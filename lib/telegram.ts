import axios from 'axios';

export async function sendTelegramMessage(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("Telegram Token veya Chat ID eksik. Mesaj gönderilemedi.");
    return false;
  }

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    });
    return true;
  } catch (error: any) {
    console.error("Telegram mesajı gönderilemedi:", error?.response?.data || error.message);
    return false;
  }
}
