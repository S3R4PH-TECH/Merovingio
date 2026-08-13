/**
 * Turns a picked file into the string the gateway stores in users.avatar_url.
 *
 * The platform has no object store and the gateway has no upload endpoint, so
 * the photo travels inline as a `data:image/…` URI. That only works if it is
 * small, which is the whole job here: whatever the user picked — a 12 MP phone
 * photo, most likely — is cropped square and redrawn at 256px before it is
 * encoded, so a row holds tens of kilobytes rather than tens of megabytes.
 */

/** Sent to the gateway at this size; the largest it is ever displayed is 96px. */
export const AVATAR_SIDE = 256;

/** Refused before decoding. Guards against a 100 MB TIFF pinning a tab. */
export const AVATAR_MAX_INPUT_BYTES = 8 * 1024 * 1024;

/** Matches the gateway's AVATAR_MAX_CHARS, so a rejection happens here first. */
export const AVATAR_MAX_ENCODED_CHARS = 512 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That file is not an image the browser can read'));
    image.src = source;
  });
}

export async function fileToAvatarDataUrl(file: File, side = AVATAR_SIDE): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pick an image file');
  }
  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    throw new Error('That image is over 8 MB — pick a smaller one');
  }

  const image = await loadImage(await readAsDataUrl(file));

  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('This browser cannot resize images');
  }

  // Cover-crop from the centre: a portrait squeezed into a square avatar looks
  // broken in a way a crop does not.
  const source = Math.min(image.width, image.height);
  context.drawImage(
    image,
    (image.width - source) / 2,
    (image.height - source) / 2,
    source,
    source,
    0,
    0,
    side,
    side,
  );

  const encoded = canvas.toDataURL('image/jpeg', 0.85);
  if (encoded.length > AVATAR_MAX_ENCODED_CHARS) {
    throw new Error('That image is too large even after resizing');
  }
  return encoded;
}
