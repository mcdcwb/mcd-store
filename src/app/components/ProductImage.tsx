import { useState, type ImgHTMLAttributes } from "react";
import { productImagePlaceholder } from "../lib/products";

export function ProductImage({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failedSource, setFailedSource] = useState<string>();
  return <img {...props} alt={alt} src={!src || failedSource === src ? productImagePlaceholder : src}
    onError={() => setFailedSource(src)} />;
}
