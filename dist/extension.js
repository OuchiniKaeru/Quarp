"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var import_child_process = require("child_process");
function getQuarkdownPath() {
  return "quarkdown";
}
async function executeQuarkdownCommand(command, filePath, outputDir) {
  const quarkdownPath = getQuarkdownPath();
  const resolvedFilePath = path.resolve(filePath);
  let fullCommand = `${quarkdownPath} c ${command} "${resolvedFilePath}"`;
  if (outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const resolvedOutputDir = path.resolve(outputDir);
    fullCommand = `${quarkdownPath} c ${command} -o "${resolvedOutputDir}" "${resolvedFilePath}"`;
  }
  return new Promise((resolve2, reject) => {
    (0, import_child_process.exec)(fullCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        vscode.window.showErrorMessage(`Quarkdown command failed: ${error.message}
${stderr}`);
        return reject(error);
      }
      if (stderr) {
        console.warn(`Quarkdown stderr: ${stderr}`);
      }
      console.log(`Quarkdown stdout: ${stdout}`);
      resolve2();
    });
  });
}
async function getUncPathForDrive(driveLetter) {
  return new Promise((resolve2) => {
    (0, import_child_process.exec)("wmic path win32_mappedlogicaldisk get DeviceID,ProviderName /format:list", (error, stdout, stderr) => {
      if (error) {
        console.warn(`Error getting mapped drives: ${error.message}`);
        return resolve2(null);
      }
      const lines = stdout.split("\n");
      for (const line of lines) {
        const deviceIdMatch = line.match(/DeviceID=([A-Z]:)/i);
        const providerNameMatch = line.match(/ProviderName=(.*)/);
        if (deviceIdMatch && providerNameMatch && deviceIdMatch[1].toUpperCase() === driveLetter.toUpperCase()) {
          const providerName = providerNameMatch[1].trim();
          return resolve2(providerName);
        }
      }
      resolve2(null);
    });
  });
}
async function getPotentialSubfolderPaths(baseDir, subfolderName, fileName) {
  const paths = [];
  const resolvedBaseDir = path.resolve(baseDir);
  const specificOutputDirFromResolvedBase = path.join(resolvedBaseDir, subfolderName);
  paths.push(path.resolve(path.join(specificOutputDirFromResolvedBase, fileName)));
  const driveLetterMatch = resolvedBaseDir.match(/^([a-zA-Z]):\\/);
  if (driveLetterMatch) {
    const driveLetter = driveLetterMatch[1];
    const uncBaseOfDrive = await getUncPathForDrive(`${driveLetter}:`);
    if (uncBaseOfDrive) {
      const relativePathFromDriveRoot = resolvedBaseDir.substring(driveLetter.length + 2);
      const uncBaseDir = path.join(uncBaseOfDrive, relativePathFromDriveRoot);
      const uncSpecificOutputDir = path.join(uncBaseDir, subfolderName);
      paths.push(path.resolve(path.join(uncSpecificOutputDir, fileName)));
    }
  }
  return paths;
}
async function getPotentialDirectPaths(baseDir, fileName) {
  const paths = [];
  const resolvedBaseDir = path.resolve(baseDir);
  paths.push(path.resolve(path.join(resolvedBaseDir, fileName)));
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
async function checkFileExistenceWithRetry(filePath, retries = 5, delayMs = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch (e) {
      console.warn(`Attempt ${i + 1}/${retries}: File not found or inaccessible at ${filePath}: ${e.message}`);
      if (i < retries - 1) {
        await new Promise((resolve2) => setTimeout(resolve2, delayMs));
      }
    }
  }
  return false;
}
function activate(context) {
  console.log("Quarkdown Slides extension is now active!");
  let previewDisposable = vscode.commands.registerCommand("quarkdown-slides.preview", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "quarkdown") {
      vscode.window.showWarningMessage("Please open a Quarkdown (.qmd) file to preview.");
      return;
    }
    if (editor.document.isUntitled) {
      vscode.window.showWarningMessage("Please save the Quarkdown file before previewing.");
      return;
    }
    const filePath = editor.document.fileName;
    const fileDir = path.dirname(filePath);
    const outputBaseDir = path.join(fileDir, "output");
    if (!fs.existsSync(outputBaseDir)) {
      fs.mkdirSync(outputBaseDir, { recursive: true });
    }
    let expectedOutputFolderName = "Untitled-Quarkdown-Document";
    const documentText = editor.document.getText();
    const docnameMatch = documentText.match(/^\.docname\s*\{\s*([^}]+)\s*\}/m);
    if (docnameMatch && docnameMatch[1]) {
      expectedOutputFolderName = docnameMatch[1].replace(/\s/g, "-");
    }
    await executeQuarkdownCommand("", filePath, outputBaseDir);
    const htmlFilePaths = await getPotentialSubfolderPaths(outputBaseDir, expectedOutputFolderName, "index.html");
    let foundHtmlPath = null;
    for (const p of htmlFilePaths) {
      if (await checkFileExistenceWithRetry(p)) {
        foundHtmlPath = p;
        break;
      }
    }
    if (!foundHtmlPath) {
      vscode.window.showErrorMessage(`Generated HTML file not found at any expected path. Tried: ${htmlFilePaths.join(", ")}.`);
      return;
    }
    vscode.window.showInformationMessage(`Generated HTML to ${foundHtmlPath}`);
    const panel = vscode.window.createWebviewPanel(
      "quarkdownPreview",
      // Identifies the type of the webview. Used internally
      "Quarkdown Preview",
      // Title of the panel displayed to the user
      vscode.ViewColumn.Beside,
      // Editor column to show the new webview panel in.
      {
        enableScripts: true,
        // Enable scripts in the webview
        localResourceRoots: [vscode.Uri.file(path.dirname(foundHtmlPath))]
        // Allow access to resources in the output directory
      }
    );
    let htmlContent = fs.readFileSync(foundHtmlPath, "utf8");
    htmlContent = htmlContent.replace(/(src|href)="(?!https?:\/\/)([^"]*)"/g, (match, attr, resPath) => {
      const resourceUri = vscode.Uri.file(path.resolve(path.dirname(foundHtmlPath), resPath));
      return `${attr}="${panel.webview.asWebviewUri(resourceUri)}"`;
    });
    panel.webview.html = htmlContent;
  });
  let exportHtmlDisposable = vscode.commands.registerCommand("quarkdown-slides.exportHtml", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "quarkdown") {
      vscode.window.showWarningMessage("Please open a Quarkdown (.qmd) file to export to HTML.");
      return;
    }
    const filePath = editor.document.fileName;
    const fileDir = path.dirname(filePath);
    const outputBaseDir = path.join(fileDir, "output");
    if (!fs.existsSync(outputBaseDir)) {
      fs.mkdirSync(outputBaseDir, { recursive: true });
    }
    let expectedOutputFolderName = "Untitled-Quarkdown-Document";
    const documentText = editor.document.getText();
    const docnameMatch = documentText.match(/^\.docname\s*\{\s*([^}]+)\s*\}/m);
    if (docnameMatch && docnameMatch[1]) {
      expectedOutputFolderName = docnameMatch[1].replace(/\s/g, "-");
    }
    await executeQuarkdownCommand("", filePath, outputBaseDir);
    const htmlFilePaths = await getPotentialSubfolderPaths(outputBaseDir, expectedOutputFolderName, "index.html");
    let foundHtmlPath = null;
    for (const p of htmlFilePaths) {
      if (await checkFileExistenceWithRetry(p)) {
        foundHtmlPath = p;
        break;
      }
    }
    if (foundHtmlPath) {
      vscode.window.showInformationMessage(`Exported HTML to ${path.dirname(foundHtmlPath)}`);
    } else {
      vscode.window.showErrorMessage(`Could not find the exported HTML file at any expected path. Tried: ${htmlFilePaths.join(", ")}.`);
    }
  });
  let exportPdfDisposable = vscode.commands.registerCommand("quarkdown-slides.exportPdf", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "quarkdown") {
      vscode.window.showWarningMessage("Please open a Quarkdown (.qmd) file to export to PDF.");
      return;
    }
    const filePath = editor.document.fileName;
    const fileDir = path.dirname(filePath);
    const outputBaseDir = path.join(fileDir, "output");
    if (!fs.existsSync(outputBaseDir)) {
      fs.mkdirSync(outputBaseDir, { recursive: true });
    }
    let expectedOutputFolderName = "Untitled-Quarkdown-Document";
    const documentText = editor.document.getText();
    const docnameMatch = documentText.match(/^\.docname\s*\{\s*([^}]+)\s*\}/m);
    if (docnameMatch && docnameMatch[1]) {
      expectedOutputFolderName = docnameMatch[1].replace(/\s/g, "-");
    }
    await executeQuarkdownCommand("--pdf", filePath, outputBaseDir);
    const pdfFileName = `${expectedOutputFolderName}.pdf`;
    const pdfFilePaths = await getPotentialDirectPaths(outputBaseDir, pdfFileName);
    let foundPdfPath = null;
    for (const p of pdfFilePaths) {
      if (await checkFileExistenceWithRetry(p)) {
        foundPdfPath = p;
        break;
      }
    }
    if (foundPdfPath) {
      vscode.window.showInformationMessage(`Exported PDF to ${path.dirname(foundPdfPath)}`);
    } else {
      vscode.window.showErrorMessage(`Could not find the exported PDF file at any expected path. Tried: ${pdfFilePaths.join(", ")}.`);
    }
  });
  context.subscriptions.push(previewDisposable, exportHtmlDisposable, exportPdfDisposable);
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
