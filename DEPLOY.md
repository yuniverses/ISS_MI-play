# Heroku 部署指南

## 前置要求

1. 安裝 [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
2. 擁有 Heroku 帳號

## 部署步驟

### 1. 登入 Heroku

```bash
heroku login
```

### 2. 創建 Heroku 應用

```bash
heroku create your-app-name
```

或者讓 Heroku 自動生成名稱：

```bash
heroku create
```

### 3. 設定環境變數

```bash
heroku config:set NODE_ENV=production
```

### 4. 部署應用

```bash
git push heroku main
```

如果你的分支不是 `main`，使用：

```bash
git push heroku your-branch:main
```

### 5. 查看應用

```bash
heroku open
```

## 查看日誌

如果遇到問題，可以查看日誌：

```bash
heroku logs --tail
```

## 重新部署

每次更新代碼後：

```bash
git add .
git commit -m "your commit message"
git push heroku main
```

## 環境變數說明

- `NODE_ENV`: 設定為 `production` 以啟用生產模式
- `PORT`: Heroku 會自動設定，無需手動配置

## 注意事項

1. Heroku 會自動運行 `npm run heroku-postbuild` 腳本來構建前端
2. 靜態文件會由 Express server 提供服務
3. Socket.IO 會自動使用正確的域名連接
4. 確保所有必要的文件都已提交到 Git

## 疑難排解

### 應用無法啟動

檢查日誌：
```bash
heroku logs --tail
```

### 連接問題

確認環境變數是否正確設定：
```bash
heroku config
```

### 重啟應用

```bash
heroku restart
```

## 本地測試生產版本

在部署前，可以在本地測試生產版本：

```bash
# 構建前端
npm run build

# 設定環境變數並啟動
NODE_ENV=production npm start
```

然後訪問 `http://localhost:3001`

## 額外功能

### 添加自定義域名

```bash
heroku domains:add www.your-domain.com
```

### 啟用自動部署（使用 GitHub）

在 Heroku Dashboard 中：
1. 進入應用的 "Deploy" 頁面
2. 連接 GitHub repository
3. 啟用 "Automatic Deploys"

## 相關資源

- [Heroku Node.js 文檔](https://devcenter.heroku.com/articles/deploying-nodejs)
- [Heroku CLI 文檔](https://devcenter.heroku.com/articles/heroku-cli)
