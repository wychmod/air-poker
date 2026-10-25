const video = document.querySelector('#comparison'),
  status = document.querySelector('#compare-status'),
  level = document.querySelector('#match-level');
const versions = {
  v1: {
    url: '../releases/portrait-v1/zh/air-poker-douyin-30s.mp4',
    label: 'V1 音乐字幕版',
    loudness: -14.21,
  },
  v2: {
    url: '../releases/portrait-v2/zh/air-poker-douyin-voice-v2.mp4',
    label: 'V2 中文旁白版',
    loudness: -14.86,
  },
};
let selected = 'v2',
  generation = 0;
function matchLevel() {
  video.volume = level.checked
    ? Math.min(1, 10 ** ((-14.86 - versions[selected].loudness) / 20))
    : 1;
}
async function choose(key) {
  const request = ++generation,
    time = Number.isFinite(video.currentTime) ? video.currentTime : 0,
    resume = !video.paused;
  video.pause();
  selected = key;
  status.textContent = '正在加载 ' + versions[key].label + '…';
  for (const button of document.querySelectorAll('[data-version]'))
    button.setAttribute('aria-pressed', String(button.dataset.version === key));
  const loaded = new Promise((ok, fail) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoad);
      video.removeEventListener('error', onError);
    };
    const onLoad = () => {
      cleanup();
      ok();
    };
    const onError = () => {
      cleanup();
      fail(new Error('音视频未就绪，请先完成制作和归档。'));
    };
    video.addEventListener('loadedmetadata', onLoad);
    video.addEventListener('error', onError);
  });
  video.src = versions[key].url;
  video.load();
  try {
    await loaded;
    if (request !== generation) return;
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05));
    matchLevel();
    if (resume) await video.play();
    status.textContent =
      versions[key].label + ' · ' + (level.checked ? '已匹配试听音量' : '原始音量');
  } catch (error) {
    if (request === generation) status.textContent = error.message;
  }
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-version]');
  if (button) choose(button.dataset.version);
});
level.addEventListener('change', () => {
  matchLevel();
  status.textContent =
    versions[selected].label + ' · ' + (level.checked ? '已匹配试听音量' : '原始音量');
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) video.pause();
});
window.addEventListener('pagehide', () => video.pause());
await choose('v2');
try {
  const response = await fetch('../releases/portrait-v2/zh/narration.json');
  if (!response.ok) throw new Error('No transcript');
  const data = await response.json();
  for (const cue of data.cues) {
    const li = document.createElement('li');
    li.textContent = cue.start.toFixed(2) + 's — ' + cue.text;
    document.querySelector('#voice-transcript').append(li);
  }
} catch {
  document.querySelector('#voice-transcript').textContent = '文字稿未就绪。';
}
