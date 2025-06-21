// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

function getQuarkdownPath(): string {
    // For simplicity, assume quarkdown is in PATH.
    // In a real extension, you might allow users to configure the path.
    return 'quarkdown';
}

async function executeQuarkdownCommand(command: string, filePath: string, outputDir?: string) {
    const quarkdownPath = getQuarkdownPath();
    let fullCommand = `${quarkdownPath} c ${command} "${filePath}"`;

    if (outputDir) {
        // Ensure the output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        fullCommand = `${quarkdownPath} c ${command} -o "${outputDir}" "${filePath}"`;
    }

    const terminal = vscode.window.createTerminal(`Quarkdown: ${path.basename(filePath)}`);
    terminal.show();
    terminal.sendText(fullCommand);
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Quarkdown Slides extension is now active!');

    let previewDisposable = vscode.commands.registerCommand('quarkdown-slides.preview', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'quarkdown') {
            vscode.window.showWarningMessage('Please open a Quarkdown (.qmd) file to preview.');
            return;
        }

        const filePath = editor.document.fileName;
        const fileDir = path.dirname(filePath);
        const outputDir = path.join(fileDir, 'output');
        const fileNameWithoutExt = path.basename(filePath, '.qmd');
        const specificOutputDir = path.join(outputDir, `Quarkdown-${fileNameWithoutExt}`);
        const htmlFilePath = path.join(specificOutputDir, 'index.html');

        // Execute quarkdown to generate HTML
        await executeQuarkdownCommand('', filePath, outputDir); // Quarkdown will create specificOutputDir
        vscode.window.showInformationMessage(`Generated HTML to ${htmlFilePath}`);

        // Open the generated HTML file in a webview
        const panel = vscode.window.createWebviewPanel(
            'quarkdownPreview', // Identifies the type of the webview. Used internally
            'Quarkdown Preview', // Title of the panel displayed to the user
            vscode.ViewColumn.Beside, // Editor column to show the new webview panel in.
            {
                enableScripts: true, // Enable scripts in the webview
                localResourceRoots: [vscode.Uri.file(specificOutputDir)] // Allow access to resources in the output directory
            }
        );

        // Read the HTML content
        let htmlContent = fs.readFileSync(htmlFilePath, 'utf8');

        // Convert local resource paths to webview URIs
        // This is a simplified approach. A more robust solution might involve parsing the HTML
        // and replacing all src/href attributes. For now, assume resources are relative to index.html.
        htmlContent = htmlContent.replace(/(src|href)="(?!https?:\/\/)([^"]*)"/g, (match, attr, resPath) => {
            const resourceUri = vscode.Uri.file(path.resolve(specificOutputDir, resPath));
            return `${attr}="${panel.webview.asWebviewUri(resourceUri)}"`;
        });

        panel.webview.html = htmlContent;
    });

    let exportHtmlDisposable = vscode.commands.registerCommand('quarkdown-slides.exportHtml', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'quarkdown') {
            vscode.window.showWarningMessage('Please open a Quarkdown (.qmd) file to export to HTML.');
            return;
        }

        const filePath = editor.document.fileName;
        const fileDir = path.dirname(filePath);
        const outputDir = path.join(fileDir, 'output'); // Default output directory

        await executeQuarkdownCommand('', filePath, outputDir); // Just compile to HTML
        vscode.window.showInformationMessage(`Exported HTML to ${outputDir}`);
    });

    let exportPdfDisposable = vscode.commands.registerCommand('quarkdown-slides.exportPdf', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'quarkdown') {
            vscode.window.showWarningMessage('Please open a Quarkdown (.qmd) file to export to PDF.');
            return;
        }

        const filePath = editor.document.fileName;
        const fileDir = path.dirname(filePath);
        const outputDir = path.join(fileDir, 'output'); // Default output directory

        await executeQuarkdownCommand('--pdf', filePath, outputDir);
        vscode.window.showInformationMessage(`Exported PDF to ${outputDir}`);
    });

    context.subscriptions.push(previewDisposable, exportHtmlDisposable, exportPdfDisposable);
}

export function deactivate() {}
