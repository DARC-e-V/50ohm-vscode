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


    vscode.window.registerTreeDataProvider("bookTocView", provider);


    vscode.window.registerTreeDataProvider("bookTocView", provider);
}

// This method is called when your extension is deactivated
export function deactivate() { }
