import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpeg = null;

export async function getFFmpeg(onLog, onProgress) {
  if (ffmpeg) {
    if (onLog) ffmpeg.on('log', onLog);
    if (onProgress) ffmpeg.on('progress', onProgress);
    return ffmpeg;
  }

  ffmpeg = new FFmpeg();
  
  if (onLog) ffmpeg.on('log', onLog);
  if (onProgress) ffmpeg.on('progress', onProgress);

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
}

/**
 * 建立音訊變速的 atempo 濾鏡鏈
 */
function getAtempoFilter(speed) {
  if (speed === 1.0) return '';
  if (speed >= 0.5 && speed <= 2.0) {
    return `atempo=${speed}`;
  }
  
  let rem = speed;
  const filters = [];
  while (rem > 2.0) {
    filters.push('atempo=2.0');
    rem /= 2.0;
  }
  while (rem < 0.5) {
    filters.push('atempo=0.5');
    rem /= 0.5;
  }
  if (rem !== 1.0) {
    filters.push(`atempo=${rem.toFixed(2)}`);
  }
  return filters.join(',');
}

/**
 * 處理多個分割片段並進行速度調整與拼接
 * @param {File} file - 原始影片
 * @param {Array} segments - 片段陣列 [{ start, end, speed }]
 */
export async function processMultiSegments(file, segments, onLog, onProgress) {
  const ff = await getFFmpeg(onLog, onProgress);
  const inputName = 'input.mp4';
  const outputName = 'output_segments.mp4';

  const fileData = new Uint8Array(await file.arrayBuffer());
  await ff.writeFile(inputName, fileData);

  // 過濾無效片段 (長度太短)
  const validSegments = segments.filter(seg => (seg.end - seg.start) > 0.05);

  if (validSegments.length === 0) {
    throw new Error('無效的裁剪區段');
  }

  let filterComplex = '';
  let concatInputs = '';

  validSegments.forEach((seg, index) => {
    const vLabel = `v${index}`;
    const aLabel = `a${index}`;
    
    // 影片濾鏡：裁剪 + 變速
    const vSpeedFilter = `setpts=${(1 / seg.speed).toFixed(4)}*PTS`;
    filterComplex += `[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS,${vSpeedFilter}[${vLabel}]; `;

    // 音訊濾鏡：裁剪 + 變速
    const atempoStr = getAtempoFilter(seg.speed);
    const aSpeedFilter = atempoStr ? `,${atempoStr}` : '';
    filterComplex += `[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS${aSpeedFilter}[${aLabel}]; `;

    concatInputs += `[${vLabel}][${aLabel}]`;
  });

  // 拼接所有的影片與音訊軌
  filterComplex += `${concatInputs}concat=n=${validSegments.length}:v=1:a=1[outv][outa]`;

  const args = [
    '-i', inputName,
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-map', '[outa]',
    '-preset', 'ultrafast',
    outputName
  ];

  await ff.exec(args);

  const data = await ff.readFile(outputName);
  
  await ff.deleteFile(inputName);
  await ff.deleteFile(outputName);

  return new Blob([data.buffer], { type: 'video/mp4' });
}
