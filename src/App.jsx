import { useState, useRef, useEffect } from 'react';
import { processMultiSegments } from './utils/ffmpegHelper';

function App() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  
  // 影片分段資料結構：[{ id, start, end, speed }]
  const [segments, setSegments] = useState([]);
  const [selectedSegId, setSelectedSegId] = useState(null);
  
  // 處理狀態
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [outputUrl, setOutputUrl] = useState('');
  
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const logTerminalRef = useRef(null);

  // 當選擇影片檔案
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setOutputUrl('');
      setProgress(0);
      setLogs([]);
    }
  };

  // 當影片載入完成，取得時長並初始化第一段
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      const initialSegment = {
        id: Date.now(),
        start: 0,
        end: dur,
        speed: 1.0
      };
      setSegments([initialSegment]);
      setSelectedSegId(initialSegment.id);
    }
  };

  // 播放時間更新
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // 跳轉到指定時間
  const seekTo = (time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(time, duration));
    }
  };

  // 在當前時間點進行「分割」
  const handleSplit = () => {
    const t = currentTime;
    // 尋找包含當前時間的片段
    const targetIndex = segments.findIndex(seg => t > seg.start && t < seg.end);
    
    if (targetIndex === -1) {
      alert('請在片段的中間進行分割（不能在端點或超出範圍）');
      return;
    }

    const target = segments[targetIndex];
    
    const segmentA = {
      id: Date.now(),
      start: target.start,
      end: t,
      speed: target.speed
    };
    
    const segmentB = {
      id: Date.now() + 1,
      start: t,
      end: target.end,
      speed: target.speed
    };

    const newSegments = [...segments];
    newSegments.splice(targetIndex, 1, segmentA, segmentB);
    
    setSegments(newSegments);
    setSelectedSegId(segmentB.id); // 預設選中後半段
  };

  // 合併當前段落與下一段
  const handleMergeWithNext = (index) => {
    if (index >= segments.length - 1) return;
    const current = segments[index];
    const next = segments[index + 1];

    const mergedSegment = {
      id: current.id,
      start: current.start,
      end: next.end,
      speed: current.speed // 保留前者的速度
    };

    const newSegments = [...segments];
    newSegments.splice(index, 2, mergedSegment);
    setSegments(newSegments);
    setSelectedSegId(mergedSegment.id);
  };

  // 修改選中段落的播放速度
  const handleSetSpeed = (id, newSpeed) => {
    setSegments(prev => prev.map(seg => seg.id === id ? { ...seg, speed: newSpeed } : seg));
  };

  // 格式化時間 (mm:ss.ms)
  const formatTime = (timeInSecs) => {
    if (isNaN(timeInSecs)) return '00:00.0';
    const mins = Math.floor(timeInSecs / 60);
    const secs = Math.floor(timeInSecs % 60);
    const ms = Math.floor((timeInSecs % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  // 點擊時間軸背景跳轉播放時間
  const handleTimelineClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    seekTo(percentage * duration);
  };

  // 當日誌更新時，滾動到最下方
  useEffect(() => {
    if (logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [logs]);

  // 執行影片處理
  const handleProcessVideo = async () => {
    if (!videoFile || segments.length === 0) return;
    setIsProcessing(true);
    setProgress(0);
    setLogs([]);
    setOutputUrl('');

    const onLog = ({ message }) => {
      setLogs((prev) => [...prev.slice(-99), message]);
    };

    const onProgress = ({ progress }) => {
      setProgress(Math.round(progress * 100));
    };

    try {
      onLog({ message: `🎬 開始導出多段編輯影片（共 ${segments.length} 個片段）...` });
      const outputBlob = await processMultiSegments(videoFile, segments, onLog, onProgress);
      const outUrl = URL.createObjectURL(outputBlob);
      setOutputUrl(outUrl);
      setProgress(100);
      onLog({ message: '🎉 處理完成！已生成輸出影片。' });
    } catch (err) {
      console.error(err);
      onLog({ message: `❌ 處理出錯: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  // 尋找當前選取的段落物件與索引
  const activeSegIndex = segments.findIndex(seg => seg.id === selectedSegId);
  const activeSegment = segments[activeSegIndex];

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
      <header>
        <h1>🎬 Film2X 影片分割變速室</h1>
        <p>滑動時間軸，隨時按分割，自訂每一段的速度</p>
      </header>

      {!videoUrl ? (
        <div className="glass-panel">
          <div className="upload-container" onClick={() => fileInputRef.current.click()}>
            <div className="upload-icon">📤</div>
            <h3>點擊或拖曳影片至此處開始</h3>
            <p className="mode-desc">支援 MP4, WebM, MOV 等影音格式</p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/*"
            />
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* 大尺寸預覽播放器 */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <video
              ref={videoRef}
              src={videoUrl}
              className="video-element"
              style={{ maxWidth: '100%', maxHeight: '480px', borderRadius: '12px', width: 'auto' }}
              controls
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
            />
            
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '12px', color: 'var(--text-muted)' }}>
              <span>播放進度: {formatTime(currentTime)}</span>
              <span>影片總長: {formatTime(duration)}</span>
            </div>

            {/* 新版分段時間軸 */}
            <div 
              style={{
                width: '100%',
                position: 'relative',
                height: '60px',
                background: '#090d16',
                borderRadius: '8px',
                margin: '12px 0 20px',
                border: '1px solid rgba(255,255,255,0.1)',
                overflow: 'hidden'
              }}
            >
              {/* 時間軸背景刻度點擊 */}
              <div 
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }}
                onClick={handleTimelineClick}
              />

              {/* 渲染片段區域 */}
              {duration > 0 && segments.map((seg, idx) => {
                const left = (seg.start / duration) * 100;
                const width = ((seg.end - seg.start) / duration) * 100;
                const isSelected = seg.id === selectedSegId;
                
                return (
                  <div
                    key={seg.id}
                    onClick={(e) => {
                      e.stopPropagation(); // 防止觸發時間軸跳轉
                      setSelectedSegId(seg.id);
                      seekTo(seg.start);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${left}%`,
                      width: `${width}%`,
                      height: '100%',
                      boxSizing: 'border-box',
                      borderRight: '2px solid rgba(255,255,255,0.2)',
                      background: isSelected 
                        ? 'rgba(99, 102, 241, 0.35)' 
                        : 'rgba(255, 255, 255, 0.05)',
                      boxShadow: isSelected ? 'inset 0 0 12px rgba(99,102,241,0.5)' : 'none',
                      border: isSelected ? '2px solid #6366f1' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      zIndex: 2,
                      userSelect: 'none',
                      transition: 'background 0.2s'
                    }}
                    title={`片段 ${idx + 1}: ${formatTime(seg.start)} ~ ${formatTime(seg.end)}`}
                  >
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#fff' }}>
                      #{idx + 1}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: isSelected ? '#a5b4fc' : 'var(--text-muted)' }}>
                      {seg.speed}x ({((seg.end - seg.start)).toFixed(1)}s)
                    </span>
                  </div>
                );
              })}

              {/* 播放頭指針 */}
              {duration > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${(currentTime / duration) * 100}%`,
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    background: '#f43f5e',
                    boxShadow: '0 0 8px #f43f5e',
                    zIndex: 3,
                    pointerEvents: 'none'
                  }}
                />
              )}
            </div>

            {/* 這裡新增：選定段落的變速控制與合併按鈕 */}
            {activeSegment && (
              <div 
                style={{ 
                  width: '100%', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  background: 'rgba(255, 255, 255, 0.03)', 
                  padding: '12px 16px', 
                  borderRadius: '8px', 
                  marginBottom: '16px', 
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}
              >
                <div>
                  <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.95rem' }}>
                    ⚡ 片段 #{activeSegIndex + 1}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                    ({formatTime(activeSegment.start)} ~ {formatTime(activeSegment.end)})
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>變速:</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[0.5, 1.0, 1.5, 2.0, 3.0, 4.0].map((s) => (
                      <button
                        key={s}
                        className={`speed-btn ${activeSegment.speed === s ? 'active' : ''}`}
                        onClick={() => handleSetSpeed(activeSegment.id, s)}
                        style={{ padding: '5px 10px', fontSize: '0.85rem', minWidth: '42px' }}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                {activeSegIndex < segments.length - 1 && (
                  <button 
                    className="speed-btn"
                    onClick={() => handleMergeWithNext(activeSegIndex)}
                    style={{ borderColor: 'rgba(239, 68, 68, 0.4)', padding: '5px 12px', fontSize: '0.85rem' }}
                  >
                    🔗 與下一段合併
                  </button>
                )}
              </div>
            )}

            {/* 精簡化控制列 */}
            <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button 
                className="btn-primary" 
                onClick={handleSplit}
                style={{ minWidth: '180px' }}
              >
                ✂️ 在此分割影片
              </button>

              <button 
                className="btn-danger" 
                onClick={() => {
                  setVideoFile(null);
                  setVideoUrl('');
                  setOutputUrl('');
                  setSegments([]);
                }}
              >
                ❌ 關閉影片
              </button>
            </div>
          </div>


          {/* 底部匯出與進度區 */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>📦 輸出設定</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  將拼接所有片段並套用變速設定輸出成單一 MP4 影片。
                </p>
              </div>
              <button
                className="btn-primary"
                onClick={handleProcessVideo}
                disabled={isProcessing}
                style={{ padding: '12px 32px' }}
              >
                {isProcessing ? '⚙️ 處理中...' : '🚀 開始匯出影片'}
              </button>
            </div>

            {/* 進度顯示 */}
            {(isProcessing || progress > 0) && (
              <div className="progress-panel" style={{ marginTop: '0' }}>
                <div className="progress-header">
                  <span>處理進度</span>
                  <span>{progress}%</span>
                </div>
                <div className="progress-bar-container">
                  <div className="progress-bar" style={{ width: `${progress}%` }} />
                </div>
                <div className="terminal-logs" ref={logTerminalRef}>
                  {logs.map((log, idx) => (
                    <div key={idx}>{log}</div>
                  ))}
                  {logs.length === 0 && <div>正在初始化處理器...</div>}
                </div>
              </div>
            )}

            {/* 導出結果下載 */}
            {outputUrl && (
              <div className="result-panel">
                <div className="result-title">🎉 處理完成！</div>
                <video src={outputUrl} className="video-element" style={{ marginBottom: '16px', maxWidth: '640px' }} controls />
                <br />
                <a href={outputUrl} download={`film2x_edited_${Date.now()}.mp4`} className="btn-success">
                  📥 下載已導出影片
                </a>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

export default App;
