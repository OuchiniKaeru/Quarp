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

// .docnameからフォルダ名を抽出・サニタイズする関数
// この関数は、quarkdownが実際に生成するフォルダ名を予測するために使用される
function sanitizeDocname(docname: string): string {
    // 英数字とハイフン以外の文字（日本語を含む）をハイフンに変換
    let sanitized = docname
        .replace(/[^a-zA-Z0-9-]/g, '-') // 英数字とハイフン以外の文字をハイフンに変換
        .replace(/--+/g, '-')       // 連続するハイフンを1つにまとめる
    return sanitized;
}

// .qdファイルから.docnameの値を読み取る関数
async function getDocnameFromFile(filePath: string): Promise<string | null> {
    try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const match = content.match(/^\.docname\s*\{\s*(.*?)\s*\}/m);
        if (match && match[1]) {
            return match[1];
        }
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
    }
    return null;
}

async function executeQuarkdownCommand(command: string, filePath: string, outputDir?: string): Promise<string> {
    const quarkdownPath = getQuarkdownPath();
    // Always resolve filePath to an absolute path before passing to external command
    const resolvedFilePath = path.resolve(filePath);
    let fullCommand = `${quarkdownPath} c ${command} "${resolvedFilePath}"`;

    if (outputDir) {
        // Ensure the output directory exists
        try {
            await fs.promises.mkdir(outputDir, { recursive: true });
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to create output directory: ${err}`);
            throw err; // エラーを再スローして呼び出し元で処理できるようにする
        }
        fullCommand = `${quarkdownPath} c ${command} -o "${outputDir}" "${filePath}"`;
    }

    return new Promise((resolve, reject) => {
        exec(fullCommand, (error, stdout, stderr) => {
            if (error) {
                vscode.window.showErrorMessage(`Quarkdown command failed: ${error.message}\n${stderr}`);
                reject(error);
                return;
            }
            if (stderr) {
                console.warn(`Quarkdown command stderr: ${stderr}`);
            }
            console.log(`Quarkdown command stdout: ${stdout}`);
            resolve(stdout); // stdoutを返すように変更
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
            vscode.window.showWarningMessage('Please open a Quarkdown (.qd) file to preview.');
            return;
        }

        if (editor.document.isUntitled) {
            vscode.window.showWarningMessage('Please save the Quarkdown file before previewing.');
            return;
        }

        const filePath = editor.document.fileName;
        const fileDir = path.dirname(filePath);
        const outputDir = path.join(fileDir, 'output');
        
        // Quarkdownコマンドを実行してHTMLを生成し、stdoutを取得
        let stdout: string;
        try {
            stdout = await executeQuarkdownCommand('', filePath, outputDir);
        } catch (error) {
            // executeQuarkdownCommand内でエラーメッセージは表示済み
            return;
        }

        // 生成されたディレクトリを動的に特定する
        let specificOutputDir = '';
        let docname = await getDocnameFromFile(filePath);
        let expectedFolderName = '';

        if (docname) {
            expectedFolderName = sanitizeDocname(docname); // サニタイズを再度適用
        } else {
            // .docnameがない場合は、ファイル名から拡張子を除いたものを使用
            expectedFolderName = sanitizeDocname(path.basename(filePath, path.extname(filePath))); // サニタイズを再度適用
        }

        // サニタイズの結果、expectedFolderNameが空文字列になった場合、"-" を使用する
        if (expectedFolderName === '') {
            expectedFolderName = '-';
        }

        try {
            const entries = await fs.promises.readdir(outputDir, { withFileTypes: true });
            const subDirs = entries.filter(dirent => dirent.isDirectory())
                                   .map(dirent => dirent.name); // ディレクトリ名のみを取得

            // 期待されるフォルダ名と一致するものを探す
            const foundDirName = subDirs.find(dirName => dirName === expectedFolderName);

            if (foundDirName) {
                specificOutputDir = path.join(outputDir, foundDirName);
            } else {
                // 期待されるフォルダ名が見つからない場合、最新のディレクトリを見つけるフォールバックロジックを使用
                vscode.window.showWarningMessage(`Expected folder "${expectedFolderName}" not found. Attempting to find the latest generated directory.`);
                let latestDir = '';
                let latestMtime = new Date(0);

                for (const dirName of subDirs) {
                    const dirPath = path.join(outputDir, dirName);
                    const stats = await fs.promises.stat(dirPath);
                    if (stats.mtime > latestMtime) {
                        latestMtime = stats.mtime;
                        latestDir = dirPath;
                    }
                }

                if (latestDir) {
                    specificOutputDir = latestDir;
                } else {
                    vscode.window.showErrorMessage('Could not determine the specific output directory.');
                    return;
                }
            }

        } catch (err) {
            vscode.window.showErrorMessage(`Failed to read output directory: ${err}`);
            return;
        }

        const htmlFilePath = path.join(specificOutputDir, 'index.html');

        // HTMLファイルが存在するか確認
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
                localResourceRoots: [vscode.Uri.file(path.dirname(htmlFilePath))] // Allow access to resources in the output directory
            }
        );

        // Read the HTML content
        let htmlContent = fs.readFileSync(htmlFilePath, 'utf8');

        // Convert local resource paths to webview URIs
        // This is a simplified approach. A more robust solution might involve parsing the HTML
        // and replacing all src/href attributes. For now, assume resources are relative to index.html.
        htmlContent = htmlContent.replace(/(src|href)="(?!https?:\/\/)([^"]*)"/g, (match, attr, resPath) => {
            const resourceUri = vscode.Uri.file(path.resolve(path.dirname(htmlFilePath), resPath));
            return `${attr}="${panel.webview.asWebviewUri(resourceUri)}"`;
        });

        panel.webview.html = htmlContent;
    });

    let exportHtmlDisposable = vscode.commands.registerCommand('quarkdown-slides.exportHtml', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'quarkdown') {
            vscode.window.showWarningMessage('Please open a Quarkdown (.qd) file to export to HTML.');
            return;
        }

        const filePath = editor.document.fileName;
        const fileDir = path.dirname(filePath);
        const outputBaseDir = path.join(fileDir, 'output'); // Base output directory

        // Ensure the output base directory exists
        await fs.promises.mkdir(outputBaseDir, { recursive: true });

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
            vscode.window.showWarningMessage('Please open a Quarkdown (.qd) file to export to PDF.');
            return;
        }

        const filePath = editor.document.fileName;
        const fileDir = path.dirname(filePath);
        const outputBaseDir = path.join(fileDir, 'output'); // Base output directory

        // Ensure the output base directory exists
        await fs.promises.mkdir(outputBaseDir, { recursive: true });

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
