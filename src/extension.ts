// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from "path";

let renderedHtmlPanel: vscode.WebviewPanel | undefined;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('50ohm vscode extension now active');

    const openDisposable = vscode.commands.registerCommand(
        "bookToc.openMarkdown",
        async (uri: vscode.Uri) => {
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: false });
        }
    );
    context.subscriptions.push(openDisposable);

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            "50ohm.svgWhitePreview",
            new SvgWhitePreviewProvider(),
            { supportsMultipleEditorsPerDocument: true }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("50ohm.openUri", async (uriString: string) => {
            const uri = vscode.Uri.parse(uriString);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, { preview: false });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("50ohm.openPhotoGallery", async () => {
            const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
            if (!ws) {
                vscode.window.showErrorMessage("No workspace folder open.");
                return;
            }

            const pngFiles = await vscode.workspace.findFiles("contents/photos/*.png");

            const sorted = pngFiles
                .map((uri) => {
                    const base = uri.path.split("/").pop() ?? "";
                    const stem = base.replace(/\.png$/i, "");
                    const m = stem.match(/\d+/);
                    const n = m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
                    return { uri, base, stem, n };
                })
                .sort((a, b) => (a.n - b.n) || a.base.localeCompare(b.base));

            const panel = vscode.window.createWebviewPanel(
                "50ohm.photoGallery",
                `Photo Gallery (${sorted.length})`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    enableCommandUris: true,
                    localResourceRoots: [ws]
                }
            );

            const cards = (await Promise.all(sorted.map(async (f) => {
                const src = panel.webview.asWebviewUri(f.uri);

                const openImgCmd =
                    `command:50ohm.openPngWhitePreview?${encodeURIComponent(JSON.stringify([f.uri.toString()]))}`;

                const txtUri = f.uri.with({ path: f.uri.path.replace(/\.png$/i, ".txt") });
                const openTxtCmd =
                    `command:50ohm.openUri?${encodeURIComponent(JSON.stringify([txtUri.toString()]))}`;

                const altText = await readTextIfExists(txtUri, 8000);
                const searchKey = normalizeForSearch(`${f.stem} ${f.n} ${altText}`);

                return `
    <div class="card" title="${escapeHtml(f.base)}" data-key="${escapeHtml(searchKey)}">
      <a class="thumb" href="${openImgCmd}">
        <img src="${src}" alt="${escapeHtml(f.stem)}" loading="lazy" />
      </a>
      <div class="label">
        <code>${escapeHtml(f.stem)}</code>
        <span class="sep">·</span>
        <a class="tex" href="${openTxtCmd}">Alt-Text</a>
      </div>
    </div>
  `;
            }))).join("\n");


            panel.webview.html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy"
      content="
        default-src 'none';
        img-src ${panel.webview.cspSource} data:;
        style-src 'unsafe-inline';
        script-src 'unsafe-inline';
      " />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <style>
    body {
      margin: 0;
      padding: 16px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }

    .topbar {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .title { font-size: 14px; font-weight: 600; }

    .search {
      flex: 1 1 320px;
      max-width: 520px;
      display: flex;
      gap: 8px;
      align-items: center;
      border: 1px solid var(--vscode-editorWidget-border);
      background: var(--vscode-editorWidget-background);
      border-radius: 10px;
      padding: 8px 10px;
    }

    .search input {
      width: 100%;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }

    .count { opacity: 0.75; font-size: 12px; white-space: nowrap; }

    .grid { display: grid; gap: 16px; }
    @media (min-width: 1400px) { .grid { grid-template-columns: repeat(6, 1fr); } }
    @media (min-width: 1100px) { .grid { grid-template-columns: repeat(5, 1fr); } }
    @media (min-width: 800px)  { .grid { grid-template-columns: repeat(4, 1fr); } }
    @media (max-width: 799px)  { .grid { grid-template-columns: repeat(2, 1fr); } }

    .card {
      border: 1px solid var(--vscode-editorWidget-border);
      background: var(--vscode-editorWidget-background);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 6px 18px rgba(0,0,0,0.15);
    }

    /* Bei Fotos kein weißer “Papier”-Hintergrund nötig,
       aber wenn du willst: background:white; */
    .thumb {
      display: flex;
      align-items: center;
      justify-content: center;
      aspect-ratio: 1 / 1;
      background: var(--vscode-editorWidget-background);
      padding: 6px;
      text-decoration: none;
    }

    .thumb img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
    }

    .label {
      padding: 8px 10px;
      border-top: 1px solid var(--vscode-editorWidget-border);
      display: flex;
      gap: 8px;
      align-items: baseline;
      white-space: nowrap;
      overflow: hidden;
    }

    .sep { opacity: 0.6; }

    code {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .label a.tex {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      flex: 0 0 auto;
      font-size: 12px;
    }
    .label a.tex:hover { text-decoration: underline; }

    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="title">Photos in <code>contents/photos</code></div>
    <div class="search">
      <span style="opacity:.7">🔎</span>
      <input id="q" type="text" placeholder="Search (e.g. 123 ...)" />
    </div>
    <div class="count"><span id="shown">${sorted.length}</span> / ${sorted.length}</div>
  </div>

  <div class="grid">
    ${cards}
  </div>

  <script>
    const input = document.getElementById("q");
    const cards = Array.from(document.querySelectorAll(".card"));
    const shown = document.getElementById("shown");

    function apply() {
      const q = (input.value || "").trim().toLowerCase();
      let n = 0;
      for (const c of cards) {
        const key = c.getAttribute("data-key") || "";
        const ok = q === "" || key.includes(q);
        c.classList.toggle("hidden", !ok);
        if (ok) n++;
      }
      shown.textContent = String(n);
    }

    input.addEventListener("input", apply);

    window.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      } else if (e.key === "Escape" && document.activeElement === input) {
        input.value = "";
        apply();
        input.blur();
      }
    });
  </script>
