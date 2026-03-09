const els = {
  video: document.getElementById('video'),
  canvas: document.getElementById('canvas'),
  cameraSelect: document.getElementById('cameraSelect'),
  formatSelect: document.getElementById('formatSelect'),
  qualityRange: document.getElementById('qualityRange'),
  qualityValue: document.getElementById('qualityValue'),
  mirrorPreview: document.getElementById('mirrorPreview'),
  fillFrame: document.getElementById('fillFrame'),
  startBtn: document.getElementById('startBtn'),
  switchBtn: document.getElementById('switchBtn'),
  captureBtn: document.getElementById('captureBtn'),
  stopBtn: document.getElementById('stopBtn'),
  clearBtn: document.getElementById('clearBtn'),
  statusBadge: document.getElementById('statusBadge'),
  photoPreview: document.getElementById('photoPreview'),
  emptyState: document.getElementById('emptyState'),
  fileInfo: document.getElementById('fileInfo'),
  metaState: document.getElementById('metaState'),
  downloadBtn: document.getElementById('downloadBtn'),
  installBtn: document.getElementById('installBtn'),
};

let stream = null;
let currentDeviceId = null;
let availableCameras = [];
let currentObjectUrl = null;
let deferredInstallPrompt = null;

const state = {
  useEnvironment: true,
};

function setStatus(text) {
  els.statusBadge.textContent = text;
}

function hasMediaDevicesApi() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices;
}

function canUseCameraApi() {
  return hasMediaDevicesApi() && typeof navigator.mediaDevices.getUserMedia === 'function';
}

function canEnumerateDevices() {
  return hasMediaDevicesApi() && typeof navigator.mediaDevices.enumerateDevices === 'function';
}

function isSecureEnoughForCamera() {
  return window.isSecureContext || ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function getEnvironmentHint() {
  if (!isSecureEnoughForCamera()) {
    return 'Открой приложение по HTTPS или через localhost';
  }

  if (!hasMediaDevicesApi()) {
    return 'navigator.mediaDevices недоступен в этом окружении';
  }

  if (!canUseCameraApi()) {
    return 'Браузер не поддерживает getUserMedia';
  }

  return 'Камера должна работать';
}

function updateCameraButtons() {
  const hasApi = canUseCameraApi();
  els.startBtn.disabled = !hasApi;
  els.switchBtn.disabled = !hasApi;

  if (!hasApi) {
    els.captureBtn.disabled = true;
    els.stopBtn.disabled = true;
  }
}

function setPreviewMirror() {
  els.video.style.transform = els.mirrorPreview.checked ? 'scaleX(-1)' : 'scaleX(1)';
}

function setPreviewFill() {
  els.video.style.objectFit = els.fillFrame.checked ? 'cover' : 'contain';
}

function stopCurrentStream() {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
}

async function listCameras() {
  if (!canEnumerateDevices()) {
    availableCameras = [];
    els.cameraSelect.innerHTML = '';

    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Список камер недоступен';
    els.cameraSelect.appendChild(option);
    els.cameraSelect.disabled = true;
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableCameras = devices.filter((device) => device.kind === 'videoinput');

    els.cameraSelect.innerHTML = '';

    if (!availableCameras.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Камеры не найдены';
      els.cameraSelect.appendChild(option);
      els.cameraSelect.disabled = true;
      return;
    }

    availableCameras.forEach((camera, index) => {
      const option = document.createElement('option');
      option.value = camera.deviceId;
      option.textContent = camera.label || `Камера ${index + 1}`;
      els.cameraSelect.appendChild(option);
    });

    els.cameraSelect.disabled = false;

    if (currentDeviceId) {
      els.cameraSelect.value = currentDeviceId;
    }
  } catch (error) {
    console.error('enumerateDevices failed', error);
    availableCameras = [];
    els.cameraSelect.innerHTML = '';

    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Не удалось получить список камер';
    els.cameraSelect.appendChild(option);
    els.cameraSelect.disabled = true;
  }
}

async function startCamera(preferredDeviceId = null) {
  if (!isSecureEnoughForCamera()) {
    setStatus('Нужен HTTPS или localhost');
    throw new Error('Камера доступна только в secure context');
  }

  if (!canUseCameraApi()) {
    setStatus('Камера не поддерживается');
    throw new Error('getUserMedia недоступен');
  }

  stopCurrentStream();

  const videoConstraints = preferredDeviceId
    ? {
        deviceId: { exact: preferredDeviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      }
    : {
        facingMode: state.useEnvironment ? { ideal: 'environment' } : { ideal: 'user' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      };

  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: videoConstraints,
  });

  const [videoTrack] = stream.getVideoTracks();
  const settings = typeof videoTrack?.getSettings === 'function' ? videoTrack.getSettings() : {};
  currentDeviceId = settings.deviceId || preferredDeviceId || null;

  els.video.srcObject = stream;
  await els.video.play();
  await listCameras();

  els.captureBtn.disabled = false;
  els.stopBtn.disabled = false;
  setStatus(`Камера активна${settings.facingMode ? ` · ${settings.facingMode}` : ''}`);
}

function switchCamera() {
  if (!canUseCameraApi()) {
    setStatus(getEnvironmentHint());
    return;
  }

  if (availableCameras.length < 2) {
    state.useEnvironment = !state.useEnvironment;
    startCamera().catch(handleError);
    return;
  }

  const currentIndex = availableCameras.findIndex((camera) => camera.deviceId === currentDeviceId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % availableCameras.length : 0;
  const nextCamera = availableCameras[nextIndex];

  startCamera(nextCamera.deviceId).catch(handleError);
}

function bytesToReadable(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function readBlobAsArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

function hasExifSegment(buffer) {
  const bytes = new Uint8Array(buffer);

  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return false;
  }

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;

    const segmentLength = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (segmentLength < 2) break;

    if (marker === 0xe1) {
      const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
      const headerStart = offset + 4;
      const header = bytes.slice(headerStart, headerStart + 6);
      if (exifHeader.every((v, i) => header[i] === v)) {
        return true;
      }
    }

    offset += 2 + segmentLength;
  }

  return false;
}

async function capturePhoto() {
  if (!stream) return;

  const videoWidth = els.video.videoWidth;
  const videoHeight = els.video.videoHeight;
  if (!videoWidth || !videoHeight) {
    setStatus('Видео ещё не готово');
    return;
  }

  const canvas = els.canvas;
  const ctx = canvas.getContext('2d', { alpha: false });

  canvas.width = videoWidth;
  canvas.height = videoHeight;

  if (els.mirrorPreview.checked) {
    ctx.save();
    ctx.translate(videoWidth, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(els.video, 0, 0, videoWidth, videoHeight);
    ctx.restore();
  } else {
    ctx.drawImage(els.video, 0, 0, videoWidth, videoHeight);
  }

  const type = els.formatSelect.value;
  const quality = Number(els.qualityRange.value);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error('Не удалось экспортировать изображение'));
        return;
      }
      resolve(result);
    }, type, quality);
  });

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
  }

  currentObjectUrl = URL.createObjectURL(blob);
  els.photoPreview.src = currentObjectUrl;
  els.photoPreview.classList.remove('hidden');
  els.emptyState.classList.add('hidden');
  els.downloadBtn.classList.remove('hidden');
  els.downloadBtn.href = currentObjectUrl;
  els.downloadBtn.download = createFileName(type);
  els.clearBtn.disabled = false;
  els.fileInfo.classList.remove('hidden');

  const buffer = await readBlobAsArrayBuffer(blob);
  const exifDetected = type === 'image/jpeg' ? hasExifSegment(buffer) : false;

  els.fileInfo.textContent = [
    `Формат: ${type}`,
    `Размер файла: ${bytesToReadable(blob.size)}`,
    `Разрешение: ${videoWidth}×${videoHeight}`,
  ].join(' · ');

  els.metaState.textContent = exifDetected
    ? 'Внимание: EXIF-маркер найден'
    : 'OK: EXIF не найден';

  setStatus('Снимок сделан');
}

