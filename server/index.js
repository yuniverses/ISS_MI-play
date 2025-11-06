import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// CORS 設定：支援本地開發和生產環境
const corsOptions = process.env.NODE_ENV === 'production'
  ? {
      origin: process.env.CLIENT_URL || '*',
      methods: ["GET", "POST"],
      credentials: true
    }
  : {
      origin: true, // 開發環境允許所有來源
      methods: ["GET", "POST"],
      credentials: true
    };

const io = new Server(httpServer, {
  cors: corsOptions
});

app.use(cors(corsOptions));
app.use(express.json());

// 提供靜態資源（圖片等）
app.use('/teams', express.static(path.join(__dirname, '../teams')));
app.use('/stock', express.static(path.join(__dirname, '../stock')));

// 提供前端構建的靜態文件（生產環境）
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));

  // 所有其他路由都返回 index.html（支援 React Router）
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// 飲料戰隊配置
// 直接使用中文文件名，瀏覽器會自動處理編碼
const TEAMS = {
  'pearl-tea-latte': {
    id: 'pearl-tea-latte',
    name: '珍珠紅茶拿鐵隊',
    image: '/teams/珍珠紅茶拿鐵.png',
    color: '#D4A574'
  },
  'roasted-barley': {
    id: 'roasted-barley',
    name: '焙香決明大麥隊',
    image: '/teams/焙香決明大麥.png',
    color: '#8B7355'
  },
  'plum-green': {
    id: 'plum-green',
    name: '熟釀青梅綠隊',
    image: '/teams/熟釀青梅綠.png',
    color: '#A8D5BA'
  },
  'light-buckwheat': {
    id: 'light-buckwheat',
    name: '輕纖蕎麥茶隊',
    image: '/teams/輕纖蕎麥茶.png',
    color: '#E6D3A3'
  },
  'lime-tea': {
    id: 'lime-tea',
    name: '青檸香茶隊',
    image: '/teams/青檸香茶.png',
    color: '#B8E6B8'
  },
  'pomelo-green': {
    id: 'pomelo-green',
    name: '香柚綠茶隊',
    image: '/teams/香柚綠茶.png',
    color: '#F0E68C'
  }
};

// 根據URL參數或鏈結獲取戰隊ID
function getTeamFromQuery(query) {
  // 從URL參數中獲取戰隊ID，例如 ?team=pearl-tea-latte
  const teamId = query?.team || query?.drink || 'pearl-tea-latte';
  return TEAMS[teamId] || TEAMS['pearl-tea-latte']; // 默認戰隊
}

// 房間管理
const rooms = new Map();

// 題庫
const words = [
  '西瓜', '貓', '狗', '飛機', '蘋果', '香蕉', '車子', '太陽', '月亮',
  '星星', '花', '樹', '房子', '雨傘', '書', '筆', '電腦', '手機',
  '蛋糕', '冰淇淋', '球', '魚', '鳥', '兔子', '熊', '老虎', '獅子'
];

// 創建或加入房間
function getOrCreateRoom() {
  // 簡化：只使用一個默認房間
  const roomId = 'default-room';
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      players: [],
      currentPainter: null,
      currentWord: null,
      round: 0,
      startedAt: null,
      timer: null,
      scores: new Map(),
      strokes: []
    });
  }
  return rooms.get(roomId);
}

// 獲取玩家角色
function getPlayerRole(room, playerId) {
  return room.currentPainter === playerId ? 'painter' : 'guesser';
}

