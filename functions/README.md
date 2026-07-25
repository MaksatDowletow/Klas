# Klas media deletion backend

The `deleteMediaAsset` Firebase Cloud Function verifies the Firebase ID token, checks Firestore media ownership, deletes the physical Cloudinary asset, then deletes the Firestore media document.

## One-time secret setup

```bash
firebase functions:secrets:set CLOUDINARY_CLOUD_NAME
firebase functions:secrets:set CLOUDINARY_API_KEY
firebase functions:secrets:set CLOUDINARY_API_SECRET
```

Use the values from the Cloudinary API Keys page. Never commit the API secret.

## Install and deploy

```bash
npm run install:functions
npm run test:functions
npm run deploy:media-backend
```

The frontend endpoint is configured in `klas-config.js` as `cloudinary.deleteEndpoint`.

## Security contract

- Only `POST` is accepted.
- The request must contain `Authorization: Bearer <Firebase ID token>`.
- The caller must own `media/{mediaId}`.
- Only Cloudinary HTTPS delivery URLs are parsed when legacy records have no stored `publicId`.
- The physical asset is destroyed with CDN invalidation before Firestore metadata is deleted.
- Repeating a request for an already deleted media document is safe and returns success.
