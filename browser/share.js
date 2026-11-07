// System share is a phone affordance. Desktop Chromium also exposes navigator.share, but its
// share sheet is frequently missing or crashes, so desktop keeps the PNG download only.
export function systemShareSheetAvailable(win) {
  const nav = win?.navigator;
  if (!nav || typeof nav.share !== 'function') return false;
  const coarse =
    typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches;
  return coarse || nav.userAgentData?.mobile === true;
}

// Platform effects only. The caller provides a public, completed-match SVG.
export function createShareExporter({ document, notify, win = document.defaultView }) {
  const preview = document.getElementById('sharePreview');
  const frame = preview.closest('.share-preview');
  const status = document.getElementById('shareStatus');
  const save = document.getElementById('saveShareImage');
  const native = document.getElementById('nativeShareImage');
  const link = document.getElementById('shareLink');
  let generation = 0,
    previewUrl = null,
    ready = null,
    current = null;
  const say = (key) => {
    status.textContent = current?.messages[key] ?? '';
  };
  function clear() {
    generation++;
    ready = null;
    current = null;
    preview.removeAttribute('src');
    preview.hidden = true;
    frame?.classList.remove('is-revealing');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    save.disabled = true;
    native.disabled = true;
  }
  function reveal() {
    if (!frame) return;
    frame.classList.remove('is-revealing');
    void frame.offsetWidth;
    frame.classList.add('is-revealing');
  }
  return {
    clear,
    async prepare(data) {
      const id = ++generation;
      // Keep the previous image visible, but never export it as the requested language.
      ready = null;
      current = data;
      save.disabled = true;
      native.disabled = true;
      const { svg, messages, title, url } = data;
      link.value = url;
      save.textContent = messages.save;
      native.textContent = messages.share;
      native.hidden = !systemShareSheetAvailable(win);
      say('loading');
      const sourceUrl = URL.createObjectURL(
        new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
      );
      let nextUrl = null;
      try {
        const image = new Image();
        image.src = sourceUrl;
        await image.decode();
        if (id !== generation) return;
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1440;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve, reject) =>
          canvas.toBlob(
            (value) => (value ? resolve(value) : reject(new Error('PNG unavailable'))),
            'image/png',
          ),
        );
        if (id !== generation) return;
        nextUrl = URL.createObjectURL(blob);
        const nextImage = new Image();
        nextImage.src = nextUrl;
        await nextImage.decode();
        if (id !== generation) return;
        const previousUrl = previewUrl;
        previewUrl = nextUrl;
        nextUrl = null;
        preview.src = previewUrl;
        preview.alt = title;
        preview.hidden = false;
        reveal();
        ready = { ...data, blob };
        save.disabled = false;
        native.disabled = false;
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        say(systemShareSheetAvailable(win) ? 'ready' : 'readyDownload');
      } catch {
        if (id === generation) say(previewUrl ? 'refreshFailed' : 'failed');
      } finally {
        if (nextUrl) URL.revokeObjectURL(nextUrl);
        URL.revokeObjectURL(sourceUrl);
      }
    },
    download() {
      if (!ready) return;
      const anchor = document.createElement('a');
      anchor.href = previewUrl;
      anchor.download = ready.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      say('downloaded');
    },
    async share() {
      if (!ready) return;
      const data = ready;
      // Desktop keeps the PNG download; the share button is not shown there.
      if (!systemShareSheetAvailable(win)) {
        say('shareFailed');
        notify(data.messages.unavailable);
        return;
      }
      const file = new File([data.blob], data.filename, { type: 'image/png' });
      try {
        // Called directly from the click: PNG generation has already finished.
        const withFile = navigator.canShare?.({ files: [file] });
        await navigator.share(
          withFile
            ? { files: [file], title: data.title, text: data.text }
            : { title: data.title, text: data.text, url: data.url },
        );
        if (ready === data) say('shared');
      } catch (error) {
        if (ready !== data) return;
        if (error.name === 'AbortError') say('cancelled');
        else {
          say('shareFailed');
          notify(data.messages.unavailable);
        }
      }
    },
    async copy() {
      if (!current) return;
      const data = current;
      try {
        await navigator.clipboard.writeText(data.url);
        notify(data.messages.copied);
      } catch {
        if (current !== data) return;
        link.focus();
        link.select();
        say('manualCopy');
      }
    },
  };
}
