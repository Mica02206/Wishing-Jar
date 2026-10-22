# Wishing Jar

A small, responsive wishing jar experience built with HTML, CSS, and JavaScript. Create a jar to get a shareable `?jar=...` link, fold in a wish, and click a star or the jar to read a note.

## Run it

Serve this folder with any static HTTP server. For example, from this directory run `python -m http.server 8000`, then open `http://localhost:8000`. ES modules and the Firebase adapter need an HTTP server; opening `index.html` as a `file://` URL is not supported.

## Reference assets

`image_14a79e.jpg` is the warm beige linen texture used for the page background. `jar-photo.png` is the transparent photoreal glass cutout used for the jar body. `origami-star.png` is a textured folded-paper lucky star; the app hue-tints it per wish color while keeping its folds and shadows.

## Shared jars with Firebase

The app works immediately in local demo mode and stores wishes in this browser's local storage. To share jars across devices, create a Firebase project, enable Cloud Firestore, add a web app, and paste its web configuration into `firebase-config.js`. The app then creates documents in `jars/{jarId}` and listens for real-time wish updates.

Configure Firestore rules for your use case before sharing publicly. A permissive development-only rule is not appropriate for a public deployment; add validation and abuse protection before launch.

## Interaction

- `Create my wishing jar` creates an empty jar and writes its ID into the current URL.
- `Write a wish` opens a paper note. Submitting folds the note down and drops a new faceted star into the jar.
- Click any star to unfold its wish, or click the jar to open a random wish.
- The local demo syncs between tabs in the same browser. Firebase mode provides shared, real-time synchronization.
