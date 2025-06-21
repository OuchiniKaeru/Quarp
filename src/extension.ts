// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';

function getQuarkdownPath(): string {
    // For simplicity, assume quarkdown is in PATH.
    // In a real extension, you might allow users to configure the path.
    return 'quarkdown';
}

async function executeQuarkdownCommand(command: string, filePath: string, outputDir?: string): Promise<void> {
    const quarkdownPath = getQuarkdownPath();
    filePath = path.resolve(filePath); // Normalize the file path
    let fullCommand = `${quarkdownPath} c ${command} "${filePath}"`;

    if (outputDir) {
        // Ensure the output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        outputDir = path.resolve(outputDir); // Normalize the output directory
        fullCommand = `${quarkdownPath} c ${command} -o "${outputDir}" "${filePath}"`;
    }

    return new Promise((resolve, reject) => {
        exec(fullCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                vscode.window.showErrorMessage(`Quarkdown command failed: ${error.message}\n${stderr}`);
                return reject(error);
            }
            if (stderr) {
                console.warn(`Quarkdown stderr: ${stderr}`);
            }
            console.log(`Quarkdown stdout: ${stdout}`);
            resolve();
        });
    });
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Quarkdown Slides extension is now active!');

    let previewDisposable = vscode.commands.registerCommand('quarkdown-slides.preview', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'quarkdown') {
            vscode.window.showWarningMessage('Please open a Quarkdown (.qmd) file to preview.');
            return;
        }

        if (editor.document.isUntitled) {
            vscode.window.showWarningMessage('Please save the Quarkdown file before previewing.');
            return;
        }

        const filePath = editor.document.fileName;
        const fileDir = path.dirname(filePath);
        const outputBaseDir = path.join(fileDir, 'output'); // output ディレクトリのベースパス
        const resolvedOutputBaseDir = path.resolve(outputBaseDir); // Normalize the output base directory

        // Ensure the output base directory exists
        if (!fs.existsSync(outputBaseDir)) {
            fs.mkdirSync(outputBaseDir, { recursive: true });
        }

        // Determine the expected output folder name based on .docname or default
        let expectedOutputFolderName = 'Untitled-Quarkdown-Document'; // Default if .docname not found
        const documentText = editor.document.getText();
        const docnameMatch = documentText.match(/^\.docname\s*\{\s*([^}]+)\s*\}/m);
        if (docnameMatch && docnameMatch[1]) {
            expectedOutputFolderName = docnameMatch[1].replace(/\s/g, '-'); // Replace spaces with hyphens
        }

        const specificOutputDir = path.join(resolvedOutputBaseDir, expectedOutputFolderName);
        const htmlFilePath = path.join(specificOutputDir, 'index.html');

        // Execute quarkdown to generate HTML
        await executeQuarkdownCommand('', filePath, resolvedOutputBaseDir); // Pass the base output directory

        if (!fs.existsSync(htmlFilePath)) {
            vscode.window.showErrorMessage(`Generated HTML file not found at ${htmlFilePath}.`);
            return;
        }

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
        const outputBaseDir = path.join(fileDir, 'output'); // Base output directory
        const resolvedOutputBaseDir = path.resolve(outputBaseDir); // Normalize the output base directory

        // Ensure the output base directory exists
        if (!fs.existsSync(outputBaseDir)) {
            fs.mkdirSync(outputBaseDir, { recursive: true });
        }

        // Determine the expected output folder name based on .docname or default
        let expectedOutputFolderName = 'Untitled-Quarkdown-Document'; // Default if .docname not found
        const documentText = editor.document.getText();
        const docnameMatch = documentText.match(/^\.docname\s*\{\s*([^}]+)\s*\}/m);
        if (docnameMatch && docnameMatch[1]) {
            expectedOutputFolderName = docnameMatch[1].replace(/\s/g, '-'); // Replace spaces with hyphens
        }

        const specificOutputDir = path.join(resolvedOutputBaseDir, expectedOutputFolderName);
        const htmlFilePath = path.join(specificOutputDir, 'index.html');

        await executeQuarkdownCommand('', filePath, resolvedOutputBaseDir); // Compile to HTML

        if (fs.existsSync(htmlFilePath)) {
            vscode.window.showInformationMessage(`Exported HTML to ${specificOutputDir}`);
        } else {
            vscode.window.showErrorMessage(`Could not find the exported HTML file at ${htmlFilePath}.`);
        }
    });

    let exportPdfDisposable = vscode.commands.registerCommand('quarkdown-slides.exportPdf', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'quarkdown') {
            vscode.window.showWarningMessage('Please open a Quarkdown (.qmd) file to export to PDF.');
            return;
        }

        const filePath = editor.document.fileName;
        const fileDir = path.dirname(filePath);
        const outputBaseDir = path.join(fileDir, 'output'); // Base output directory

        // Ensure the output base directory exists
        if (!fs.existsSync(outputBaseDir)) {
            fs.mkdirSync(outputBaseDir, { recursive: true });
        }

        // Determine the expected output folder name based on .docname or default
        let expectedOutputFolderName = 'Untitled-Quarkdown-Document'; // Default if .docname not found
        const documentText = editor.document.getText();
        const docnameMatch = documentText.match(/^\.docname\s*\{\s*([^}]+)\s*\}/m);
        if (docnameMatch && docnameMatch[1]) {
            expectedOutputFolderName = docnameMatch[1].replace(/\s/g, '-'); // Replace spaces with hyphens
        }

        const specificOutputDir = path.join(outputBaseDir, expectedOutputFolderName);
        const pdfFilePath = path.join(specificOutputDir, 'index.pdf'); // Assuming PDF export creates index.pdf

        await executeQuarkdownCommand('--pdf', filePath, outputBaseDir); // Compile to PDF

        if (fs.existsSync(pdfFilePath)) {
            vscode.window.showInformationMessage(`Exported PDF to ${specificOutputDir}`);
        } else {
            vscode.window.showErrorMessage(`Could not find the exported PDF file at ${pdfFilePath}.`);
        }
    });

    context.subscriptions.push(previewDisposable, exportHtmlDisposable, exportPdfDisposable);
}

export function deactivate() {}
