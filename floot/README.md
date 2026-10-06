# Spanleaf on Floot

This folder is the Spanleaf carousel maker rebuilt as a [Floot](https://floot.com) project (project id `09d91ac8-5264-46a9-b75b-031f1ea13cff`). It is a separate, smaller build from the Next.js app in the rest of this repository: Floot has its own page, helper and component structure and runs on the visitor's browser only, so it can't take the Next app as it is.

## What is here

Only the code written for this app. Floot's own component kit (`Button`, `Input`, `Select`, `Dialog`, `Slider`, `Switch`, `Tabs`, `Textarea`, `Skeleton`, and the rest of `components/`) is added to every Floot project when it is created, so it is not copied here.

| Path | What it is |
| --- | --- |
| `helpers/carouselModel.tsx` | The model: slides, layers, and the add, copy, remove, move and align functions |
| `helpers/useEditorState.tsx` | Editor state with undo and redo |
| `helpers/projectStorage.tsx` | Projects in the browser (IndexedDB), with a 30 day bin |
| `helpers/exportSlides.tsx` | PNG per slide, zipped when there are several |
| `helpers/preparePicture.tsx` | Reads a photo and shrinks it to 2400 px |
| `helpers/photoStyle.tsx`, `strokes.tsx`, `stickerArt.tsx`, `snapping.tsx`, `themes.tsx` | Crop and adjust, drawing, stickers, snapping guides, themes and arranging photos |
| `components/CarouselCanvas.tsx` | The wide canvas. Only the part in view is drawn, so hundreds of slides stay light |
| `components/EditorPanels.tsx` | Photo style, draw, sticker and theme panels |
| `pages/` | The landing page (`/`), the projects page (`/app`) and the editor (`/app/project/:projectId`) |
| `helpers/*.spec.tsx` | Tests of the logic. They pass under Floot's test runner |
| `base.css` | The design tokens |

## Not in this build

Cut-out (it needs a WebAssembly model, which Floot can't bundle), the AI composer (it would spend Floot credits and is not set up), accounts and cloud storage, and video. The full app with those is the Next.js app in the rest of the repository.

## Using it

Create a Floot project, add `konva`, `react-konva@19.2.0`, `fflate` and `idb-keyval`, and copy these files over the matching paths. `react-konva` has to match the React version Floot runs, which is 19.2.