</body>
</html>`;
        })
    );

    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            "50ohm.pngWhitePreview",
            new PngWhitePreviewProvider(),
            { supportsMultipleEditorsPerDocument: true }
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("50ohm.openPngWhitePreview", async (uriString: string) => {
            const uri = vscode.Uri.parse(uriString);
            await vscode.commands.executeCommand("vscode.openWith", uri, "50ohm.pngWhitePreview");
        })
    );

    const provider: vscode.TreeDataProvider<vscode.TreeItem> = {
        getTreeItem: (element) => element,

        getChildren: async (element?: vscode.TreeItem) => {
            // Helper: check if file exists
            const exists = async (uri: vscode.Uri) => {
                try {
                    await vscode.workspace.fs.stat(uri);
                    return true;
                } catch {
                    return false;
                }
            };

            // Helper: resolve ident -> (kind, uri)
            const resolveIdent = async (ident: string) => {
                const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
                if (!ws) return null;

                const slideUri = vscode.Uri.joinPath(ws, "contents", "slides", `${ident}.md`);
                if (await exists(slideUri)) return { kind: "slide" as const, uri: slideUri };

                const sectionUri = vscode.Uri.joinPath(ws, "contents", "sections", `${ident}.md`);
                if (await exists(sectionUri)) return { kind: "section" as const, uri: sectionUri };

                return null;
            };

            // 1) Root: Bücher
            if (!element) {
                const jsonUris = await vscode.workspace.findFiles("toc/*.json");

                const items = jsonUris.map((uri) => {
                    const base = uri.path.split("/").pop() ?? "unknown";
                    const bookKey = base.replace(/\.json$/i, "");

                    const item = new vscode.TreeItem(bookKey, vscode.TreeItemCollapsibleState.Collapsed);
                    item.resourceUri = uri;               // merken: welches JSON
                    (item as any).nodeType = "book";      // merken: Typ
                    (item as any).bookIdent = bookKey;
                    item.iconPath = new vscode.ThemeIcon("book");
                    return item;
                });

                items.sort((a, b) => (a.label ?? "").toString().localeCompare((b.label ?? "").toString()));
                return items;
            }

            // 2) Buch aufgeklappt -> Kapitel
            if ((element as any).nodeType === "book") {
                const bookUri = element.resourceUri!;
                const raw = await vscode.workspace.fs.readFile(bookUri);
                const txt = Buffer.from(raw).toString("utf8");
                const data = JSON.parse(txt);

                const chapters = (data.chapters ?? []) as any[];

                return chapters.map((ch, idx) => {
                    const rawTitle = ch?.title ?? "Ohne Titel";
                    const title = `${idx + 1}. ${rawTitle}`;

                    const bookIdent = (element as any).bookIdent as string; // <— NEU

                    const item = new vscode.TreeItem(title, vscode.TreeItemCollapsibleState.Collapsed);
                    item.resourceUri = bookUri;              // weiterhin das Buch-JSON
                    (item as any).nodeType = "chapter";
                    (item as any).chapterIndex = idx;        // welcher Chapter im JSON
                    (item as any).bookIdent = bookIdent; // <— NEU
                    return item;
                });
            }

            // 3) Kapitel aufgeklappt -> Sections/Slides
            if ((element as any).nodeType === "chapter") {
                const bookUri = element.resourceUri!;
                const chapterIndex = (element as any).chapterIndex as number;
                const bookIdent = (element as any).bookIdent as string; 

                const slidesFolder = new vscode.TreeItem("Slides", vscode.TreeItemCollapsibleState.Collapsed);
                (slidesFolder as any).nodeType = "chapterFolder";
                slidesFolder.resourceUri = bookUri;
                (slidesFolder as any).chapterIndex = chapterIndex;
                (slidesFolder as any).kind = "slide";
                (slidesFolder as any).bookIdent = bookIdent; 

                const sectionsFolder = new vscode.TreeItem("Sections", vscode.TreeItemCollapsibleState.Collapsed);
                (sectionsFolder as any).nodeType = "chapterFolder";
                sectionsFolder.resourceUri = bookUri;
                (sectionsFolder as any).chapterIndex = chapterIndex;
                (sectionsFolder as any).kind = "section";
                (sectionsFolder as any).bookIdent = bookIdent;

                return [slidesFolder, sectionsFolder];
            }

            if ((element as any).nodeType === "chapterFolder") {
                const bookUri = element.resourceUri!;
                const chapterIndex = (element as any).chapterIndex as number;
                const kind = (element as any).kind as "slide" | "section";

                const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
                if (!ws) return [];

                const raw = await vscode.workspace.fs.readFile(bookUri);
                const txt = Buffer.from(raw).toString("utf8");
                const data = JSON.parse(txt);

                const ch = (data.chapters ?? [])[chapterIndex];
                const parts = (ch?.sections ?? []) as any[]; // deine JSON enthält die idents/titles hier

                const folderName = kind === "slide" ? "slides" : "sections";

                return parts.map((p: any) => {
                    const title = p?.title ?? "Ohne Titel";
                    const ident = p?.ident as string;

                    const uri = vscode.Uri.joinPath(ws, "contents", folderName, `${ident}.md`);

                    const item = new vscode.TreeItem(title, vscode.TreeItemCollapsibleState.None);

                    item.resourceUri = uri; 
                    (item as any).nodeType = "tocLeaf"; 
                    (item as any).ident = ident;        
                    (item as any).kind = kind;          
                    (item as any).bookIdent = (element as any).bookIdent as string; 

                    item.iconPath = kind === "slide"
                        ? new vscode.ThemeIcon("screen-full")
                        : new vscode.ThemeIcon("note");
                    item.description = kind;
                    item.tooltip = ident;

                    item.command = {
                        command: "bookToc.openMarkdown",
                        title: "Open Markdown",
                        arguments: [uri],
                    };

                    return item;
                });
            }



            return [];
        },
    };

    vscode.window.registerTreeDataProvider("bookTocView", provider);

    const svgProvider: vscode.TreeDataProvider<vscode.TreeItem> = {
        getTreeItem: (element) => element,
        getChildren: async () => {
            const svgItem = new vscode.TreeItem("Open SVG Gallery", vscode.TreeItemCollapsibleState.None);
            svgItem.iconPath = new vscode.ThemeIcon("file-media");
            svgItem.command = {
                command: "50ohm.openSvgGallery",
                title: "Open SVG Gallery",
                arguments: []
            };

            const photoItem = new vscode.TreeItem("Open Photo Gallery", vscode.TreeItemCollapsibleState.None);
            photoItem.iconPath = new vscode.ThemeIcon("file-media");
            photoItem.command = {
                command: "50ohm.openPhotoGallery",
                title: "Open Photo Gallery",
                arguments: []
            };

            return [svgItem, photoItem];
        }
    };

    vscode.window.registerTreeDataProvider("svgGalleryView", svgProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand("50ohm.openSvgGallery", async () => {
            const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
            if (!ws) {
                vscode.window.showErrorMessage("No workspace folder open.");
                return;
            }

            // Ordner anpassen, falls bei dir anders:
            const svgFiles = await vscode.workspace.findFiles("contents/drawings/*.svg");

            // numerisch sortieren nach erster Zahl im Dateinamen
            const sorted = svgFiles
                .map((uri) => {
                    const base = uri.path.split("/").pop() ?? "";
                    const stem = base.replace(/\.svg$/i, "");
                    const m = stem.match(/\d+/);
                    const n = m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
                    return { uri, base, stem, n };
                })
                .sort((a, b) => (a.n - b.n) || a.base.localeCompare(b.base));

            const panel = vscode.window.createWebviewPanel(
                "50ohm.svgGallery",
                `SVG Gallery (${sorted.length})`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    enableCommandUris: true,
                    localResourceRoots: [ws] // erlaubt webview.asWebviewUri() für Dateien im Workspace
                }
            );

            // HTML bauen
            const cards = (await Promise.all(sorted.map(async (f) => {
                const src = panel.webview.asWebviewUri(f.uri);

                const openSvgCmd =
                    `command:50ohm.openSvgWhitePreview?${encodeURIComponent(JSON.stringify([f.uri.toString()]))}`;

                const texUri = f.uri.with({ path: f.uri.path.replace(/\.svg$/i, ".tex") });
                const txtUri = f.uri.with({ path: f.uri.path.replace(/\.svg$/i, ".txt") });

                const openTexCmd =
                    `command:50ohm.openUri?${encodeURIComponent(JSON.stringify([texUri.toString()]))}`;

                const openTxtCmd =
                    `command:50ohm.openUri?${encodeURIComponent(JSON.stringify([txtUri.toString()]))}`;

                // NEU: Alt-Text + TikZ in den Suchkey aufnehmen
                const altText = await readTextIfExists(txtUri, 8000);
                const tikz = await readTextIfExists(texUri, 20000);

                const searchKey = normalizeForSearch(`${f.stem} ${f.n} ${altText} ${tikz}`);

                return `
    <div class="card" title="${escapeHtml(f.base)}" data-key="${escapeHtml(searchKey)}">
      <a class="thumb" href="${openSvgCmd}">
        <img src="${src}" alt="${escapeHtml(f.stem)}" loading="lazy" />
      </a>
      <div class="label">
        <code>${escapeHtml(f.stem)}</code>
        <span class="sep">·</span>
        <a class="tex" href="${openTxtCmd}">Alt-Text</a>
        <span class="sep">·</span>
        <a class="tex" href="${openTexCmd}">TikZ</a>
      </div>
    </div>
  `;
            }))).join("\n");


            panel.webview.html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy"
      content="
        default-src 'none';
        img-src ${panel.webview.cspSource} data:;
        style-src 'unsafe-inline';
        script-src 'unsafe-inline';
      " />


  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
  body {
    margin: 0;
    padding: 16px;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
  }

  h1 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
  }

  /* -------- GRID -------- */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
  }
    .grid { display: grid; gap: 16px; }
@media (min-width: 1400px) { .grid { grid-template-columns: repeat(6, 1fr); } }
@media (min-width: 1100px) { .grid { grid-template-columns: repeat(5, 1fr); } }
@media (min-width: 800px)  { .grid { grid-template-columns: repeat(4, 1fr); } }
@media (max-width: 799px)  { .grid { grid-template-columns: repeat(2, 1fr); } }

  /* -------- CARD -------- */
  .card {
    display: block;
    border: 1px solid var(--vscode-editorWidget-border);
    background: var(--vscode-editorWidget-background);
    border-radius: 12px;
    text-decoration: none;
    overflow: hidden;
    box-shadow: 0 6px 18px rgba(0,0,0,0.15);
  }

  /* -------- SQUARE THUMB -------- */
  .thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1 / 1;
    background: white;
    padding: 12px;
    text-decoration: none;
  }


  .thumb img {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    display: block;
  }

  /* -------- LABEL -------- */
  .label {
    padding: 8px 10px;
    border-top: 1px solid var(--vscode-editorWidget-border);
    display: flex;
    gap: 8px;
    align-items: baseline;
    white-space: nowrap;
    overflow: hidden;
  }

  code {
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
  }

  .card:hover {
    outline: 2px solid var(--vscode-focusBorder);
    outline-offset: -2px;
  }

.sep { opacity: 0.6; }

.label code {
  overflow: hidden;
  text-overflow: ellipsis;
}

.label a.tex {
  color: var(--vscode-textLink-foreground);
  text-decoration: none;
  flex: 0 0 auto;
}

.label a.tex:hover {
  text-decoration: underline;
}

.topbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.title {
  font-size: 14px;
  font-weight: 600;
}

.search {
  flex: 1 1 320px;
  max-width: 520px;
  display: flex;
  gap: 8px;
  align-items: center;
  border: 1px solid var(--vscode-editorWidget-border);
  background: var(--vscode-editorWidget-background);
  border-radius: 10px;
  padding: 8px 10px;
}

.search input {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
  font-size: 13px;
}

.count {
  opacity: 0.75;
  font-size: 12px;
  white-space: nowrap;
}

.hidden { display: none; }
</style>

</head>
<body>
  <div class="topbar">
  <div class="title">SVGs in <code>contents/drawings</code></div>

  <div class="search">
      <span style="opacity:.7">🔎</span>
      <input id="q" type="text" placeholder="Search (e.g. 238 ...)" />
  </div>

  <div class="count"><span id="shown">${sorted.length}</span> / ${sorted.length}</div>
  </div>
  <hr>
  <h1>SVGs in <code>contents/drawings</code> — click to open</h1>
  <div class="grid">
    ${cards}
  </div>
  <script>
    const input = document.getElementById("q");
    const cards = Array.from(document.querySelectorAll(".card"));
    const shown = document.getElementById("shown");

    function apply() {
      const q = (input.value || "").trim().toLowerCase();
      let n = 0;

      for (const c of cards) {
        const key = c.getAttribute("data-key") || "";
        const ok = q === "" || key.includes(q);
        c.classList.toggle("hidden", !ok);
        if (ok) n++;
      }
      shown.textContent = String(n);
    }

    input.addEventListener("input", apply);

    window.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      } else if (e.key === "Escape" && document.activeElement === input) {
        input.value = "";
        apply();
        input.blur();
      }
    });
  </script>
</body>
</html>`;
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("50ohm.openSvgWhitePreview", async (uriString: string) => {
            const uri = vscode.Uri.parse(uriString);
            await vscode.commands.executeCommand("vscode.openWith", uri, "50ohm.svgWhitePreview");
        })
    );

    context.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider(
            { language: "markdown", scheme: "file" },
            new DarcdownLinkProvider()
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("50ohm.openRenderedHtml", async (arg?: any) => {
            await openRenderedHtmlCommand(arg);
        })
    );

    context.subscriptions.push(
    vscode.commands.registerCommand("50ohm.openRenderedHtmlVsCode", async (arg?: any) => {
        await openRenderedHtmlCommand(arg, true);
    })
);

}

