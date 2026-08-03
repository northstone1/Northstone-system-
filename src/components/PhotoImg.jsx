import { useEffect, useState } from "react";
import { getSignedPhotoUrl, PROJECT_PHOTOS_BUCKET } from "../lib/data/storage";

// project-photos is a private bucket, so every display needs a signed URL
// resolved first — this wraps that async step behind a plain <img>-shaped
// component so call sites don't have to think about it.
export default function PhotoImg({ path, bucket = PROJECT_PHOTOS_BUCKET, style, ...rest }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    getSignedPhotoUrl(bucket, path)
      .then((u) => active && setUrl(u))
      .catch(() => active && setUrl(null));
    return () => {
      active = false;
    };
  }, [bucket, path]);

  if (!url) return <div style={{ ...style, background: "#f1efe7" }} />;
  return <img src={url} style={style} {...rest} />;
}
