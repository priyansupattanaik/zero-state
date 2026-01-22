/**
 * Image Processing Engine for Zero State
 * Ensures all media fits within Mesh/Nostr packet limits (<60KB recommended)
 */
export class ImageUtils {
  static async processImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          // 1. Resize logic (Max dimension 600px for safety)
          const MAX_DIM = 600;
          if (width > height) {
            if (width > MAX_DIM) {
              height *= MAX_DIM / width;
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width *= MAX_DIM / height;
              height = MAX_DIM;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          // 2. Compress to JPEG at 60% quality
          // This usually results in a 20-40KB string
          const dataUrl = canvas.toDataURL("image/jpeg", 0.6);

          // Remove the "data:image/jpeg;base64," prefix for raw binary storage
          const rawBase64 = dataUrl.split(",")[1];
          resolve(rawBase64);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  }
}
