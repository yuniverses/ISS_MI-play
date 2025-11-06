# 戰隊連結說明

每個戰隊都有專屬的遊戲連結，玩家通過不同連結進入遊戲會自動加入對應的戰隊。

## 戰隊選擇頁面

訪問 `/team-select.html` 可以看到視覺化的戰隊選擇介面：
- 本地開發：`http://localhost:5173/team-select.html`
- 生產環境：`https://your-domain.com/team-select.html`

這個頁面會展示所有戰隊的圖片和名稱，點擊即可進入對應戰隊的遊戲。

## 本地開發連結

### 1. 珍珠紅茶拿鐵隊
```
http://localhost:5173?team=pearl-tea-latte
```
或
```
http://localhost:5173?drink=pearl-tea-latte
```

### 2. 焙香決明大麥隊
```
http://localhost:5173?team=roasted-barley
```

### 3. 熟釀青梅綠隊
```
http://localhost:5173?team=plum-green
```

### 4. 輕纖蕎麥茶隊
```
http://localhost:5173?team=light-buckwheat
```

### 5. 青檸香茶隊
```
http://localhost:5173?team=lime-tea
```

### 6. 香柚綠茶隊
```
http://localhost:5173?team=pomelo-green
```

## 生產環境連結

將 `localhost:5173` 替換為你的實際域名即可，例如：

```
https://your-domain.com?team=pearl-tea-latte
https://your-domain.com?team=roasted-barley
https://your-domain.com?team=plum-green
https://your-domain.com?team=light-buckwheat
https://your-domain.com?team=lime-tea
https://your-domain.com?team=pomelo-green
```

## 隊伍 ID 對照表

| 隊伍名稱 | Team ID | 圖片檔案 |
|---------|---------|---------|
| 珍珠紅茶拿鐵隊 | `pearl-tea-latte` | 珍珠紅茶拿鐵.png |
| 焙香決明大麥隊 | `roasted-barley` | 焙香決明大麥.png |
| 熟釀青梅綠隊 | `plum-green` | 熟釀青梅綠.png |
| 輕纖蕎麥茶隊 | `light-buckwheat` | 輕纖蕎麥茶.png |
| 青檸香茶隊 | `lime-tea` | 青檸香茶.png |
| 香柚綠茶隊 | `pomelo-green` | 香柚綠茶.png |

## 注意事項

- 如果沒有提供 `team` 參數，預設會加入「珍珠紅茶拿鐵隊」
- 玩家在遊戲中會看到自己的戰隊徽章和名稱
- 答案公佈時會顯示每個玩家的戰隊資訊
- 所有隊伍的玩家在同一個房間內遊戲（目前不支援隊伍分房）

## 快速分享

可以使用短網址服務（如 bit.ly）為每個隊伍創建更簡短的連結：

```
bit.ly/miplay-pearl  →  http://your-domain.com?team=pearl-tea-latte
bit.ly/miplay-barley →  http://your-domain.com?team=roasted-barley
...
```
