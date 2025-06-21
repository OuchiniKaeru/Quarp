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
    // Always resolve filePath to an absolute path before passing to external command
    const resolvedFilePath = path.resolve(filePath);
    let fullCommand = `${quarkdownPath} c ${command} "${resolvedFilePath}"`;

    if (outputDir) {
        // Ensure the output directory exists using the original outputDir
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        // Always resolve outputDir to an absolute path before passing to external command
        const resolvedOutputDir = path.resolve(outputDir);
        fullCommand = `${quarkdownPath} c ${command} -o "${resolvedOutputDir}" "${resolvedFilePath}"`;
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

// Helper to get UNC path for a drive letter
async function getUncPathForDrive(driveLetter: string): Promise<string | null> {
    return new Promise((resolve) => {
        exec('wmic path win32_mappedlogicaldisk get DeviceID,ProviderName /format:list', (error, stdout, stderr) => {
            if (error) {
                console.warn(`Error getting mapped drives: ${error.message}`);
                return resolve(null);
            }
            const lines = stdout.split('\n');
            for (const line of lines) {
                const deviceIdMatch = line.match(/DeviceID=([A-Z]:)/i);
                const providerNameMatch = line.match(/ProviderName=(.*)/);
                if (deviceIdMatch && providerNameMatch && deviceIdMatch[1].toUpperCase() === driveLetter.toUpperCase()) {
                    const providerName = providerNameMatch[1].trim();
                    return resolve(providerName);
                }
            }
            resolve(null);
        });
    });
}

// Helper function to get potential paths for files expected in a subfolder (e.g., HTML)
async function getPotentialSubfolderPaths(baseDir: string, subfolderName: string, fileName: string): Promise<string[]> {
    const paths: string[] = [];
    
    // Ensure baseDir is resolved to an absolute path first
    const resolvedBaseDir = path.resolve(baseDir);

    // 1. Add the path based on the resolved base directory
    const specificOutputDirFromResolvedBase = path.join(resolvedBaseDir, subfolderName);
    paths.push(path.resolve(path.join(specificOutputDirFromResolvedBase, fileName)));

    // 2. If the resolved base directory starts with a drive letter, try to get the UNC path
    const driveLetterMatch = resolvedBaseDir.match(/^([a-zA-Z]):\\/);
    if (driveLetterMatch) {
        const driveLetter = driveLetterMatch[1];
        const uncBaseOfDrive = await getUncPathForDrive(`${driveLetter}:`);
        if (uncBaseOfDrive) {
            // Calculate the relative path from the drive root
            const relativePathFromDriveRoot = resolvedBaseDir.substring(driveLetter.length + 2); // e.g., "Z:\path" -> "path"
            const uncBaseDir = path.join(uncBaseOfDrive, relativePathFromDriveRoot);
            const uncSpecificOutputDir = path.join(uncBaseDir, subfolderName);
            paths.push(path.resolve(path.join(uncSpecificOutputDir, fileName)));
        }
    }
    
    return paths;
}

// Helper function to get potential paths for files expected directly in the base directory (e.g., PDF)
async function getPotentialDirectPaths(baseDir: string, fileName: string): Promise<string[]> {
    const paths: string[] = [];
    
    // Ensure baseDir is resolved to an absolute path first
    const resolvedBaseDir = path.resolve(baseDir);

    // 1. Add the path based on the resolved base directory
    paths.push(path.resolve(path.join(resolvedBaseDir, fileName)));

    // 2. If the resolved base directory starts with a drive letter, try to get the UNC path
    const driveLetterMatch = resolvedBaseDir.match(/^([a-zA-Z]):\\/);
    if (driveLetterMatch) {
        const driveLetter = driveLetterMatch[1];
        const uncBaseOfDrive = await getUncPathForDrive(`${driveLetter}:`);
        if (uncBaseOfDrive) {
            const relativePathFromDriveRoot = resolvedBaseDir.substring(driveLetter.length + 2);
            const uncBaseDir = path.join(uncBaseOfDrive, relativePathFromDriveRoot);
            paths.push(path.resolve(path.join(uncBaseDir, fileName)));
        }
    }
    return paths;
}

// New helper function for robust file existence checking with retries
async function checkFileExistenceWithRetry(filePath: string, retries: number = 5, delayMs: number = 500): Promise<boolean> {
    for (let i = 0; i < retries; i++) {
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            return true; // File found
        } catch (e: any) {
            console.warn(`Attempt ${i + 1}/${retries}: File not found or inaccessible at ${filePath}: ${e.message}`);
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    return false; // File not found after all retries
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

        // Execute quarkdown to generate HTML
        await executeQuarkdownCommand('', filePath, outputBaseDir); // Pass the base output directory

        const htmlFilePaths = await getPotentialSubfolderPaths(outputBaseDir, expectedOutputFolderName, 'index.html');
        let foundHtmlPath: string | null = null;
        for (const p of htmlFilePaths) {
            if (await checkFileExistenceWithRetry(p)) {
                foundHtmlPath = p;
                break;
            }
        }

        if (!foundHtmlPath) {
            vscode.window.showErrorMessage(`Generated HTML file not found at any expected path. Tried: ${htmlFilePaths.join(', ')}.`);
            return;
        }

        vscode.window.showInformationMessage(`Generated HTML to ${foundHtmlPath}`);

        // Open the generated HTML file in a webview
        const panel = vscode.window.createWebviewPanel(
            'quarkdownPreview', // Identifies the type of the webview. Used internally
            'Quarkdown Preview', // Title of the panel displayed to the user
            vscode.ViewColumn.Beside, // Editor column to show the new webview panel in.
            {
                enableScripts: true, // Enable scripts in the webview
                localResourceRoots: [vscode.Uri.file(path.dirname(foundHtmlPath))] // Allow access to resources in the output directory
            }
        );

        // Read the HTML content
        let htmlContent = fs.readFileSync(foundHtmlPath, 'utf8');

        // Convert local resource paths to webview URIs
        // This is a simplified approach. A more robust solution might involve parsing the HTML
        // and replacing all src/href attributes. For now, assume resources are relative to index.html.
        htmlContent = htmlContent.replace(/(src|href)="(?!https?:\/\/)([^"]*)"/g, (match, attr, resPath) => {
            const resourceUri = vscode.Uri.file(path.resolve(path.dirname(foundHtmlPath), resPath));
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

        await executeQuarkdownCommand('', filePath, outputBaseDir); // Compile to HTML

        const htmlFilePaths = await getPotentialSubfolderPaths(outputBaseDir, expectedOutputFolderName, 'index.html');
        let foundHtmlPath: string | null = null;
        for (const p of htmlFilePaths) {
            if (await checkFileExistenceWithRetry(p)) {
                foundHtmlPath = p;
                break;
            }
        }

        if (foundHtmlPath) {
            vscode.window.showInformationMessage(`Exported HTML to ${path.dirname(foundHtmlPath)}`);
        } else {
            vscode.window.showErrorMessage(`Could not find the exported HTML file at any expected path. Tried: ${htmlFilePaths.join(', ')}.`);
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

        await executeQuarkdownCommand('--pdf', filePath, outputBaseDir); // Compile to PDF

        const pdfFileName = `${expectedOutputFolderName}.pdf`;
        const pdfFilePaths = await getPotentialDirectPaths(outputBaseDir, pdfFileName);
        let foundPdfPath: string | null = null;
        for (const p of pdfFilePaths) {
            if (await checkFileExistenceWithRetry(p)) {
                foundPdfPath = p;
                break;
            }
        }

        if (foundPdfPath) {
            vscode.window.showInformationMessage(`Exported PDF to ${path.dirname(foundPdfPath)}`);
        } else {
            vscode.window.showErrorMessage(`Could not find the exported PDF file at any expected path. Tried: ${pdfFilePaths.join(', ')}.`);
        }
    });

    context.subscriptions.push(previewDisposable, exportHtmlDisposable, exportPdfDisposable);
}

export function deactivate() {}
