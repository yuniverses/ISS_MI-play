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

// 全局排行榜（記錄所有玩過的玩家）
const globalLeaderboard = new Map(); // key: nickname, value: { nickname, teamId, teamName, teamImage, totalScore, gamesPlayed }

// 戰隊統計
const teamStats = new Map(); // key: teamId, value: { teamId, teamName, teamImage, totalScore, playerCount }

// 遊戲設置
const MAX_ROUNDS = 10; // 最大回合數

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
      strokes: [],
      correctGuessers: [] // 追蹤每回合答對的玩家詳細資訊
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
      room.correctGuessers = []; // 清空答對名單

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
      strokes: room.strokes,
      wordLength: room.currentWord?.length || 0
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
    const isCorrect = normalizedGuess === normalizedWord;

    // 如果答對，打碼答案；如果答錯，顯示原始答案
    const displayText = isCorrect ? '✓✓✓' : guess;

    // 向所有人顯示一個短暫的懸浮泡泡（非聊天記錄）
    const guesserPlayer = room.players.find(p => p.id === socket.id);
    io.to(room.id).emit('guess-bubble', {
      userId: socket.id,
      nickname: guesserPlayer?.nickname || '玩家',
      text: displayText,
      correct: isCorrect
    });

    if (isCorrect) {
      // 答對了！
      const timeRemaining = room.timer ? Math.max(0, 30 - Math.floor((Date.now() - room.startedAt) / 1000)) : 0;
      const elapsedTime = 30 - timeRemaining;
      const points = 50 + (timeRemaining * 2);

      // 找到猜題者資訊
      const guesser = room.players.find(p => p.id === socket.id);

      // 加入答對名單，記錄詳細資訊
      if (!room.correctGuessers.find(g => g.id === socket.id)) {
        room.correctGuessers.push({
          id: socket.id,
          nickname: guesser?.nickname || '玩家',
          teamId: guesser?.teamId,
          teamName: guesser?.teamName,
          teamImage: guesser?.teamImage,
          teamColor: guesser?.teamColor,
          time: elapsedTime,
          points: points,
          order: room.correctGuessers.length + 1
        });
      }

      // 給猜題者加分
      const guesserScore = room.scores.get(socket.id) || 0;
      room.scores.set(socket.id, guesserScore + points);

      // 給畫畫者加分
      const painterScore = room.scores.get(room.currentPainter) || 0;
      room.scores.set(room.currentPainter, painterScore + 30);

      // 更新玩家分數
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
        strokes: room.strokes,
        wordLength: room.currentWord?.length || 0
      });

      console.log(`${guesser?.nickname} 猜對了！答案是 ${room.currentWord}`);

      // 檢查是否所有猜題者都答對了
      const guessersCount = room.players.filter(p => p.id !== room.currentPainter).length;
      if (room.correctGuessers.length >= guessersCount && guessersCount > 0) {
        console.log('所有猜題者都答對了，提早結束回合');
        // 停止計時器並顯示答案
        if (room.timer) {
          clearInterval(room.timer);
          room.timer = null;
        }
        showAnswerReveal(room);
      }
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

        // 回合結束，顯示答案公佈
        showAnswerReveal(room);
      } else {
        io.to(room.id).emit('timer-update', { remaining });
      }
    }, 1000);
  }

  // 顯示答案公佈畫面
  function showAnswerReveal(room) {
    const painter = room.players.find(p => p.id === room.currentPainter);

    // 發送答案公佈資料
    io.to(room.id).emit('answer-reveal', {
      answer: room.currentWord,
      painter: {
        id: painter?.id,
        nickname: painter?.nickname || '畫畫者',
        teamName: painter?.teamName,
        teamImage: painter?.teamImage
      },
      correctGuessers: room.correctGuessers,
      totalGuessers: room.players.filter(p => p.id !== room.currentPainter).length
    });

    console.log(`公佈答案：${room.currentWord}，${room.correctGuessers.length} 人答對`);

    // 6秒後進入下一回合
    setTimeout(() => {
      nextRound(room);
    }, 6000);
  }

  // 下一回合
  function nextRound(room) {
    if (room.players.length === 0) return;

    // 檢查是否達到最大輪數
    if (room.round >= MAX_ROUNDS) {
      console.log(`遊戲結束！已完成 ${MAX_ROUNDS} 輪`);
      endGame(room);
      return;
    }

    // 找到當前畫畫者的索引
    const currentIndex = room.players.findIndex(p => p.id === room.currentPainter);
    const nextIndex = ((currentIndex >= 0 ? currentIndex : -1) + 1) % room.players.length;
    room.currentPainter = room.players[nextIndex].id;
    room.currentWord = words[Math.floor(Math.random() * words.length)];
    room.round++;
    room.startedAt = Date.now();
    room.strokes = [];
    room.correctGuessers = []; // 清空答對名單

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
      strokes: [],
      wordLength: room.currentWord?.length || 0
    });

    // 重新開始計時
    startTimer(room);
  }

  // 遊戲結束
  function endGame(room) {
    // 停止計時器
    if (room.timer) {
      clearInterval(room.timer);
      room.timer = null;
    }

    // 計算本局排名
    const finalPlayers = room.players.map(p => ({
      id: p.id,
      nickname: p.nickname,
      teamId: p.teamId,
      teamName: p.teamName,
      teamImage: p.teamImage,
      teamColor: p.teamColor,
      score: room.scores.get(p.id) || 0
    })).sort((a, b) => b.score - a.score);

    // 更新全局排行榜
    finalPlayers.forEach(player => {
      const existing = globalLeaderboard.get(player.nickname);
      if (existing) {
        existing.totalScore += player.score;
        existing.gamesPlayed++;
      } else {
        globalLeaderboard.set(player.nickname, {
          nickname: player.nickname,
          teamId: player.teamId,
          teamName: player.teamName,
          teamImage: player.teamImage,
          totalScore: player.score,
          gamesPlayed: 1
        });
      }
    });

    // 更新戰隊統計
    const teamScores = new Map();
    finalPlayers.forEach(player => {
      const current = teamScores.get(player.teamId) || 0;
      teamScores.set(player.teamId, current + player.score);
    });

    teamScores.forEach((score, teamId) => {
      const teamInfo = TEAMS[teamId];
      const existing = teamStats.get(teamId);
      if (existing) {
        existing.totalScore += score;
        existing.playerCount = (existing.playerCount || 0) +
          finalPlayers.filter(p => p.teamId === teamId).length;
      } else {
        teamStats.set(teamId, {
          teamId: teamId,
          teamName: teamInfo?.name || teamId,
          teamImage: teamInfo?.image || '',
          totalScore: score,
          playerCount: finalPlayers.filter(p => p.teamId === teamId).length
        });
      }
    });

    // 獲取全局排行榜前10名
    const globalTop10 = Array.from(globalLeaderboard.values())
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);

    // 獲取戰隊排名
    const teamRankings = Array.from(teamStats.values())
      .sort((a, b) => b.totalScore - a.totalScore);

    // 計算本局戰隊得分
    const currentTeamScores = Array.from(teamScores.entries()).map(([teamId, score]) => {
      const teamInfo = TEAMS[teamId];
      return {
        teamId,
        teamName: teamInfo?.name || teamId,
        teamImage: teamInfo?.image || '',
        score
      };
    }).sort((a, b) => b.score - a.score);

    // 發送遊戲結束事件
    io.to(room.id).emit('game-over', {
      finalPlayers,
      globalLeaderboard: globalTop10,
      teamRankings,
      currentTeamScores
    });

    console.log('遊戲結束，排行榜已更新');
  }

  // 重置遊戲
  function restartGame(room) {
    // 保留玩家，但重置分數和狀態
    room.round = 0;
    room.currentPainter = null;
    room.currentWord = null;
    room.startedAt = null;
    room.strokes = [];
    room.correctGuessers = [];

    // 不清空分數，繼續累積
    // 如果要清空分數，取消下面的註釋
    // room.scores.clear();
    // room.players.forEach(p => {
    //   room.scores.set(p.id, 0);
    //   p.score = 0;
    // });

    if (room.players.length > 0) {
      // 開始新一局
      room.currentPainter = room.players[0].id;
      room.currentWord = words[Math.floor(Math.random() * words.length)];
      room.round = 1;
      room.startedAt = Date.now();

      // 通知所有人新遊戲開始
      io.to(room.id).emit('game-restart', {
        round: room.round,
        painterId: room.currentPainter,
        painterNickname: room.players[0].nickname
      });

      // 告訴畫畫者題目
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
        strokes: [],
        wordLength: room.currentWord?.length || 0
      });

      // 開始計時
      startTimer(room);
    }

    console.log('遊戲重新開始');
  }

  // 處理再來一場請求
  socket.on('restart-game', () => {
    const room = getOrCreateRoom();
    console.log(`${socket.id} 請求重新開始遊戲`);
    restartGame(room);
  });

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
        strokes: room.strokes,
        wordLength: room.currentWord?.length || 0
      });
    }

    console.log('玩家斷線:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🎮 遊戲伺服器運行在 http://localhost:${PORT}`);
});
