# VS Code拡張機能のアップデート公開

## 公開準備
- [ ] `todo.md` ファイルの作成
- [x] `vsce` がインストールされているか確認
- [x] `vsce` がインストールされていない場合、インストール
- [x] `package.json` の内容を確認（バージョン: 0.0.1, 公開者: OuchiniKaeru, engines.vscode: ^1.101.0に更新）

## アップデート公開
- [x] `vsce publish` コマンドを実行して公開
- [x] `package.json` のバージョンをインクリメント (0.0.1 -> 0.0.2)
- [x] 認証エラーの解決 (`vsce login` を使用)
- [x] `package.json` に `repository` フィールドを追加 (esbuild エラーが残存)
- [x] ライセンスファイル (LICENCE) の警告を解決 (LICENCEをLICENSEにリネーム)
