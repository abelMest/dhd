// Editor-only image uploads to the public `photos` bucket (storage policies allow editors only).
// Images are resized in the browser first, so a phone photo never weighs megabytes.
import { supabase } from './supabase';

export const photoUrl = (path: string) =>
  !path ? '' : /^(https?:|data:)/.test(path) ? path : `${import.meta.env.PUBLIC_SUPABASE_URL}/storage/v1/object/public/${path}`;

const toJpeg = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that image.'))), 'image/jpeg', 0.85));

async function put(blob: Blob, prefix: string) {
  const name = `${prefix}-${Date.now()}.jpg`;
  const up = await supabase()!.storage.from('photos').upload(name, blob, { contentType: 'image/jpeg', upsert: true });
  if (up.error) throw up.error;
  return `photos/${name}`;
}

/** Centre-crops to a square (for portraits). Returns the storage path, e.g. photos/author-abel-123.jpg. */
export async function uploadSquare(file: File, prefix: string, size = 480) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  return put(await toJpeg(canvas), prefix);
}

/** Logos: keeps the shape and the transparency (PNG), at most 800px wide. Returns the storage path. */
export async function uploadLogo(file: File, prefix: string) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 800 / bmp.width);
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that image.'))), 'image/png'));
  const name = `${prefix}-${Date.now()}.png`;
  const up = await supabase()!.storage.from('photos').upload(name, blob, { contentType: 'image/png', upsert: true });
  if (up.error) throw up.error;
  return `photos/${name}`;
}

/** Keeps the shape, scales down to at most `maxW` wide (for images inside an edition). Returns the public URL. */
export async function uploadFigure(file: File, maxW = 1600) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bmp.width);
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // transparent PNGs get a white background rather than black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return photoUrl(await put(await toJpeg(canvas), 'figure'));
}
