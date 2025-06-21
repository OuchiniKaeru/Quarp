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
  filePath = path.resolve(filePath);
  let fullCommand = `${quarkdownPath} c ${command} "${filePath}"`;
  if (outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    outputDir = path.resolve(outputDir);
    fullCommand = `${quarkdownPath} c ${command} -o "${outputDir}" "${filePath}"`;
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
    const resolvedOutputBaseDir = path.resolve(outputBaseDir);
    if (!fs.existsSync(outputBaseDir)) {
      fs.mkdirSync(outputBaseDir, { recursive: true });
    }
    let expectedOutputFolderName = "Untitled-Quarkdown-Document";
    const documentText = editor.document.getText();
    const docnameMatch = documentText.match(/^\.docname\s*\{\s*([^}]+)\s*\}/m);
    if (docnameMatch && docnameMatch[1]) {
      expectedOutputFolderName = docnameMatch[1].replace(/\s/g, "-");
    }
    const specificOutputDir = path.join(resolvedOutputBaseDir, expectedOutputFolderName);
    const htmlFilePath = path.join(specificOutputDir, "index.html");
    await executeQuarkdownCommand("", filePath, resolvedOutputBaseDir);
    if (!fs.existsSync(htmlFilePath)) {
      vscode.window.showErrorMessage(`Generated HTML file not found at ${htmlFilePath}.`);
      return;
    }
    vscode.window.showInformationMessage(`Generated HTML to ${htmlFilePath}`);
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
        localResourceRoots: [vscode.Uri.file(specificOutputDir)]
        // Allow access to resources in the output directory
      }
    );
    let htmlContent = fs.readFileSync(htmlFilePath, "utf8");
    htmlContent = htmlContent.replace(/(src|href)="(?!https?:\/\/)([^"]*)"/g, (match, attr, resPath) => {
      const resourceUri = vscode.Uri.file(path.resolve(specificOutputDir, resPath));
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
    const resolvedOutputBaseDir = path.resolve(outputBaseDir);
    if (!fs.existsSync(outputBaseDir)) {
      fs.mkdirSync(outputBaseDir, { recursive: true });
    }
    let expectedOutputFolderName = "Untitled-Quarkdown-Document";
    const documentText = editor.document.getText();
    const docnameMatch = documentText.match(/^\.docname\s*\{\s*([^}]+)\s*\}/m);
    if (docnameMatch && docnameMatch[1]) {
      expectedOutputFolderName = docnameMatch[1].replace(/\s/g, "-");
    }
    const specificOutputDir = path.join(resolvedOutputBaseDir, expectedOutputFolderName);
    const htmlFilePath = path.join(specificOutputDir, "index.html");
    await executeQuarkdownCommand("", filePath, resolvedOutputBaseDir);
    if (fs.existsSync(htmlFilePath)) {
      vscode.window.showInformationMessage(`Exported HTML to ${specificOutputDir}`);
    } else {
      vscode.window.showErrorMessage(`Could not find the exported HTML file at ${htmlFilePath}.`);
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
    const specificOutputDir = path.join(outputBaseDir, expectedOutputFolderName);
    const pdfFilePath = path.join(specificOutputDir, "index.pdf");
    await executeQuarkdownCommand("--pdf", filePath, outputBaseDir);
    if (fs.existsSync(pdfFilePath)) {
      vscode.window.showInformationMessage(`Exported PDF to ${specificOutputDir}`);
    } else {
      vscode.window.showErrorMessage(`Could not find the exported PDF file at ${pdfFilePath}.`);
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