io.on('connection', (socket) => {
  console.log('玩家連接:', socket.id);

  socket.on('join-room', ({ nickname, teamId }) => {
    const room = getOrCreateRoom();
    
    // 獲取戰隊資訊
    const team = TEAMS[teamId] || TEAMS['pearl-tea-latte'];
    
    const player = {
      id: socket.id,
      nickname: nickname || `玩家${socket.id.slice(0, 6)}`,
      teamId: team.id,
      teamName: team.name,
      teamImage: team.image,
      teamColor: team.color,
      score: room.scores.get(socket.id) || 0,
      joinedAt: Date.now()
    };

    room.players.push(player);
    room.scores.set(socket.id, player.score);
    
    socket.join(room.id);

    // 如果房間還沒開始且只有一個玩家，讓他當畫畫者
    if (room.players.length === 1 && !room.currentPainter) {
      room.currentPainter = socket.id;
      room.currentWord = words[Math.floor(Math.random() * words.length)];
      room.round = 1;
      room.startedAt = Date.now();
      room.strokes = [];
      
      // 開始30秒倒計時
      startTimer(room);
    }
    // 如果有畫畫者但沒有計時器（可能之前中斷），重新啟動計時
    if (room.currentPainter && !room.timer) {
      startTimer(room);
    }

    // 發送房間狀態
    io.to(room.id).emit('room-state', {
      players: room.players.map(p => ({
        id: p.id,
        nickname: p.nickname,
        teamId: p.teamId,
        teamName: p.teamName,
        teamImage: p.teamImage,
        teamColor: p.teamColor,
        score: room.scores.get(p.id) || 0,
        role: getPlayerRole(room, p.id)
      })),
      currentPainter: room.currentPainter,
      round: room.round,
      timeRemaining: room.timer ? Math.max(0, 30 - Math.floor((Date.now() - room.startedAt) / 1000)) : 30,
      strokes: room.strokes
    });

    // 如果是畫畫者，發送題目
    if (room.currentPainter === socket.id) {
      socket.emit('your-turn-to-draw', {
        word: room.currentWord
      });
    }

    console.log(`${player.nickname} 加入房間，當前 ${room.players.length} 人`);
  });

  // 畫圖筆觸
  socket.on('draw-stroke', (stroke) => {
    const room = getOrCreateRoom();
    if (room.currentPainter !== socket.id) {
      console.log(`玩家 ${socket.id} 試圖畫圖，但不是畫畫者`);
      return; // 不是畫畫者，忽略
    }

    room.strokes.push({
      ...stroke,
      timestamp: Date.now()
    });

    // 廣播給其他玩家（不包括自己）
    const otherPlayersCount = room.players.filter(p => p.id !== socket.id).length;
    console.log(`畫畫者 ${socket.id} 發送筆觸，廣播給 ${otherPlayersCount} 位其他玩家`);
    socket.to(room.id).emit('stroke-received', stroke);
  });

  // 清除畫布
  socket.on('clear-canvas', () => {
    const room = getOrCreateRoom();
    if (room.currentPainter !== socket.id) {
      return;
    }
    room.strokes = [];
    io.to(room.id).emit('canvas-cleared');
  });

  // 提交猜測
  socket.on('submit-guess', ({ guess }) => {
    const room = getOrCreateRoom();
    if (room.currentPainter === socket.id) {
      socket.emit('guess-result', { correct: false, message: '你是畫畫者，不能猜題' });
      return;
    }

    if (!room.currentWord) {
      return;
    }

    const normalizedGuess = guess.trim().toLowerCase();
    const normalizedWord = room.currentWord.toLowerCase();

    // 向所有人顯示一個短暫的懸浮泡泡（非聊天記錄）
    const guesserPlayer = room.players.find(p => p.id === socket.id);
    io.to(room.id).emit('guess-bubble', {
      userId: socket.id,
      nickname: guesserPlayer?.nickname || '玩家',
      text: guess,
      correct: normalizedGuess === normalizedWord
    });

    if (normalizedGuess === normalizedWord) {
      // 答對了！
      const timeRemaining = room.timer ? Math.max(0, 30 - Math.floor((Date.now() - room.startedAt) / 1000)) : 0;
      const points = 50 + (timeRemaining * 2);
      
      // 給猜題者加分
      const guesserScore = room.scores.get(socket.id) || 0;
      room.scores.set(socket.id, guesserScore + points);
      
      // 給畫畫者加分
      const painterScore = room.scores.get(room.currentPainter) || 0;
      room.scores.set(room.currentPainter, painterScore + 30);

      // 更新玩家分數
      const guesser = room.players.find(p => p.id === socket.id);
      const painter = room.players.find(p => p.id === room.currentPainter);
      if (guesser) guesser.score = room.scores.get(socket.id);
      if (painter) painter.score = room.scores.get(room.currentPainter);

      // 通知所有人
      io.to(room.id).emit('guess-result', {
        correct: true,
        guesserId: socket.id,
        guesserNickname: guesser?.nickname || '玩家',
        word: room.currentWord,
        points: points
      });

      // 更新排行榜
      io.to(room.id).emit('room-state', {
        players: room.players.map(p => ({
          id: p.id,
          nickname: p.nickname,
          teamId: p.teamId,
          teamName: p.teamName,
          teamImage: p.teamImage,
          teamColor: p.teamColor,
          score: room.scores.get(p.id) || 0,
          role: getPlayerRole(room, p.id)
        })),
        currentPainter: room.currentPainter,
        round: room.round,
        timeRemaining: timeRemaining,
        strokes: room.strokes
      });

      console.log(`${guesser?.nickname} 猜對了！答案是 ${room.currentWord}`);
    } else {
      socket.emit('guess-result', { correct: false, message: '答案不對，再試試看！' });
    }
  });

  // 開始計時器
  function startTimer(room) {
    if (room.timer) {
      clearInterval(room.timer);
    }

    room.startedAt = Date.now();
    room.timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - room.startedAt) / 1000);
      const remaining = 30 - elapsed;

      if (remaining <= 0) {
        clearInterval(room.timer);
        room.timer = null;
        
        // 回合結束，切換到下一個畫畫者
        nextRound(room);
      } else {
        io.to(room.id).emit('timer-update', { remaining });
      }
    }, 1000);
  }

  // 下一回合
  function nextRound(room) {
    if (room.players.length === 0) return;

    // 找到當前畫畫者的索引
    const currentIndex = room.players.findIndex(p => p.id === room.currentPainter);
    const nextIndex = ((currentIndex >= 0 ? currentIndex : -1) + 1) % room.players.length;
    room.currentPainter = room.players[nextIndex].id;
    room.currentWord = words[Math.floor(Math.random() * words.length)];
    room.round++;
    room.startedAt = Date.now();
    room.strokes = [];

    // 通知所有人新回合開始
    io.to(room.id).emit('round-start', {
      round: room.round,
      painterId: room.currentPainter,
      painterNickname: room.players[nextIndex].nickname
    });

    // 告訴新畫畫者題目
    io.to(room.currentPainter).emit('your-turn-to-draw', {
      word: room.currentWord
    });

    // 更新房間狀態
    io.to(room.id).emit('room-state', {
      players: room.players.map(p => ({
        id: p.id,
        nickname: p.nickname,
        teamId: p.teamId,
        teamName: p.teamName,
        teamImage: p.teamImage,
        teamColor: p.teamColor,
        score: room.scores.get(p.id) || 0,
        role: getPlayerRole(room, p.id)
      })),
      currentPainter: room.currentPainter,
      round: room.round,
      timeRemaining: 30,
      strokes: []
    });

    // 重新開始計時
    startTimer(room);
  }

  // 斷線處理
  socket.on('disconnect', () => {
    const room = getOrCreateRoom();
    room.players = room.players.filter(p => p.id !== socket.id);
    room.scores.delete(socket.id);

    // 如果畫畫者斷線，跳到下一回合
    if (room.currentPainter === socket.id) {
      if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
      }
      if (room.players.length > 0) {
        nextRound(room);
      } else {
        // 房間清空
        room.currentPainter = null;
        room.currentWord = null;
        room.round = 0;
        room.startedAt = null;
        room.strokes = [];
      }
    } else if (room.players.length > 0) {
      // 更新房間狀態
      io.to(room.id).emit('room-state', {
        players: room.players.map(p => ({
          id: p.id,
          nickname: p.nickname,
          teamId: p.teamId,
          teamName: p.teamName,
          teamImage: p.teamImage,
          teamColor: p.teamColor,
          score: room.scores.get(p.id) || 0,
          role: getPlayerRole(room, p.id)
        })),
        currentPainter: room.currentPainter,
        round: room.round,
        timeRemaining: room.timer ? Math.max(0, 30 - Math.floor((Date.now() - room.startedAt) / 1000)) : 30,
        strokes: room.strokes
      });
    }

    console.log('玩家斷線:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🎮 遊戲伺服器運行在 http://localhost:${PORT}`);
});
