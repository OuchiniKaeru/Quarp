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
function getQuarkdownPath() {
  return "quarkdown";
}
async function executeQuarkdownCommand(command, filePath, outputDir) {
  const quarkdownPath = getQuarkdownPath();
  let fullCommand = `${quarkdownPath} c ${command} "${filePath}"`;
  if (outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fullCommand = `${quarkdownPath} c ${command} -o "${outputDir}" "${filePath}"`;
  }
  const terminal = vscode.window.createTerminal(`Quarkdown: ${path.basename(filePath)}`);
  terminal.show();
  terminal.sendText(fullCommand);
}
function activate(context) {
  console.log("Quarkdown Slides extension is now active!");
  let previewDisposable = vscode.commands.registerCommand("quarkdown-slides.preview", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "quarkdown") {
      vscode.window.showWarningMessage("Please open a Quarkdown (.qmd) file to preview.");
      return;
    }
    const filePath = editor.document.fileName;
    const fileDir = path.dirname(filePath);
    const outputDir = path.join(fileDir, "output");
    const fileNameWithoutExt = path.basename(filePath, ".qmd");
    const specificOutputDir = path.join(outputDir, `Quarkdown-${fileNameWithoutExt}`);
    const htmlFilePath = path.join(specificOutputDir, "index.html");
    await executeQuarkdownCommand("", filePath, outputDir);
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
    const outputDir = path.join(fileDir, "output");
    await executeQuarkdownCommand("", filePath, outputDir);
    vscode.window.showInformationMessage(`Exported HTML to ${outputDir}`);
  });
  let exportPdfDisposable = vscode.commands.registerCommand("quarkdown-slides.exportPdf", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "quarkdown") {
      vscode.window.showWarningMessage("Please open a Quarkdown (.qmd) file to export to PDF.");
      return;
    }
    const filePath = editor.document.fileName;
    const fileDir = path.dirname(filePath);
    const outputDir = path.join(fileDir, "output");
    await executeQuarkdownCommand("--pdf", filePath, outputDir);
    vscode.window.showInformationMessage(`Exported PDF to ${outputDir}`);
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
