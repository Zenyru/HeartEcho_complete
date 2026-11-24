// ====================================================================================
// Calming music: plays ready-made audio files and crossfades between them
// ====================================================================================
// There are 6 music files in public/music/, one for each heart-rate zone (see zones.ts).
// Each is a soft, swelling pad with a gentle felt-piano melody (short phrases with pauses):
//   0 still.mp3   (surging 120+)   very slow and sparse, low and dark
//   1 ground.mp3  (racing 108+)    slow, simple phrases
//   2 anchor.mp3  (fast 95+)       warm chords, a little more melody
//   3 drift.mp3   (elevated)       flowing broken chords + melody
//   4 flow.mp3    (settling)       open chords + a floating melody
//   5 float.mp3   (calm)           high, airy chords + soft chimes
// All 6 are in the same key (D major), so two of them sound fine together while one fades into the other.
//
// Each file is 100 seconds: the real 96-second loop, with 2 extra seconds copied onto each end.
// We loop only the middle part (2 s → 98 s), so the loop never has a gap or a click.
//
// Want different music? Put your own MP3s in public/music/ with the same 6 names.
// (Then set LOOP_START = 0 and LOOP_END = 0, which means "loop the whole file".)

// ---------- Settings ----------
const FILES = ["still", "ground", "anchor", "drift", "flow", "float"]; // public/music/<name>.mp3, in mood order
const LOOP_START = 2; //   seconds: where the loop starts inside each file
const LOOP_END = 98; //    seconds: where it ends
const FADE_IN = 6; //      seconds for a new mood to fade in
const FADE_OUT = 10; //    seconds for the old mood to fade out (longer, so there's never a quiet gap)
const VOLUME = 0.9; //     overall volume (0 – 1)

// ---------- State ----------
let audioContext: AudioContext | null = null; // the browser's sound player
let master: GainNode | null = null; //          one volume knob for everything
const downloads: Promise<ArrayBuffer>[] = []; // the 6 files being downloaded
const tracks: (AudioBuffer | null)[] = []; //    the 6 files, decoded and ready to play
let current = -1; //                             which mood is playing now (-1 = none)
let playing = false;
let stopTimer: number | null = null;

// what's playing for each mood: the sound source and its own volume knob
type Player = { source: AudioBufferSourceNode; gain: GainNode };
const players: (Player | null)[] = [null, null, null, null, null, null];

// ---------- Getting permission to play sound ----------
// Browsers only let a page make sound if it's switched on DURING a click.
// unlockSound() creates the sound player and switches it on straight away, inside the click.

// Call at the very start of a click handler (Try demo, Connect sensor, Start session, the music button)
export function unlockSound() {
  if (!audioContext) audioContext = new AudioContext(); // made during a click → allowed to play
  if (audioContext.state !== "running") audioContext.resume(); // switch it on (also inside the click)
}

// Call once when the page opens: starts downloading the 6 files, so they're ready when needed
export function preloadMusic() {
  if (downloads.length > 0) return; // already started
  FILES.forEach((name, i) => {
    downloads[i] = fetch(`/music/${name}.mp3`).then((response) => response.arrayBuffer());
  });
}

// Turns file number i into playable sound (only the first time it's needed)
async function getTrack(i: number): Promise<AudioBuffer> {
  if (tracks[i]) return tracks[i]!;
  preloadMusic(); // (in case it wasn't started yet)
  const data = await downloads[i];
  const track = await audioContext!.decodeAudioData(data.slice(0)); // slice(0) = a copy, so we could decode it again
  tracks[i] = track;
  return track;
}

// ---------- Changing mood (smooth crossfade) ----------
export async function setMood(index: number) {
  if (!audioContext || !master || !playing || index === current) return;
  current = index;
  const now = audioContext.currentTime;

  // 1) fade out whatever else is playing, then stop it
  players.forEach((player, i) => {
    if (player && i !== index) {
      fadeTo(player.gain, 0, FADE_OUT);
      player.source.stop(now + FADE_OUT + 0.5); // stop once it's silent
      players[i] = null;
    }
  });

  // 2) already playing this one (e.g. music restarted while it was still fading out)? → just turn it back up
  const existing = players[index];
  if (existing) {
    fadeTo(existing.gain, 1, FADE_IN);
    return;
  }

  // 3) start the new mood silently and fade it in
  const track = await getTrack(index);
  if (current !== index || !playing) return; // the mood changed again while we were loading
  const gain = audioContext.createGain();
  gain.gain.value = 0;
  gain.connect(master);
  const source = audioContext.createBufferSource();
  source.buffer = track;
  source.loop = true; //               play forever…
  source.loopStart = LOOP_START; //    …looping only the middle part, so there's no gap
  source.loopEnd = LOOP_END;
  source.connect(gain);
  source.start(audioContext.currentTime + 0.05, LOOP_START);
  fadeTo(gain, 1, FADE_IN);
  players[index] = { source, gain };
}

// Smoothly turns a volume knob to `target` over `seconds` (never a jump, so never a click)
function fadeTo(gain: GainNode, target: number, seconds: number) {
  const now = audioContext!.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now); //       start from where it is now
  gain.gain.linearRampToValueAtTime(target, now + seconds);
}

// ---------- Start / stop ----------
// Returns true if sound is really playing, false if the browser is still blocking it
export async function startMusic(moodIndex: number): Promise<boolean> {
  if (!audioContext) audioContext = new AudioContext(); // (normally unlockSound already made it)
  if (audioContext.state !== "running") audioContext.resume();

  if (!master) {
    master = audioContext.createGain();
    master.gain.value = 0;
    master.connect(audioContext.destination); // → speakers
    keepPlayingInBackground();
  }
  if (stopTimer) {
    window.clearTimeout(stopTimer); // we were fading out → cancel that
    stopTimer = null;
  }

  playing = true;
  fadeTo(master, VOLUME, 2); // fade everything in over 2 seconds
  setPlaybackState("playing");
  await setMood(moodIndex);

  return audioContext.state === "running";
}

// Fade out, then stop everything
export function stopMusic() {
  if (!audioContext || !master || !playing) return;
  playing = false;
  current = -1;
  fadeTo(master, 0, 3);
  setPlaybackState("paused");
  stopTimer = window.setTimeout(() => {
    players.forEach((player, i) => {
      player?.source.stop();
      players[i] = null;
    });
    stopTimer = null;
  }, 3200);
}

// ---------- Keep playing when you switch to another app or tab ----------
// (Audio files keep playing in the background by themselves; this just makes sure
//  the sound comes back on if the computer pauses it, and shows it in the system's media controls.)
function keepPlayingInBackground() {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && playing && audioContext?.state !== "running") audioContext?.resume();
  });
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: "Calming music",
      artist: "HeartEcho",
      album: "Breathing session",
    });
  }
}

// tells the operating system whether the music is playing (for its media controls)
function setPlaybackState(state: "playing" | "paused") {
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = state;
}