function createFileName(type) {
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `safe-camera-${stamp}.${ext}`;
}

function clearPhoto() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }

  els.photoPreview.removeAttribute('src');
  els.photoPreview.classList.add('hidden');
  els.emptyState.classList.remove('hidden');
  els.downloadBtn.classList.add('hidden');
  els.fileInfo.classList.add('hidden');
  els.clearBtn.disabled = true;
  els.metaState.textContent = 'Нет снимка';
  els.fileInfo.textContent = '';
}

function handleError(error) {
  console.error(error);

  const message = error?.name === 'NotAllowedError'
    ? 'Доступ к камере запрещён'
    : error?.name === 'NotFoundError'
      ? 'Камера не найдена'
      : error?.name === 'NotReadableError'
        ? 'Камера занята другим приложением'
        : error?.name === 'OverconstrainedError'
          ? 'Выбранная камера или параметры недоступны'
          : !isSecureEnoughForCamera()
            ? 'Нужен HTTPS или localhost'
            : !hasMediaDevicesApi()
              ? 'navigator.mediaDevices недоступен'
              : 'Ошибка запуска камеры';

  setStatus(message);
}

function registerInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    els.installBtn.classList.remove('hidden');
  });

  els.installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installBtn.classList.add('hidden');
  });
}

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
      console.warn('Service worker registration failed', error);
    }
  }
}

function bindEvents() {
  els.startBtn.addEventListener('click', () => startCamera(els.cameraSelect.value || null).catch(handleError));
  els.switchBtn.addEventListener('click', switchCamera);
  els.captureBtn.addEventListener('click', () => capturePhoto().catch(handleError));
  els.stopBtn.addEventListener('click', () => {
    stopCurrentStream();
    els.captureBtn.disabled = true;
    els.stopBtn.disabled = true;
    setStatus('Камера остановлена');
  });
  els.clearBtn.addEventListener('click', clearPhoto);
  els.cameraSelect.addEventListener('change', () => startCamera(els.cameraSelect.value).catch(handleError));
  els.qualityRange.addEventListener('input', () => {
    els.qualityValue.textContent = Number(els.qualityRange.value).toFixed(2);
  });
  els.mirrorPreview.addEventListener('change', setPreviewMirror);
  els.fillFrame.addEventListener('change', setPreviewFill);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopCurrentStream();
      els.captureBtn.disabled = true;
      els.stopBtn.disabled = true;
      setStatus('Камера остановлена в фоне');
    }
  });

  window.addEventListener('beforeunload', stopCurrentStream);
}

async function init() {
  setPreviewMirror();
  setPreviewFill();
  bindEvents();
  registerInstallPrompt();
  await registerServiceWorker();
  updateCameraButtons();
  setStatus(getEnvironmentHint());
  await listCameras();

  if (canEnumerateDevices()) {
    navigator.mediaDevices.addEventListener?.('devicechange', () => {
      listCameras().catch(console.error);
    });
  }
}

init().catch(handleError);
