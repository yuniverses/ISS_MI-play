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
  const [messages, setMessages] = useState([]); // 聊天訊息歷史（不自動清除）
  const [showChat, setShowChat] = useState(false); // 是否顯示聊天室
  const chatContainerRef = useRef(null); // 聊天容器引用，用於滾動
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState(COLORS[0]);
  const [currentWidth, setCurrentWidth] = useState(3);

  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const lastPointRef = useRef(null);
  const roomStateRef = useRef(null); // 用於事件監聽器中訪問最新狀態
  
  // 固定手機版畫布尺寸（所有設備都使用這個尺寸）
  const CANVAS_WIDTH = 375; // 手機版寬度（CSS 像素）
  const CANVAS_HEIGHT = 500; // 手機版高度（CSS 像素）

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
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(CANVAS_WIDTH * dpr);
        canvas.height = Math.floor(CANVAS_HEIGHT * dpr);
        canvas.style.width = `${CANVAS_WIDTH}px`;
        canvas.style.height = `${CANVAS_HEIGHT}px`;
        const ctx = canvas.getContext('2d');
        ctxRef.current = ctx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
      
      if (ctxRef.current) {
        // 確保座標在有效範圍內
        const clampedStroke = {
          ...stroke,
          from: {
            x: Math.max(0, Math.min(CANVAS_WIDTH, stroke.from.x)),
            y: Math.max(0, Math.min(CANVAS_HEIGHT, stroke.from.y))
          },
          to: {
            x: Math.max(0, Math.min(CANVAS_WIDTH, stroke.to.x)),
            y: Math.max(0, Math.min(CANVAS_HEIGHT, stroke.to.y))
          }
        };
        drawStroke(ctxRef.current, clampedStroke);
      } else {
        console.error('無法繪製筆觸：context 不存在');
      }
    });

    newSocket.on('canvas-cleared', () => {
      if (ctxRef.current) {
        ctxRef.current.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
    });

    newSocket.on('your-turn-to-draw', ({ word }) => {
      setCurrentWord(word);
      if (ctxRef.current) {
        ctxRef.current.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
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

    // 聊天訊息事件（保存所有猜測訊息）
    newSocket.on('guess-bubble', (payload) => {
      const id = `${payload.userId}-${Date.now()}`;
      const newMessage = {
        id,
        ...payload,
        timestamp: Date.now()
      };
      
      setMessages((prev) => [...prev, newMessage]);
      
      // 只有猜題者才會自動展開聊天室，畫畫者不會自動展開
      const currentState = roomStateRef.current;
      const isPainter = currentState?.currentPainter === newSocket.id;
      if (!isPainter) {
        setShowChat(true); // 猜題者有新訊息時顯示聊天室
      }
      
      // 如果聊天室已打開，自動滾動到底部
      if (!isPainter) {
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        }, 100);
      }
    });

    newSocket.on('timer-update', ({ remaining }) => {
      setTimeRemaining(remaining);
    });

    newSocket.on('round-start', ({ round, painterNickname }) => {
      setCurrentWord(null);
      setGuessResult(null);
      setGuessInput('');
      // 不清除聊天訊息，保留歷史記錄
      if (ctxRef.current) {
        ctxRef.current.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }
    });

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      
      // 使用固定的手機版尺寸
      const canvasPixelWidth = Math.floor(CANVAS_WIDTH * dpr);
      const canvasPixelHeight = Math.floor(CANVAS_HEIGHT * dpr);
      
      // 設置 canvas 的實際像素尺寸
      canvas.width = canvasPixelWidth;
      canvas.height = canvasPixelHeight;
      
      // 設置 CSS 尺寸（固定手機版尺寸）
      canvas.style.width = `${CANVAS_WIDTH}px`;
      canvas.style.height = `${CANVAS_HEIGHT}px`;
      
      // 獲取 context 並設置縮放
      const ctx = canvas.getContext('2d');
      ctxRef.current = ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentWidth;
      
      console.log('Canvas initialized with fixed size:', { width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
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
    
    // 計算相對於畫布的座標
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // 限制在固定畫布範圍內
    const clampedX = Math.max(0, Math.min(CANVAS_WIDTH, x));
    const clampedY = Math.max(0, Math.min(CANVAS_HEIGHT, y));
    
    return {
      x: clampedX,
      y: clampedY
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isPlayerPainter()) {
      console.log('Cannot draw: not painter');
      return;
    }
    
    // 確保 context 存在
    if (!ctxRef.current || !canvasRef.current) {
      console.log('Canvas context missing, reinitializing...');
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(CANVAS_WIDTH * dpr);
        canvas.height = Math.floor(CANVAS_HEIGHT * dpr);
        canvas.style.width = `${CANVAS_WIDTH}px`;
        canvas.style.height = `${CANVAS_HEIGHT}px`;
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
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(CANVAS_WIDTH * dpr);
        canvas.height = Math.floor(CANVAS_HEIGHT * dpr);
        canvas.style.width = `${CANVAS_WIDTH}px`;
        canvas.style.height = `${CANVAS_HEIGHT}px`;
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
    // 使用固定畫布尺寸清除
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    strokes.forEach(stroke => {
      // 確保座標在有效範圍內
      const clampedStroke = {
        ...stroke,
        from: {
          x: Math.max(0, Math.min(CANVAS_WIDTH, stroke.from?.x || 0)),
          y: Math.max(0, Math.min(CANVAS_HEIGHT, stroke.from?.y || 0))
        },
        to: {
          x: Math.max(0, Math.min(CANVAS_WIDTH, stroke.to?.x || 0)),
          y: Math.max(0, Math.min(CANVAS_HEIGHT, stroke.to?.y || 0))
        }
      };
      drawStroke(ctx, clampedStroke);
    });
  };

  const clearCanvas = () => {
    if (!isPlayerPainter()) return;
    
    // 確保 context 存在
    if (!ctxRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(CANVAS_WIDTH * dpr);
      canvas.height = Math.floor(CANVAS_HEIGHT * dpr);
      canvas.style.width = `${CANVAS_WIDTH}px`;
      canvas.style.height = `${CANVAS_HEIGHT}px`;
      const ctx = canvas.getContext('2d');
      ctxRef.current = ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    
    if (ctxRef.current) {
      // 使用固定畫布尺寸清除
      ctxRef.current.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
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

        {/* 可滾動聊天室（懸浮在角落） */}
        {showChat && messages.length > 0 && (
          <div className="chat-container">
            <div className="chat-header">
              <button 
                className="chat-toggle-btn"
                onClick={() => setShowChat(false)}
                aria-label="隱藏聊天"
              >
                ×
              </button>
            </div>
            <div 
              ref={chatContainerRef}
              className="chat-messages"
            >
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`chat-message ${msg.correct ? 'correct' : ''}`}
                >
                  <span className="chat-message-name">{msg.nickname}</span>
                  <span className="chat-message-text">：{msg.text}</span>
                  {msg.correct && <span className="chat-correct-badge">✓</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* 顯示聊天室按鈕（當聊天室隱藏時） */}
        {!showChat && messages.length > 0 && (
          <button 
            className="chat-show-btn"
            onClick={() => setShowChat(true)}
            aria-label="顯示聊天"
          >
            💬 {messages.length}
          </button>
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
