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
function sanitizeDocname(docname) {
  let sanitized = docname.replace(/[^a-zA-Z0-9-]/g, "-").replace(/--+/g, "-");
  return sanitized;
}
async function getDocnameFromFile(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, "utf8");
    const match = content.match(/^\.docname\s*\{\s*(.*?)\s*\}/m);
    if (match && match[1]) {
      return match[1];
    }
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
  }
  return null;
}
async function executeQuarkdownCommand(command, filePath, outputDir) {
  const quarkdownPath = getQuarkdownPath();
  let fullCommand = `${quarkdownPath} c ${command} "${filePath}"`;
  if (outputDir) {
    try {
      await fs.promises.mkdir(outputDir, { recursive: true });
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to create output directory: ${err}`);
      throw err;
    }
    fullCommand = `${quarkdownPath} c ${command} -o "${outputDir}" "${filePath}"`;
  }
  return new Promise((resolve2, reject) => {
    (0, import_child_process.exec)(fullCommand, (error, stdout, stderr) => {
      if (error) {
        vscode.window.showErrorMessage(`Quarkdown command failed: ${error.message}
${stderr}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.warn(`Quarkdown command stderr: ${stderr}`);
      }
      console.log(`Quarkdown command stdout: ${stdout}`);
      resolve2(stdout);
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
    const filePath = editor.document.fileName;
    const fileDir = path.dirname(filePath);
    const outputDir = path.join(fileDir, "output");
    let stdout;
    try {
      stdout = await executeQuarkdownCommand("", filePath, outputDir);
    } catch (error) {
      return;
    }
    let specificOutputDir = "";
    let docname = await getDocnameFromFile(filePath);
    let expectedFolderName = "";
    if (docname) {
      expectedFolderName = sanitizeDocname(docname);
    } else {
      expectedFolderName = sanitizeDocname(path.basename(filePath, path.extname(filePath)));
    }
    if (expectedFolderName === "") {
      expectedFolderName = "-";
    }
    try {
      const entries = await fs.promises.readdir(outputDir, { withFileTypes: true });
      const subDirs = entries.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);
      const foundDirName = subDirs.find((dirName) => dirName === expectedFolderName);
      if (foundDirName) {
        specificOutputDir = path.join(outputDir, foundDirName);
      } else {
        vscode.window.showWarningMessage(`Expected folder "${expectedFolderName}" not found. Attempting to find the latest generated directory.`);
        let latestDir = "";
        let latestMtime = /* @__PURE__ */ new Date(0);
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
          vscode.window.showErrorMessage("Could not determine the specific output directory.");
          return;
        }
      }
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to read output directory: ${err}`);
      return;
    }
    const htmlFilePath = path.join(specificOutputDir, "index.html");
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
