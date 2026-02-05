// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

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
                    item.iconPath = new vscode.ThemeIcon("book")
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

                    const item = new vscode.TreeItem(title, vscode.TreeItemCollapsibleState.Collapsed);
                    item.resourceUri = bookUri;              // weiterhin das Buch-JSON
                    (item as any).nodeType = "chapter";
                    (item as any).chapterIndex = idx;        // welcher Chapter im JSON
                    return item;
                });
            }

            // 3) Kapitel aufgeklappt -> Sections/Slides
            if ((element as any).nodeType === "chapter") {
                const bookUri = element.resourceUri!;
                const chapterIndex = (element as any).chapterIndex as number;

                const slidesFolder = new vscode.TreeItem("Slides", vscode.TreeItemCollapsibleState.Collapsed);
                (slidesFolder as any).nodeType = "chapterFolder";
                slidesFolder.resourceUri = bookUri;
                (slidesFolder as any).chapterIndex = chapterIndex;
                (slidesFolder as any).kind = "slide";

                const sectionsFolder = new vscode.TreeItem("Sections", vscode.TreeItemCollapsibleState.Collapsed);
                (sectionsFolder as any).nodeType = "chapterFolder";
                sectionsFolder.resourceUri = bookUri;
                (sectionsFolder as any).chapterIndex = chapterIndex;
                (sectionsFolder as any).kind = "section";

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
            const item = new vscode.TreeItem(
                "Open SVG Gallery",
                vscode.TreeItemCollapsibleState.None
            );
            item.iconPath = new vscode.ThemeIcon("file-media");
            item.command = {
                command: "50ohm.openSvgGallery",
                title: "Open SVG Gallery",
                arguments: []
            };
            return [item];
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
            const cards = sorted.map((f) => {
                const src = panel.webview.asWebviewUri(f.uri);
                const openSvgCmd =
                    `command:50ohm.openSvgWhitePreview?${encodeURIComponent(JSON.stringify([f.uri.toString()]))}`;

                const texUri = f.uri.with({ path: f.uri.path.replace(/\.svg$/i, ".tex") });
                const openTexCmd =
                    `command:50ohm.openUri?${encodeURIComponent(JSON.stringify([texUri.toString()]))}`;

                const txtUri = f.uri.with({ path: f.uri.path.replace(/\.svg$/i, ".txt") });
                const openTxtCmd =
                    `command:50ohm.openUri?${encodeURIComponent(JSON.stringify([txtUri.toString()]))}`;


                return `
  <div class="card" title="${escapeHtml(f.base)}" data-key="${escapeHtml((f.stem + " " + f.n).toLowerCase())}">
    <a class="thumb" href="${openSvgCmd}">
      <img src="${src}" alt="${escapeHtml(f.stem)}" loading="lazy" />
    </a>
    <div class="label">
      <code>${escapeHtml(f.stem)}</code>
      <span class="sep">·</span>
      <a class="tex" href="${openTexCmd}">TikZ (.tex)</a> <span class="sep">·</span> 
      <a class="tex" href="${openTxtCmd}">Alt-Text (.txt)</a>
    </div>
  </div>
`;
            }).join("\n");

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

    // mini helper irgendwo im file (außerhalb activate) hinzufügen:
    function escapeHtml(s: string): string {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    context.subscriptions.push(
        vscode.commands.registerCommand("50ohm.openSvgWhitePreview", async (uriString: string) => {
            const uri = vscode.Uri.parse(uriString);
            await vscode.commands.executeCommand("vscode.openWith", uri, "50ohm.svgWhitePreview");
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
      <a href="${cmd}"><code>${this.escapeHtml(s.title)}</code></a>
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
      <a href="${cmd}"><code>${this.escapeHtml(s.title)}</code></a>
      <span> (IDs: ${s.matchedIds.map(id => `<code>${id}</code>`).join(" ")})</span>
    </li>`;
                }
                metaHtml += `</ul>`;
            }

            metaHtml += `<br><div class="title">Alternativ-Text</div>`;

            if (!altText) {
                metaHtml += `<p><i>Kein Alternativ-Text gefunden.</i></p>`;
            } else {
                metaHtml += `<pre class="alt">${this.escapeHtml(altText)}</pre>`;
            }

            const txtUri = document.uri.with({ path: document.uri.path.replace(/\.svg$/i, ".txt") });
            const openAltCmd = `command:50ohm.openUri?${encodeURIComponent(JSON.stringify([txtUri.toString()]))}`;

            const texUri = document.uri.with({ path: document.uri.path.replace(/\.svg$/i, ".tex") });
            const openTexCmd = `command:50ohm.openUri?${encodeURIComponent(JSON.stringify([texUri.toString()]))}`;

            
            metaHtml += `<p><a href="${openAltCmd}">Alt-Text</a> <span class="sep">·</span> `;
            metaHtml += `<a href="${openAltCmd}">Tikz</a></p>`;

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

    private escapeHtml(s: string): string {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

// This method is called when your extension is deactivated
export function deactivate() { }
