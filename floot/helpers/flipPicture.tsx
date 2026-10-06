/** A mirror image of a picture, as a new picture address. Horizontal flips left and right, vertical flips top and bottom. */
export const flipPicture = (src: string, axis: "horizontal" | "vertical"): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("This browser can't flip pictures."));
      if (axis === "horizontal") {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      } else {
        ctx.translate(0, canvas.height);
        ctx.scale(1, -1);
      }
      ctx.drawImage(img, 0, 0);
      resolve(src.startsWith("data:image/jpeg") ? canvas.toDataURL("image/jpeg", 0.9) : canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("The picture couldn't be flipped."));
    img.src = src;
  });
