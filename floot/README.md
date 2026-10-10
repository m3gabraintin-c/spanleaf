# Spanleaf on Floot

This folder is the Spanleaf carousel maker as a [Floot](https://floot.com) project (project id `09d91ac8-5264-46a9-b75b-031f1ea13cff`), live at https://hessian.floot.app. It is a separate build from the Next.js app in the rest of this repository and has moved well past it.

## What is here

Only the code written for this app. Floot's own component kit (`Input`, `Select`, `Dialog`, `Slider`, `Switch`, `Tabs`, `Textarea`, `Skeleton` and the rest of `components/`) is added to every Floot project, so it is not copied here. `components/Button.module.css` is the one kit file that was changed (hover colours with better contrast), so it is included.

| Path | What it is |
| --- | --- |
| `helpers/carouselModel.tsx` | The model: slides, layers (photo, video, text, sticker, shape, drawing) and the slide and align operations |
| `helpers/useEditorState.tsx`, `editHistory.tsx` | Editor state with undo and redo; undo steps are kept in the browser so they survive a reload |
| `helpers/projectStorage.tsx`, `projectFiles.tsx` | Projects in the browser (IndexedDB) with a 30 day bin, and `.spanleaf` backup files |
| `helpers/exportSlides.tsx`, `pdfExport.tsx` | PNG or JPEG per slide (zipped), one PDF for LinkedIn, and a slide as video |
| `helpers/photoStyle.tsx` | Crop, 12 looks, warmth, tint, vignette, grain, and the instant-photo card |
| `helpers/richText.tsx`, `curvedText.tsx`, `measureText.tsx` | Highlighted words (`*like this*`), fit to width, text on a curve |
| `helpers/stickerArt.tsx`, `stickerEdge.tsx`, `cutout.tsx`, `myStickers.tsx` | Built-in stickers, stretchable tape, die-cut edges, and making stickers from photos on the device |
| `helpers/collage.tsx`, `themes.tsx`, `templates.tsx` | The collage shuffle (photos and videos), 16 themes, 12 templates |
| `helpers/shareLink.tsx`, `shareServer.tsx`, `endpoints/share-*` | Share links for comments: slide pictures in private storage, comments in Postgres, 30 day expiry |
| `endpoints/collage-plan_POST.ts` | The AI that picks tilts and stickers for the shuffle (Floot AI) |
| `components/CarouselCanvas.tsx` | The wide canvas. Only the part in view is drawn, so hundreds of slides stay light |
| `components/EditorPanels.tsx`, `EditorDialogs.tsx` | Panels (photo style, video trim, stickers and shapes, exact size, slide thumbnails, themes) and dialogs (export, share, phone preview, shortcuts) |
| `pages/` | Landing (`/`), projects (`/app`), editor (`/app/project/:projectId`), shared carousel (`/s/:shareId`), terms and privacy |
| `helpers/*.spec.tsx` | Tests of the logic. They pass under Floot's test runner |
| `helpers/db.tsx`, `schema.tsx`, `db/migrations/` | The database connection, its generated types, and the SQL that creates the share tables |

## Using it

Create a Floot project, add `konva`, `react-konva@19.2.0`, `fflate` and `idb-keyval`, provision a database, run `db/migrations/001_share_links.sql`, and copy these files over the matching paths. `react-konva` has to match the React version Floot runs, which is 19.2. The sticker cut-out model is a static asset at `/_cdn/static/models/u2netp.onnx` and is not in this folder.