/**
 * Custom Editor Provider für SVG mit weißem Hintergrund
 */
export class SvgWhitePreviewProvider
    implements vscode.CustomReadonlyEditorProvider {

    async openCustomDocument(
        uri: vscode.Uri
    ): Promise<vscode.CustomDocument> {
        return {
            uri,
            dispose: () => { }
        };
    }

    async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel
    ): Promise<void> {

        webviewPanel.webview.options = {
            enableScripts: false,
            enableCommandUris: true
        };

        // ---- 1) Initiales Rendern ----
        const render = async () => {
            const bytes = await vscode.workspace.fs.readFile(document.uri);
            const svgText = Buffer.from(bytes).toString("utf8");
            const altText = await this.loadAltTextForSvg(document.uri);

            const metadata = await this.loadMetadataIndex();
            const candidates = this.extractIdCandidatesFromFilename(document.uri);

            let metaHtml = `<div class="title">Metadata</div>`;

            if (!metadata) {
                metaHtml += `<p><i>metadata3b.json nicht gefunden (expected: ./contents/questions/metadata3b.json)</i></p>`;
                webviewPanel.webview.html = this.wrap(svgText, metaHtml);
                return;
            }

            const hits = this.findMatches(metadata, candidates);

            if (hits.length === 0) {
                metaHtml += `<p><i>Kein Treffer in metadata3b.json.</i></p>`;
            } else {
                metaHtml += `<div class="title">Treffer (${hits.length})</div><ul>`;
                for (const h of hits.slice(0, 50)) {
                    metaHtml += `<li><code>${h.questionCode}</code> – directus_id=<code>${h.directus_id}</code>, Felder: ${h.fields.map(f => `<code>${f}</code>`).join(" ")}</li>`;
                }
                metaHtml += `</ul>`;
                if (hits.length > 50) metaHtml += `<p><i>… weitere Treffer ausgeblendet</i></p>`;
            }

            const sectionHits = await this.findMarkdownFilesUsingPicture(
                "contents/sections/*.md",
                candidates
            );

            const slideHits = await this.findMarkdownFilesUsingPicture(
                "contents/slides/*.md",
                candidates
            );

            metaHtml += `<div class="title">Lehrtext-Sections</div>`;

            if (sectionHits.length === 0) {
                metaHtml += `<p><i>Keine Section gefunden, die dieses Bild referenziert.</i></p>`;
            } else {
                metaHtml += `<ul>`;
                for (const s of sectionHits) {
                    const cmd = `command:50ohm.openUri?${encodeURIComponent(JSON.stringify([s.uri.toString()]))}`;
                    metaHtml += `<li>
      <a href="${cmd}"><code>${escapeHtml(s.title)}</code></a>
      <span> (IDs: ${s.matchedIds.map(id => `<code>${id}</code>`).join(" ")})</span>
    </li>`;
                }
                metaHtml += `</ul>`;
            }

            metaHtml += `<div class="title">Folien</div>`;

            if (slideHits.length === 0) {
                metaHtml += `<p><i>Keine Folie gefunden, die dieses Bild referenziert.</i></p>`;
            } else {
                metaHtml += `<ul>`;
                for (const s of slideHits) {
                    const cmd = `command:50ohm.openUri?${encodeURIComponent(JSON.stringify([s.uri.toString()]))}`;
                    metaHtml += `<li>
      <a href="${cmd}"><code>${escapeHtml(s.title)}</code></a>
      <span> (IDs: ${s.matchedIds.map(id => `<code>${id}</code>`).join(" ")})</span>
    </li>`;
                }
                metaHtml += `</ul>`;
            }

            metaHtml += `<br><div class="title">Alternativ-Text</div>`;

            if (!altText) {
                metaHtml += `<p><i>Kein Alternativ-Text gefunden.</i></p>`;
            } else {
                metaHtml += `<pre class="alt">${escapeHtml(altText)}</pre>`;
            }

            const txtUri = document.uri.with({ path: document.uri.path.replace(/\.svg$/i, ".txt") });
            const openAltCmd = `command:50ohm.openUri?${encodeURIComponent(JSON.stringify([txtUri.toString()]))}`;

            const texUri = document.uri.with({ path: document.uri.path.replace(/\.svg$/i, ".tex") });
            const openTexCmd = `command:50ohm.openUri?${encodeURIComponent(JSON.stringify([texUri.toString()]))}`;


            metaHtml += `<p><a href="${openAltCmd}">Alt-Text</a> <span class="sep">·</span> `;
            metaHtml += `<a href="${openTexCmd}">Tikz</a></p>`;

            webviewPanel.webview.html = this.wrap(svgText, metaHtml);
        };

        await render();


        // ---- 2) Datei-Änderungen beobachten ----
        const watcher = vscode.workspace.createFileSystemWatcher(
            document.uri.fsPath
        );

        watcher.onDidChange(() => render());
        watcher.onDidCreate(() => render());
        watcher.onDidDelete(() => {
            webviewPanel.webview.html = `<html><body style="padding:16px">
      <b>SVG deleted</b>
    </body></html>`;
        });

        // ---- 3) Aufräumen, wenn Editor geschlossen wird ----
        webviewPanel.onDidDispose(() => {
            watcher.dispose();
        });
    }

    private wrap(svg: string, metaHtml: string): string {
        return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { width:100%; height:100%; margin:0; }
    body {
      display:flex;
      align-items:center;
      justify-content:center;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
    .stack {
      display:flex;
      flex-direction:column;
      gap:12px;
      align-items:center;
      max-width: 95vw;
      max-height: 95vh;
    }
    .page {
      background:white;
      padding:24px;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.15);
      max-width: 95vw;
      max-height: 75vh;
      overflow:auto;
    }
    svg { display:block; max-width:100%; max-height:100%; height:auto; width:auto; }

    .meta {
      width: min(900px, 95vw);
      border: 1px solid var(--vscode-editorWidget-border);
      background: var(--vscode-editorWidget-background);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.4;
    }
    .meta code {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .meta .title { font-weight: 600; margin-bottom: 6px; }
    .meta ul { margin: 6px 0 0 18px; padding: 0; }
    .meta a {
        color: var(--vscode-textLink-foreground);
        text-decoration: none;
    }
    .meta a:hover {
        text-decoration: underline;
    }
    pre.alt {
        margin: 8px 0 0 0;
        padding: 10px 12px;
        border: 1px solid var(--vscode-editorWidget-border);
        background: var(--vscode-textBlockQuote-background);
        border-radius: 8px;
        white-space: pre-wrap; /* Zeilen umbrechen */
        word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="stack">
    <div class="page">${svg}</div>
    <div class="meta">${metaHtml}</div>
  </div>
</body>
</html>`;
    }

    private async loadMetadataIndex(): Promise<Record<string, any> | null> {
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!ws) return null;

        const metaUri = vscode.Uri.joinPath(ws, "contents", "questions", "metadata3b.json");

        try {
            const raw = await vscode.workspace.fs.readFile(metaUri);
            const txt = Buffer.from(raw).toString("utf8");
            return JSON.parse(txt);
        } catch (e) {
            console.warn("[svgWhitePreview] metadata not found or invalid:", metaUri.fsPath, e);
            return null;
        }
    }

    private extractIdCandidatesFromFilename(uri: vscode.Uri): string[] {
        const name = uri.path.split("/").pop() ?? "";
        const stem = name.replace(/\.svg$/i, "");

        // Kandidaten: kompletter Stem + alle Zahlenfolgen
        const nums = Array.from(stem.matchAll(/\d+/g)).map(m => m[0]);
        const candidates = new Set<string>([stem, ...nums]);

        // häufig: metadata hat Numbers, aber JSON kann sie als number haben -> string reicht zum Vergleich
        return Array.from(candidates).filter(Boolean);
    }

    private findMatches(metadata: Record<string, any>, idCandidates: string[]) {
        const hits: Array<{
            questionCode: string;
            directus_id?: string;
            fields: string[];
        }> = [];

        const fieldsToCheck = ["picture_question", "picture_a", "picture_b", "picture_c", "picture_d"];

        for (const [questionCode, entry] of Object.entries(metadata)) {
            const fields: string[] = [];

            for (const f of fieldsToCheck) {
                const v = (entry as any)[f];
                if (v === "" || v === null || v === undefined) continue;

                const vs = String(v);
                if (idCandidates.includes(vs)) fields.push(`${f}=${vs}`);
            }

            if (fields.length > 0) {
                hits.push({
                    questionCode,
                    directus_id: String((entry as any).directus_id ?? ""),
                    fields
                });
            }
        }

        return hits;
    }

    private async findMarkdownFilesUsingPicture(glob: string, idCandidates: string[]) {
        const files = await vscode.workspace.findFiles(glob);

        const hits: Array<{ uri: vscode.Uri; title: string; matchedIds: string[] }> = [];
        const pictureRe = /\[picture:(\d+):/g;

        for (const uri of files) {
            const raw = await vscode.workspace.fs.readFile(uri);
            const txt = Buffer.from(raw).toString("utf8");

            const mTitle = txt.match(/^#\s+(.+)$/m);
            const title = mTitle?.[1]?.trim() ?? (uri.path.split("/").pop() ?? "md");

            const found = new Set<string>();
            for (const m of txt.matchAll(pictureRe)) found.add(m[1]);

            const matchedIds = idCandidates.filter(id => found.has(id));
            if (matchedIds.length > 0) hits.push({ uri, title, matchedIds });
        }

        hits.sort((a, b) => a.title.localeCompare(b.title));
        return hits;
    }

    private async loadAltTextForSvg(svgUri: vscode.Uri): Promise<string | null> {
        const txtUri = svgUri.with({ path: svgUri.path.replace(/\.svg$/i, ".txt") });

        try {
            const raw = await vscode.workspace.fs.readFile(txtUri);
            const txt = Buffer.from(raw).toString("utf8").trim();
            return txt.length ? txt : null;
        } catch {
            return null; // Datei nicht vorhanden
        }
    }

}

export class PngWhitePreviewProvider implements vscode.CustomReadonlyEditorProvider {

    async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
        return { uri, dispose: () => { } };
    }

    async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel
    ): Promise<void> {

        const ws = vscode.workspace.workspaceFolders?.[0]?.uri;

        webviewPanel.webview.options = {
            enableScripts: false,
            enableCommandUris: true,
            localResourceRoots: ws ? [ws] : undefined
        };

        const render = async () => {
            const imgSrc = webviewPanel.webview.asWebviewUri(document.uri);
            const candidates = this.extractIdCandidatesFromFilename(document.uri); // 123.png -> ["123", ...]
            const altText = await this.loadAltTextForPng(document.uri);

            const sectionHits = await this.findMarkdownFilesUsingPicture(
                "contents/sections/*.md",
                candidates
            );

            const slideHits = await this.findMarkdownFilesUsingPicture(
                "contents/slides/*.md",
                candidates
            );

            // Meta HTML bauen
            let metaHtml = `<div class="title">Verwendung</div>`;

            metaHtml += `<div class="title">Lehrtext-Sections</div>`;
            metaHtml += this.renderHitsList(sectionHits);

            metaHtml += `<div class="title">Folien</div>`;
            metaHtml += this.renderHitsList(slideHits);

            metaHtml += `<div class="title">Alternativ-Text</div>`;
            if (!altText) {
                metaHtml += `<p><i>Kein Alternativ-Text gefunden.</i></p>`;
            } else {
                metaHtml += `<pre class="alt">${this.escapeHtml(altText)}</pre>`;
            }

            const txtUri = document.uri.with({ path: document.uri.path.replace(/\.png$/i, ".txt") });
            const openAltCmd = `command:50ohm.openUri?${encodeURIComponent(JSON.stringify([txtUri.toString()]))}`;
            metaHtml += `<p><a href="${openAltCmd}">Alt-Text-Datei öffnen</a></p>`;

            webviewPanel.webview.html = this.wrap(imgSrc.toString(), metaHtml);
        };

        await render();

        // watcher: PNG + TXT (damit Alt-Text Updates sofort sichtbar sind)
        const watcherPng = vscode.workspace.createFileSystemWatcher(document.uri.fsPath);
        const txtPath = document.uri.fsPath.replace(/\.png$/i, ".txt");
        const watcherTxt = vscode.workspace.createFileSystemWatcher(txtPath);

        watcherPng.onDidChange(() => render());
        watcherTxt.onDidChange(() => render());

        webviewPanel.onDidDispose(() => {
            watcherPng.dispose();
            watcherTxt.dispose();
        });
    }

    // ---------- Rendering helpers ----------

    private wrap(imgUrl: string, metaHtml: string): string {
        // CSP: wir nutzen nur img+style inline, scripts sind aus
        return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src https: data: ${'${'}webview.cspSource${'}'}; style-src 'unsafe-inline';" />
  <style>
    html, body { width:100%; height:100%; margin:0; }
    body {
      display:flex;
      align-items:center;
      justify-content:center;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
    }
    .stack {
      display:flex;
      flex-direction:column;
      gap:12px;
      align-items:center;
      max-width: 95vw;
      max-height: 95vh;
    }
    .page {
      background:white;
      padding:24px;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.15);
      max-width: 95vw;
      max-height: 75vh;
      overflow:auto;
      display:flex;
      align-items:center;
      justify-content:center;
    }
    .page img {
      display:block;
      max-width: 100%;
      max-height: 100%;
      height: auto;
      width: auto;
    }

    .meta {
      width: min(900px, 95vw);
      border: 1px solid var(--vscode-editorWidget-border);
      background: var(--vscode-editorWidget-background);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12px;
      line-height: 1.4;
    }
    .meta .title { font-weight: 600; margin: 10px 0 6px 0; }
    .meta ul { margin: 6px 0 0 18px; padding: 0; }
    .meta a { color: var(--vscode-textLink-foreground); text-decoration: none; }
    .meta a:hover { text-decoration: underline; }
    pre.alt {
      margin: 8px 0 0 0;
      padding: 10px 12px;
      border: 1px solid var(--vscode-editorWidget-border);
      background: var(--vscode-textBlockQuote-background);
      border-radius: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <div class="stack">
    <div class="page"><img src="${imgUrl}" alt="image"/></div>
    <div class="meta">${metaHtml}</div>
  </div>
</body>
</html>`;
    }

    private renderHitsList(hits: Array<{ uri: vscode.Uri; title: string; matchedIds: string[] }>): string {
        if (!hits.length) return `<p><i>Keine Treffer.</i></p>`;

        let html = `<ul>`;
        for (const h of hits) {
            const cmd = `command:50ohm.openUri?${encodeURIComponent(JSON.stringify([h.uri.toString()]))}`;
            html += `<li>
        <a href="${cmd}"><code>${this.escapeHtml(h.title)}</code></a>
        <span> (IDs: ${h.matchedIds.map(id => `<code>${id}</code>`).join(" ")})</span>
      </li>`;
        }
        html += `</ul>`;
        return html;
    }

    // ---------- Data helpers ----------

    private extractIdCandidatesFromFilename(uri: vscode.Uri): string[] {
        const name = uri.path.split("/").pop() ?? "";
        const stem = name.replace(/\.png$/i, "");
        const nums = Array.from(stem.matchAll(/\d+/g)).map(m => m[0]);
        const candidates = new Set<string>([stem, ...nums]);
        return Array.from(candidates).filter(Boolean);
    }

    private async findMarkdownFilesUsingPicture(glob: string, idCandidates: string[]) {
        const files = await vscode.workspace.findFiles(glob);
        const hits: Array<{ uri: vscode.Uri; title: string; matchedIds: string[] }> = [];
        const pictureRe = /\[photo:(\d+):/g;

        for (const uri of files) {
            const raw = await vscode.workspace.fs.readFile(uri);
            const txt = Buffer.from(raw).toString("utf8");

            const mTitle = txt.match(/^#\s+(.+)$/m);
            const title = mTitle?.[1]?.trim() ?? (uri.path.split("/").pop() ?? "md");

            const found = new Set<string>();
            for (const m of txt.matchAll(pictureRe)) found.add(m[1]);

            const matchedIds = idCandidates.filter(id => found.has(id));
            if (matchedIds.length > 0) hits.push({ uri, title, matchedIds });
        }

        hits.sort((a, b) => a.title.localeCompare(b.title));
        return hits;
    }

    private async loadAltTextForPng(pngUri: vscode.Uri): Promise<string | null> {
        const txtUri = pngUri.with({ path: pngUri.path.replace(/\.png$/i, ".txt") });
        try {
            const raw = await vscode.workspace.fs.readFile(txtUri);
            const txt = Buffer.from(raw).toString("utf8").trim();
            return txt.length ? txt : null;
        } catch {
            return null;
        }
    }

    private escapeHtml(s: string): string {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}

class DarcdownLinkProvider implements vscode.DocumentLinkProvider {
    provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        const links: vscode.DocumentLink[] = [];

        const re = /\[(picture|photo):(\d+):[^\]]*\]/g;

        for (let lineNo = 0; lineNo < document.lineCount; lineNo++) {
            const line = document.lineAt(lineNo).text;
            let m: RegExpExecArray | null;

            while ((m = re.exec(line)) !== null) {
                const kind = m[1];       // picture | photo
                const id = m[2];         // 123
                const matchStart = m.index;

                // Range nur über die Zahl (damit wirklich "die Nummer" klickbar ist)
                const idStartInMatch = m[0].indexOf(id);
                const startChar = matchStart + idStartInMatch;
                const endChar = startChar + id.length;

                const range = new vscode.Range(
                    new vscode.Position(lineNo, startChar),
                    new vscode.Position(lineNo, endChar)
                );

                const cmd =
                    kind === "picture"
                        ? `command:50ohm.openSvgWhitePreview?${encodeURIComponent(JSON.stringify([this.buildUriString(document, kind, id)]))}`
                        : `command:50ohm.openPngWhitePreview?${encodeURIComponent(JSON.stringify([this.buildUriString(document, kind, id)]))}`;

                links.push(new vscode.DocumentLink(range, vscode.Uri.parse(cmd)));
            }
        }

        return links;
    }

    private buildUriString(document: vscode.TextDocument, kind: string, id: string): string {
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!ws) return document.uri.toString(); // fallback

        const fileUri =
            kind === "picture"
                ? vscode.Uri.joinPath(ws, "contents", "drawings", `${id}.svg`)
                : vscode.Uri.joinPath(ws, "contents", "photos", `${id}.png`);

        return fileUri.toString();
    }
}

// This method is called when your extension is deactivated
export function deactivate() { }

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function readTextIfExists(uri: vscode.Uri, maxChars = 20000): Promise<string> {
    try {
        const raw = await vscode.workspace.fs.readFile(uri);
        const txt = Buffer.from(raw).toString("utf8");
        return txt.length > maxChars ? txt.slice(0, maxChars) : txt;
    } catch {
        return "";
    }
}

function normalizeForSearch(s: string): string {
    // Lowercase + bisschen Whitespace glätten
    return (s || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function getBuildRepoPath(): string {
    const cfg = vscode.workspace.getConfiguration("50ohm");
    const p = String(cfg.get("buildRepoPath", "") || "").trim();
    return p;
}

async function openRenderedHtmlCommand(arg?: any, openInVsCode = false) {

    const config = vscode.workspace.getConfiguration("50ohm");

    const buildRepoPath = config.get<string>("buildRepoPath");
    if (!buildRepoPath) {
        vscode.window.showErrorMessage("50ohm.buildRepoPath not set in settings.");
        return;
    }

    // DAS ist jetzt dein fixer Buch-Ident aus Settings (z.B. "NEA")
    const defaultBookIdent = config.get<string>("defaultBookIdent");
    if (!defaultBookIdent) {
        vscode.window.showErrorMessage("50ohm.defaultBookIdent not set in settings (e.g. 'NEA').");
        return;
    }

    // -------- resolve mdUri from different arg shapes --------
    const mdUri = resolveUriFromArg(arg);
    if (!mdUri) {
        vscode.window.showErrorMessage("Could not resolve file URI from context menu.");
        return;
    }

    // ident = foo aus foo.md
    const filename = mdUri.path.split("/").pop() ?? "";
    const ident = filename.replace(/\.md$/i, "");
    if (!ident) {
        vscode.window.showErrorMessage("Could not resolve ident from file name.");
        return;
    }

    // TOC kann bookIdent am TreeItem mitgeben, Explorer nimmt defaultBookIdent
    const bookIdent = (arg && arg.bookIdent) ? String(arg.bookIdent) : defaultBookIdent;

    const path = require("path");
    const htmlPath = path.join(buildRepoPath, "build", `${bookIdent}_${ident}.html`);
    const htmlUri = vscode.Uri.file(htmlPath);

    try {
        await vscode.workspace.fs.stat(htmlUri);
    } catch {
        vscode.window.showErrorMessage(`HTML not found: ${htmlPath}`);
        return;
    }

    if (openInVsCode) {
        await openRenderedHtmlInWebview(htmlPath, `Rendered HTML: ${ident}`);
        return;
    }

    await vscode.env.openExternal(vscode.Uri.file(htmlPath));
}

// Accepts: vscode.Uri | {resourceUri} | {uri} | {fsPath} | [uri]
function resolveUriFromArg(arg: any): vscode.Uri | undefined {
    if (!arg) return undefined;

    if (arg instanceof vscode.Uri) return arg;

    if (Array.isArray(arg) && arg[0] instanceof vscode.Uri) return arg[0];

    if (arg.resourceUri instanceof vscode.Uri) return arg.resourceUri;
    if (arg.uri instanceof vscode.Uri) return arg.uri;

    if (typeof arg.fsPath === "string") return vscode.Uri.file(arg.fsPath);

    return undefined;
}



function extractUriFromCommandArg(arg: any): vscode.Uri | null {
    if (!arg) { return null; }

    if (arg instanceof vscode.Uri) { return arg; }
    if (typeof arg === "object" && arg.resourceUri instanceof vscode.Uri) { return arg.resourceUri; }
    if (typeof arg === "object" && arg.uri instanceof vscode.Uri) { return arg.uri; }

    return null;
}

async function openRenderedHtmlInWebview(htmlPath: string, title: string) {
    const htmlUri = vscode.Uri.file(htmlPath);

    // Wichtig: base/localResourceRoots sollen auf den BUILD-root zeigen,
    // nicht nur auf den Ordner der HTML-Datei (damit assets überall funktionieren)
    // -> wenn du schon einen buildRoot hast, nimm den hier statt dirname(htmlPath)
    const buildRootUri = vscode.Uri.file(path.dirname(htmlPath));

    if (!renderedHtmlPanel) {
        renderedHtmlPanel = vscode.window.createWebviewPanel(
            "50ohm.renderedHtml",
            title,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [buildRootUri],
                retainContextWhenHidden: true, // optional: fühlt sich "browseriger" an
            }
        );

        renderedHtmlPanel.onDidDispose(() => {
            renderedHtmlPanel = undefined;
        });
    } else {
        // Panel existiert -> nur nach vorne holen
        renderedHtmlPanel.reveal(vscode.ViewColumn.Beside, true);
        renderedHtmlPanel.title = title;

        // localResourceRoots kann man NICHT nachträglich ändern.
        // Wenn dein HTML Assets außerhalb von buildRoot braucht: Root größer wählen (z.B. .../build).
    }

    const webview = renderedHtmlPanel.webview;

    // HTML laden
    const raw = await vscode.workspace.fs.readFile(htmlUri);
    let html = Buffer.from(raw).toString("utf8");

    // base href (relative assets)
    const baseHref = webview.asWebviewUri(buildRootUri).toString() + "/";

    if (!/<base\b/i.test(html)) {
        if (/<head\b[^>]*>/i.test(html)) {
            html = html.replace(/<head\b[^>]*>/i, (m) => `${m}\n<base href="${baseHref}">`);
        } else {
            html = `<head><base href="${baseHref}"></head>\n` + html;
        }
    }

    // CSP (damit CSS/JS/Images funktionieren)
    const csp = `
<meta http-equiv="Content-Security-Policy"
content="
  default-src 'none';
  img-src ${webview.cspSource} data: https:;
  style-src ${webview.cspSource} 'unsafe-inline' https:;
  script-src ${webview.cspSource} 'unsafe-inline' https:;
  font-src ${webview.cspSource} data: https:;
">
`.trim();

    if (/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i.test(html)) {
        html = html.replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i, csp);
    } else if (/<head\b[^>]*>/i.test(html)) {
        html = html.replace(/<head\b[^>]*>/i, (m) => `${m}\n${csp}`);
    }

    webview.html = html;
}