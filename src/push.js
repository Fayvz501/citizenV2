function initPush() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.log('[PUSH] Disabled (no VAPID keys)');
    return;
  }
  console.log('[PUSH] Init skipped in lightweight deploy');
}

function subscribe() { return true; }
function unsubscribe() { return true; }
function sendToUser() { return true; }
function sendToNearby() { return true; }
function getVapidPublicKey() { return process.env.VAPID_PUBLIC_KEY || ''; }

module.exports = { initPush, subscribe, unsubscribe, sendToUser, sendToNearby, getVapidPublicKey };
