# Mobile Floorplan

A floor plan editor built for phones. Drag rooms, doors, windows and furniture onto a grid, then export the plan for whatever program needs it next. It is plain HTML, CSS and JavaScript: no build step, no server, and nothing leaves the browser.

**Use it:** https://misssophiesterling.github.io/mobile-floorplan/

It grew out of the [nzyme floor plan editor](https://github.com/MissSophieSterling/nzyme-floorplan-editor) and keeps that tool's idea (quick rectangles, sizes you can read) while adding touch editing, more formats, and a way for other apps to use it.

## Drawing

- Drag a tile from the bottom bar up onto the grid, or tap a tile to drop it in the middle of the screen.
- Drag anything to move it. Rooms line up with neighbouring walls. Doors and windows snap onto the nearest wall and turn to face into the room. Moving a room moves the doors, windows and furniture inside it.
- Drag the blue dot to resize, or type exact sizes in the panel that opens.
- Pinch to zoom and drag empty space to pan. With a mouse, use the wheel.
- Add as many floors as you need. Tap the current floor's name to rename it.
- Metres or feet, switchable at any time from the menu.
- Undo and redo. The plan autosaves in the browser.
- Installable as an app (PWA) and works offline after the first visit.

## Export formats

| Format | Covers | Opens in |
|---|---|---|
| PNG, JPG | current floor | anything; also as a trace-over image in nzyme, Floorplanner, RoomSketcher, Planner 5D |
| PDF | all floors, one A4 page each | any PDF reader, printers |
| SVG | current floor | Illustrator, Inkscape, Figma, browsers |
| DXF (R12, metres) | current floor, on WALLS / DOORS / WINDOWS / FURNITURE / ROOM_LABELS layers | AutoCAD, LibreCAD, DraftSight, SketchUp Pro, Revit, Chief Architect, and most CAD tools |
| Sweet Home 3D (`.sh3d`) | all floors as levels, with rooms and walls | Sweet Home 3D 5.3 and later |
| OBJ | all floors stacked: floors, 2.5 m walls, furniture as blocks | Blender, SketchUp, 3ds Max, Unity, most 3D tools |
| CSV | room list with sizes and areas | Excel, Numbers, Google Sheets |
| JSON | the full editable plan | this editor, or any app that embeds it |

Known limits: rooms are rectangles. The Sweet Home 3D and OBJ files leave out doors and windows, and walls there have no openings. The Sweet Home 3D file contains only the `Home.xml` entry, which Sweet Home 3D 5.3+ reads; older versions will not open it.

Image exports include the overall width and length, a scale bar, and a small "Service provided by zkitszo" line.

## Using it inside another app

Other apps can use this editor as their floor plan generator. There are three ways, from least to most work:

1. **Link out.** Open `…/mobile-floorplan/?return=https://yourapp.example/done`. When the user taps **Done**, the editor goes to that address with the plan attached as `#plan=<base64url JSON>`.
2. **Embed in a web page.** Load `sdk/mobile-floorplan-sdk.js`, call `MobileFloorplan.embed('#el', {...})`, and you get change and save events plus `editor.export('pdf')`, which returns the file as a Blob.
3. **Native app WebView.** React Native, Android and iOS hosts get events through their normal WebView bridges and send commands with `MobileFloorplan.receive(msg)`.

The full guide, with a message reference and code for each platform, is in [EMBEDDING.md](EMBEDDING.md). The same instructions are in the app under **Menu → About & embedding guide**. A working host page is at [`examples/embed.html`](examples/embed.html).

## Hosting your own copy

Serve the folder from any static host. For GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / root**. To run it locally:

```sh
npx http-server -c-1 .
```

and open http://localhost:8080. The service worker only registers over HTTPS, so local testing is not cached.

## Files

```
index.html                 the app
css/app.css                styles (light and dark)
js/shapes.js               catalogue, symbols, geometry, SVG drawing
js/exporters.js            PNG, JPG, PDF, SVG, DXF, SH3D, OBJ, CSV, JSON writers
js/app.js                  editor, gestures, embedding bridge, About page
sdk/mobile-floorplan-sdk.js  script for host apps
examples/embed.html        demo host page
manifest.webmanifest, sw.js, icons/   install and offline support
```

## Licence

MIT. Service provided by zkitszo.
