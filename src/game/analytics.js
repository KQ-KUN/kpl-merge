// These flags describe one logical round and never contain player or team data.
export function createRoundAnalytics(send) {
  let active = false, favoriteSent = false, gameoverSent = false;
  const emit = event => { try { send(event); } catch { /* Tracking must not interrupt gameplay. */ } };
  return {
    begin(reason = 'start') {
      active = reason === 'start' || reason === 'restart';
      favoriteSent = gameoverSent = false;
      if (!active) return; // Automatic BFCache rebuilds and development scenes are not user-created rounds.
      if (reason === 'restart') emit('merge-restart');
      emit('merge-start');
    },
    favorite() {
      if (!active || favoriteSent || gameoverSent) return;
      favoriteSent = true; emit('merge-favorite');
    },
    gameover() {
      if (!active || gameoverSent) return;
      gameoverSent = true; emit('merge-gameover');
    },
    cancel() { active = false; }
  };
}
