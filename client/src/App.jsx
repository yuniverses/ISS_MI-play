import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const COLORS = ['#000000', '#17B26A', '#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF'];
const COLOR_NAMES = ['黑色', '綠色', '紅色', '青色', '黃色', '淺綠'];

function App() {
  const [socket, setSocket] = useState(null);
  const [nickname, setNickname] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [roomState, setRoomState] = useState(null);
  const [currentWord, setCurrentWord] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [guessInput, setGuessInput] = useState('');
  const [guessResult, setGuessResult] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState(COLORS[0]);
  const [currentWidth, setCurrentWidth] = useState(3);

  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const lastPointRef = useRef(null);

  useEffect(() => {
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('已連接到伺服器');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('與伺服器斷線');
      setIsConnected(false);
    });

    newSocket.on('room-state', (state) => {
      setRoomState(state);
      setTimeRemaining(state.timeRemaining || 30);
      
      // 如果有筆觸歷史，重繪畫布
      if (state.strokes && state.strokes.length > 0 && ctxRef.current) {
        redrawCanvas(state.strokes);
      }
    });

    newSocket.on('stroke-received', (stroke) => {
      if (ctxRef.current && !isPlayerPainter()) {
        drawStroke(ctxRef.current, stroke);
      }
    });

    newSocket.on('canvas-cleared', () => {
      if (ctxRef.current) {
        ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    });

    newSocket.on('your-turn-to-draw', ({ word }) => {
      setCurrentWord(word);
      if (ctxRef.current) {
        ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    });

    newSocket.on('guess-result', (result) => {
      setGuessResult(result);
      if (result.correct) {
        setGuessInput('');
        setTimeout(() => setGuessResult(null), 3000);
      } else {
        setTimeout(() => setGuessResult(null), 2000);
      }
    });

    newSocket.on('timer-update', ({ remaining }) => {
      setTimeRemaining(remaining);
    });

    newSocket.on('round-start', ({ round, painterNickname }) => {
      setCurrentWord(null);
      setGuessResult(null);
      setGuessInput('');
      if (ctxRef.current) {
        ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    });

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctxRef.current = ctx;

      // 設置畫布尺寸
      const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      };

      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      return () => window.removeEventListener('resize', resizeCanvas);
    }
  }, []);

  const isPlayerPainter = () => {
    if (!roomState || !socket) return false;
    return roomState.currentPainter === socket.id;
  };

  const joinRoom = () => {
    if (nickname.trim() && socket) {
      socket.emit('join-room', { nickname: nickname.trim() });
    }
  };

  const startDrawing = (e) => {
    if (!isPlayerPainter() || !ctxRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;

    setIsDrawing(true);
    lastPointRef.current = { x, y };
  };

  const draw = (e) => {
    if (!isDrawing || !isPlayerPainter() || !ctxRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;

    const ctx = ctxRef.current;
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentWidth;

    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    // 發送筆觸到伺服器
    if (socket) {
      socket.emit('draw-stroke', {
        from: lastPointRef.current,
        to: { x, y },
        color: currentColor,
        width: currentWidth
      });
    }

    lastPointRef.current = { x, y };
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const drawStroke = (ctx, stroke) => {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    ctx.moveTo(stroke.from.x, stroke.from.y);
    ctx.lineTo(stroke.to.x, stroke.to.y);
    ctx.stroke();
  };

  const redrawCanvas = (strokes) => {
    if (!ctxRef.current) return;
    const ctx = ctxRef.current;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    strokes.forEach(stroke => {
      drawStroke(ctx, stroke);
    });
  };

  const clearCanvas = () => {
    if (!isPlayerPainter() || !ctxRef.current) return;
    ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    if (socket) {
      socket.emit('clear-canvas');
    }
  };

  const submitGuess = () => {
    if (guessInput.trim() && socket && !isPlayerPainter()) {
      socket.emit('submit-guess', { guess: guessInput.trim() });
    }
  };

  if (!isConnected) {
    return (
      <div className="app">
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>連接中...</p>
        </div>
      </div>
    );
  }

  if (!roomState) {
    return (
      <div className="app">
        <div className="join-screen">
          <h1 className="title">迷玩｜同杯遊戲室</h1>
          <div className="input-group">
            <input
              type="text"
              placeholder="輸入你的暱稱"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
              className="nickname-input"
              maxLength={20}
            />
            <button onClick={joinRoom} className="join-btn" disabled={!nickname.trim()}>
              進入遊戲
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isPainter = isPlayerPainter();
  const players = roomState.players || [];
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="app">
      {/* 排行榜 */}
      <div className="leaderboard">
        <div className="leaderboard-header">
          <span>回合 {roomState.round || 1}</span>
          <span className="timer">⏱ {timeRemaining}s</span>
        </div>
        <div className="leaderboard-list">
          {sortedPlayers.slice(0, 3).map((player, idx) => (
            <div key={player.id} className={`leaderboard-item ${player.id === socket.id ? 'me' : ''}`}>
              <span className="rank">#{idx + 1}</span>
              <span className="name">{player.nickname}</span>
              <span className="score">{player.score}分</span>
            </div>
          ))}
        </div>
      </div>

      {/* 畫布區域 */}
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          className="drawing-canvas"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {isPainter && currentWord && (
          <div className="word-hint">題目：{currentWord}</div>
        )}
      </div>

      {/* 底部操作區 */}
      <div className="bottom-bar">
        {isPainter ? (
          /* 畫畫者工具列 */
          <div className="painter-toolbar">
            <div className="color-palette">
              {COLORS.map((color, idx) => (
                <button
                  key={color}
                  className={`color-btn ${currentColor === color ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setCurrentColor(color)}
                  title={COLOR_NAMES[idx]}
                />
              ))}
            </div>
            <div className="brush-controls">
              <button
                className="brush-btn"
                onClick={() => setCurrentWidth(Math.max(2, currentWidth - 2))}
                disabled={currentWidth <= 2}
              >
                −
              </button>
              <span className="brush-size">{currentWidth}px</span>
              <button
                className="brush-btn"
                onClick={() => setCurrentWidth(Math.min(20, currentWidth + 2))}
                disabled={currentWidth >= 20}
              >
                +
              </button>
            </div>
            <button className="clear-btn" onClick={clearCanvas}>
              清除
            </button>
          </div>
        ) : (
          /* 猜題者輸入框 */
          <div className="guesser-input">
            <input
              type="text"
              placeholder="輸入你的猜測..."
              value={guessInput}
              onChange={(e) => setGuessInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && submitGuess()}
              className="guess-input-field"
            />
            <button onClick={submitGuess} className="submit-btn" disabled={!guessInput.trim()}>
              送出
            </button>
            {guessResult && (
              <div className={`guess-feedback ${guessResult.correct ? 'correct' : 'wrong'}`}>
                {guessResult.correct
                  ? `🎉 答對了！${guessResult.points}分`
                  : guessResult.message || '答案不對'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 玩家列表（可選，顯示在側邊或底部） */}
      <div className="players-info">
        {players.length} 人在房間
        {isPainter ? ' | 你正在畫畫' : ' | 你正在猜題'}
      </div>
    </div>
  );
}

export default App;
