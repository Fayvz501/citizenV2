function initBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.log('[TG] Disabled (no token/chat id)');
    return;
  }
  console.log('[TG] Bot init skipped in lightweight deploy');
}

module.exports = { initBot };
