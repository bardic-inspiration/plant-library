/** Offer a file to save, made in the browser. */
export function download(text: string, name: string, type: string) {
  const href = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
