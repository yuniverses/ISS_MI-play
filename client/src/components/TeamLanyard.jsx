import { useState, useEffect, useRef, useCallback } from 'react';
import './TeamLanyard.css';

// 隊伍資料
const TEAMS = {
  'pearl-tea-latte': { name: '珍珠紅茶拿鐵隊', image: '/teams/珍珠紅茶拿鐵.png' },
  'roasted-barley': { name: '焙香決明大麥隊', image: '/teams/焙香決明大麥.png' },
  'plum-green': { name: '熟釀青梅綠隊', image: '/teams/熟釀青梅綠.png' },
  'light-buckwheat': { name: '輕纖蕎麥茶隊', image: '/teams/輕纖蕎麥茶.png' },
  'lime-tea': { name: '青檸香茶隊', image: '/teams/青檸香茶.png' },
  'pomelo-green': { name: '香柚綠茶隊', image: '/teams/香柚綠茶.png' }
};

export default function TeamLanyard({ teamId, playerName }) {
  const team = TEAMS[teamId] || TEAMS['pearl-tea-latte'];
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });

  const cardRef = useRef(null);
  const animationRef = useRef(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const lastTime = useRef(Date.now());

  // 物理動畫 - 彈簧效果
  useEffect(() => {
    const animate = () => {
      if (!isDragging) {
        const springStrength = 0.05;
        const damping = 0.92;

        setPosition(prev => {
          const newX = prev.x * (1 - springStrength);
          const newY = prev.y * (1 - springStrength);
          return { x: newX, y: newY };
        });

        setRotation(prev => {
          const newX = prev.x * damping;
          const newY = prev.y * damping;
          return { x: newX, y: newY };
        });
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isDragging]);

  // 滑鼠移動處理
  const handleMouseMove = useCallback((e) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    if (isDragging) {
      const deltaX = mouseX - lastMousePos.current.x;
      const deltaY = mouseY - lastMousePos.current.y;
      const currentTime = Date.now();
      const deltaTime = currentTime - lastTime.current;

      setPosition(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));

      setVelocity({
        x: deltaX / Math.max(deltaTime, 1),
        y: deltaY / Math.max(deltaTime, 1)
      });

      lastMousePos.current = { x: mouseX, y: mouseY };
      lastTime.current = currentTime;
    } else {
      // 懸停時的傾斜效果
      const offsetX = (mouseX - centerX) / rect.width;
      const offsetY = (mouseY - centerY) / rect.height;

      setRotation({
        x: offsetY * -15,
        y: offsetX * 15
      });
    }
  }, [isDragging]);

  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    lastTime.current = Date.now();
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!isDragging) {
      setRotation({ x: 0, y: 0 });
    }
  }, [isDragging]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div className="lanyard-wrapper">
      {/* 掛繩 */}
      <div
        className="lanyard-rope"
        style={{
          transform: `translateX(${position.x * 0.1}px) rotate(${rotation.y * 0.2}deg)`
        }}
      ></div>

      {/* 卡片 */}
      <div
        ref={cardRef}
        className={`lanyard-card ${isDragging ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `
            translate(${position.x}px, ${position.y}px)
            rotateX(${rotation.x}deg)
            rotateY(${rotation.y}deg)
          `,
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      >
        {/* 飲料圖片 */}
        <div className="lanyard-image-container">
          <img
            src={team.image}
            alt={team.name}
            className="lanyard-image"
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              console.error('圖片載入失敗:', team.image);
              e.target.style.display = 'none';
            }}
            draggable={false}
          />
        </div>

        {/* 隊伍名稱 */}
        <div className="lanyard-team-name">
          {team.name}
        </div>

        {/* 玩家名稱 */}
        <div className="lanyard-player-name">
          {playerName || '玩家'}
        </div>

        {/* 光澤效果 */}
        <div
          className="lanyard-shine"
          style={{
            background: `radial-gradient(
              circle at ${50 + rotation.y * 2}% ${50 - rotation.x * 2}%,
              rgba(255, 255, 255, 0.3),
              transparent 60%
            )`
          }}
        ></div>
      </div>
    </div>
  );
}
