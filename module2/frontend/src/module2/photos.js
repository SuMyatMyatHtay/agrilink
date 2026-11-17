export async function compactPhoto(file) {
  if (file.size > 15 * 1024 * 1024) throw new Error('Use a photo smaller than 15 MB');
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 800 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75));
    if (!blob || blob.size > 650000) throw new Error('Photo is too large after resizing; choose a smaller photo');
    return new File([blob], 'crop.jpg', {type:'image/jpeg'});
  } finally { image.close(); }
}
