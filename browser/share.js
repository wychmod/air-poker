// Platform effects only. The caller provides a public, completed-match SVG.
export function createShareExporter({ document, notify }) {
  const preview = document.getElementById('sharePreview');
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
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    save.disabled = true;
    native.disabled = true;
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
      native.hidden = typeof navigator.share !== 'function';
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
        ready = { ...data, blob };
        save.disabled = false;
        native.disabled = false;
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        say('ready');
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
      if (!ready || typeof navigator.share !== 'function') return;
      const data = ready;
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
        if (ready === data) say(error.name === 'AbortError' ? 'cancelled' : 'shareFailed');
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
