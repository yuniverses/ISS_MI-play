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
  const [bubbles, setBubbles] = useState([]); // 懸浮泡泡列表
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState(COLORS[0]);
  const [currentWidth, setCurrentWidth] = useState(3);

  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const lastPointRef = useRef(null);
  const roomStateRef = useRef(null); // 用於事件監聽器中訪問最新狀態

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
      roomStateRef.current = state; // 同步更新 ref
      setTimeRemaining(state.timeRemaining || 30);
      
      // 如果有筆觸歷史，重繪畫布
      if (state.strokes && state.strokes.length > 0 && ctxRef.current) {
        redrawCanvas(state.strokes);
      }
    });

    newSocket.on('stroke-received', (stroke) => {
      // 接收其他人的筆觸（畫畫者不會收到自己的筆觸，因為伺服器用 socket.to）
      console.log('收到筆觸:', stroke);
      
      // 確保 context 存在
      if (!ctxRef.current && canvasRef.current) {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        const ctx = canvas.getContext('2d');
        ctxRef.current = ctx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
      
      if (ctxRef.current) {
        drawStroke(ctxRef.current, stroke);
      } else {
        console.error('無法繪製筆觸：context 不存在');
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

    // 懸浮泡泡事件（短暫顯示其他人的猜測）
    newSocket.on('guess-bubble', (payload) => {
      const id = `${payload.userId}-${Date.now()}`;
      setBubbles((prev) => [...prev.slice(-4), { id, ...payload }]);
      setTimeout(() => {
        setBubbles((prev) => prev.filter((b) => b.id !== id));
      }, 2000);
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
      
      // 設置畫布尺寸（只在初始化時執行，不會清除內容）
      const resizeCanvas = () => {
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        // 只在尺寸真的改變時才重新設置（避免清除內容）
        const newWidth = Math.max(1, Math.floor(rect.width * dpr));
        const newHeight = Math.max(1, Math.floor(rect.height * dpr));
        
        if (canvas.width !== newWidth || canvas.height !== newHeight) {
          // 保存當前畫布內容
          const imageData = ctxRef.current ? ctxRef.current.getImageData(0, 0, canvas.width / dpr, canvas.height / dpr) : null;
          
          // 設置 canvas 尺寸（這會重置 context，所以要在設置後重新獲取）
          canvas.width = newWidth;
          canvas.height = newHeight;
          
          // 重新獲取 context（因為設置 width/height 會重置它）
          const ctx = canvas.getContext('2d');
          ctxRef.current = ctx;
          
          // 設置縮放和繪圖屬性
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          // 恢復畫布內容（如果有的話）
          if (imageData) {
            ctx.putImageData(imageData, 0, 0);
          }
        }
        
        // 更新當前顏色和寬度（不重置 canvas）
        if (ctxRef.current) {
          ctxRef.current.strokeStyle = currentColor;
          ctxRef.current.lineWidth = currentWidth;
        }
      };

      resizeCanvas();
      
      // 延遲初始化，確保 DOM 已完全渲染
      const timer = setTimeout(resizeCanvas, 100);
      
      window.addEventListener('resize', resizeCanvas);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', resizeCanvas);
      };
    }
  }, []); // 只在初始化時執行一次

  // 單獨處理顏色和寬度變化（只更新 context 屬性，不重置 canvas）
  useEffect(() => {
    if (ctxRef.current) {
      ctxRef.current.strokeStyle = currentColor;
      ctxRef.current.lineWidth = currentWidth;
    }
  }, [currentColor, currentWidth]);

  const isPlayerPainter = () => {
    const currentState = roomStateRef.current || roomState;
    if (!currentState || !socket || !socket.id) {
      return false;
    }
    return currentState.currentPainter === socket.id;
  };

  const joinRoom = () => {
    if (nickname.trim() && socket) {
      socket.emit('join-room', { nickname: nickname.trim() });
    }
  };

  const getCanvasCoordinates = (e) => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: (clientX - rect.left),
      y: (clientY - rect.top)
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isPlayerPainter()) {
      console.log('Cannot draw: not painter');
      return;
    }
    
    // 確保 context 存在，如果不存在則重新初始化
    if (!ctxRef.current || !canvasRef.current) {
      console.log('Canvas context missing, reinitializing...');
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        const ctx = canvas.getContext('2d');
        ctxRef.current = ctx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      } else {
        console.log('Cannot draw: no canvas element');
        return;
      }
    }
    
    const coords = getCanvasCoordinates(e);
    if (!coords) return;
    
    // Start drawing
    setIsDrawing(true);
    lastPointRef.current = coords;
    
    // 畫一個初始點
    const ctx = ctxRef.current;
    if (!ctx) return;
    
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentWidth;
    ctx.fillStyle = currentColor;
    ctx.beginPath();
    ctx.arc(coords.x, coords.y, currentWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const draw = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isDrawing || !isPlayerPainter()) return;
    
    // 確保 context 存在
    if (!ctxRef.current || !canvasRef.current) {
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        const ctx = canvas.getContext('2d');
        ctxRef.current = ctx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      } else {
        return;
      }
    }
    
    const coords = getCanvasCoordinates(e);
    if (!coords || !lastPointRef.current) return;
    
    const ctx = ctxRef.current;
    if (!ctx) return;
    
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentWidth;
    
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    // 發送筆觸到伺服器
    if (socket) {
      socket.emit('draw-stroke', {
        from: lastPointRef.current,
        to: coords,
        color: currentColor,
        width: currentWidth
      });
    }

    lastPointRef.current = coords;
  };

  const stopDrawing = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setIsDrawing(false);
    lastPointRef.current = null;
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
    if (!ctxRef.current || !canvasRef.current) return;
    const ctx = ctxRef.current;
    const dpr = window.devicePixelRatio || 1;
    // 使用 CSS 像素座標清除（因為我們用了 setTransform）
    ctx.clearRect(0, 0, canvasRef.current.width / dpr, canvasRef.current.height / dpr);
    
    strokes.forEach(stroke => {
      drawStroke(ctx, stroke);
    });
  };

  const clearCanvas = () => {
    if (!isPlayerPainter()) return;
    
    // 確保 context 存在
    if (!ctxRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      const ctx = canvas.getContext('2d');
      ctxRef.current = ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    
    if (ctxRef.current && canvasRef.current) {
      const dpr = window.devicePixelRatio || 1;
      ctxRef.current.clearRect(0, 0, canvasRef.current.width / dpr, canvasRef.current.height / dpr);
    }
    
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
          onTouchCancel={stopDrawing}
          style={{ touchAction: 'none' }}
        />
        {isPainter && currentWord && (
          <div className="word-hint">題目：{currentWord}</div>
        )}

        {/* 懸浮猜測泡泡（非聊天，短暫顯示） */}
        <div className="guess-bubbles">
          {bubbles.map((b) => (
            <div key={b.id} className={`guess-bubble ${b.correct ? 'correct' : ''}`}>
              <span className="bubble-name">{b.nickname}</span>
              <span className="bubble-text">：{b.text}</span>
            </div>
          ))}
        </div>
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
