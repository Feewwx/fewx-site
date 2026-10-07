import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { attachCubeInteraction } from './cube-interaction.js';

// 初始化面光
RectAreaLightUniformsLib.init();

const canvas = document.querySelector('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0); 
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.1; // 【调整】删除了虚拟房间的干扰后，将曝光恢复到标准 1.0，释放纯净灯光的威力

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000); // 绝对纯黑背景

// 💡 彻底删除了之前的 RoomEnvironment 和 PMREMGenerator 行！幽灵小房间彻底蒸发。

let camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, -6);

let cubeMesh = null;
let cubeFX = null;
const cubeBasePos = new THREE.Vector3();

// 需要按视口铺满的背景板（底 + 图），加载完统一算尺寸，之后每次 resize 重算
const bgPlanes = [];

// ---- 字母环：贴在涂鸦板上，跟板子同尺寸同朝向，往相机方向抬一点，每帧自转 ----
const ringTexture = new THREE.TextureLoader().load('./assets/ring.png');
ringTexture.colorSpace = THREE.SRGBColorSpace; // 手动加载的贴图要自己标，不然会当线性数据用、颜色会偏
const RING = {
  speed: 0.12,   // 弧度/秒，越大转越快（0.12 ≈ 52 秒一圈）
  opacity: 0.6,  // 不透明度，1 = 完全不透明
  lift:  -0.05,  // 负 = 往相机方向（相机在 -z，所以是减 z）= 在涂鸦前面才看得见
  size:  0.55,   // 桌面：字占板宽约 49%
  sizeMobile: 0.85, // 手机：字占板宽约 72%，环要相应放大（这是估的，手机上用 Alt+[ ] 重新调）
};
let ringMesh = null;
const _camDir = new THREE.Vector3(); // 复用，别每帧 new

// ---- 字层：把涂鸦中间那坨字单独切一层浮在环上面，环才算「在字后面」 ----
const wordTexture = new THREE.TextureLoader().load('./assets/word.png');
wordTexture.colorSpace = THREE.SRGBColorSpace; // 同上
const WORD = {
  w:      0.472,     // 桌面：字宽占涂鸦板宽的比例（2026-10-07 用 Alt+[ ] 调出来的）
  dx:     0.004,     // 桌面：左右错位（板宽的比例）
  dy:    -0.021,     // 桌面：上下错位（板高的比例）
  wMobile:    0.757, // 手机：2026-10-07 在窄窗口下调出来的
  dxMobile:   0.018,
  dyMobile:   0.002,
  bright:     1.0,   // 字层底色系数。字层跟板子一样是受光照的材质，
                     // 理论上 1.0 就该跟板子一致；偏了再用 Alt + , / . 微调

  aspect: 1.992,     // 字图的宽高比（宽/高），跟 assets/word.png 一致
  lift:   -0.10,     // 比环更靠相机（环 -0.05），这样字挡在环前面
  tint:   0xffffff,  // 字图本身是米黄，这里保持白色就是原样
};
let wordMesh = null;
let graffitiBoard = null;

// 背景板怎么贴视口：
//   'contain' 完整显示，图不裁，比例对不上就上下（或左右）留黑 —— 大屏用这个
//   'cover'   铺满裁切，四面不露黑，多出来的出画 —— 手机用这个
// 由 loadScene 按当前是哪套 glb 设置。
let fitMode = 'contain';

// 板子是正对视口的，世界 X 就是屏幕横向、世界 Y 就是屏幕纵向，所以直接按包围盒比。
function fitBackground() {
  if (!bgPlanes.length) return;
  const camPos = camera.getWorldPosition(new THREE.Vector3());
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

  for (const { mesh, base } of bgPlanes) {
    mesh.scale.copy(base); // 先还原，量的才是原始包围盒
    const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(mesh).getSize(size);

    // 距离按相机朝向量，不写死相机位置：两个 glb 的相机一个在 z=-6.77 一个在 z=-5.39
    const dist = mesh.getWorldPosition(new THREE.Vector3()).sub(camPos).dot(forward);
    if (dist <= 0) continue; // 板子在相机后面，不掺和

    const visH = 2 * Math.tan((camera.fov * Math.PI) / 180 / 2) * dist;
    const visW = visH * camera.aspect;

    const k = fitMode === 'cover'
      ? Math.max(visW / size.x, visH / size.y)
      : Math.min(visW / size.x, visH / size.y);
    mesh.scale.copy(base).multiplyScalar(k);
  }

  // 环和字层跟着涂鸦板走：几何都是 1x1，scale 直接给世界尺寸
  // 手机和桌面用的是两张不同的贴图（横图 vs 竖图），字占板子的比例差很多，所以参数分两套
  if (graffitiBoard) {
    const gs = new THREE.Vector3();
    new THREE.Box3().setFromObject(graffitiBoard).getSize(gs);
    const mob = fitMode === 'cover'; // 手机走 cover，桌面走 contain

    if (ringMesh) {
      const d = gs.x * (mob ? RING.sizeMobile : RING.size); // 环是正圆：X 和 Z 给一样的值
      ringMesh.scale.set(d, 1, d);
    }
    if (wordMesh) {
      const w = gs.x * (mob ? WORD.wMobile : WORD.w);
      wordMesh.scale.set(w, 1, w / WORD.aspect);
      wordMesh.position.x = graffitiBoard.position.x + (mob ? WORD.dxMobile : WORD.dx) * gs.x;
      wordMesh.position.y = graffitiBoard.position.y + (mob ? WORD.dyMobile : WORD.dy) * gs.y;
    }
  }
}

// ---- 1. 像素级无损噪点生成器 ----
function generateNoiseTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const grain = Math.floor(Math.random() * 255);
    data[i] = grain;     
    data[i+1] = grain;   
    data[i+2] = grain;   
    data[i+3] = 255;     
  }
  ctx.putImageData(imgData, 0, 0);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  
  // 禁用滤波模糊，强制硬核噪点颗粒
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false; 
  
  texture.repeat.set(6, 6); // 控制噪点细密程度
  return texture;
}
const noiseTexture = generateNoiseTexture();

// ---- 2. 鼠标跟随精准缓动（已修正左右反向） ----
let mouseX = 0;
let mouseY = 0;
const windowHalfX = window.innerWidth / 2;
const windowHalfY = window.innerHeight / 2;

window.addEventListener('mousemove', (event) => {
  mouseX = (event.clientX - windowHalfX) * 0.003;
  mouseY = (event.clientY - windowHalfY) * 0.003;
});

// 桌面 768px 以上用 blog.glb，手机用 phone.glb。原来只在加载时判一次，
// 桌面窗口拉窄到 768 以下不会换，得刷新才生效；现在跨断点自动换。
const mobileQuery = window.matchMedia('(max-width: 768px)');

const loader = new GLTFLoader();
let currentRoot = null;   // 当前这套 glb 的根，换的时候要拆掉
let currentLight = null;  // 把它一起加进 scene 的面光，也要跟着拆
let loadToken = 0;        // 快速来回跨断点时，作废掉过期的加载结果

function loadScene(isMobile) {
  const token = ++loadToken;
  fitMode = isMobile ? 'cover' : 'contain'; // 大屏完整显示不裁，手机铺满不露黑边
  loader.load(
    isMobile ? './assets/phone.glb' : './assets/blog.glb',
    (gltf) => {
      if (token !== loadToken) return; // 已经切到另一版了，这次结果丢掉

      // 拆掉上一套，否则两套 glb 的相机/灯/背景板会叠一起
      if (currentRoot) scene.remove(currentRoot);
      if (currentLight) scene.remove(currentLight);
      if (cubeFX) cubeFX.dispose();
      bgPlanes.length = 0;
      cubeMesh = null;
      cubeFX = null;
      ringMesh = null;
      wordMesh = null;
      graffitiBoard = null;

      const root = gltf.scene;
      scene.add(root);
      currentRoot = root;

      if (gltf.cameras && gltf.cameras.length > 0) {
        camera = gltf.cameras[0];
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      }

      // 面光：大幅加强强度。没有了假房问的泛光，纯靠它来勾勒高级的磨砂晶体边缘轮廓
      const lightProxy = root.getObjectByName('面光');
      if (lightProxy) {
        const areaLight = new THREE.RectAreaLight(0xffffff, 6.5, lightProxy.scale.x, lightProxy.scale.y);
        areaLight.position.copy(lightProxy.position);
        areaLight.quaternion.copy(lightProxy.quaternion);
        scene.add(areaLight);
        currentLight = areaLight;
      }

      // 点光：大幅加亮，用来从内部激发最核心的色散光谱与表面薄膜镭射
      const pointLight = root.getObjectByName('点光');
      if (pointLight) {
        pointLight.intensity = 350;
      }

      root.traverse((child) => {
        if (child.isMesh) {
          if (child.name === 'Spline_Dispersion_Cube') {
            cubeMesh = child;
            cubeBasePos.copy(cubeMesh.position);

            // ---- 3. 终极材质：无假反光、纯暗黑噪点、极光镭射 ----
            cubeMesh.material = new THREE.MeshPhysicalMaterial({
              color: 0xffffff,
              transmission: 0.8,           // 100% 物理透射
              ior: 1.2,                    // 稍微提一点折射率，让背后文字的扭曲变形更具张力
              thickness: 1.6,

              // 极致色散与流体镭射叠加
              dispersion: 15.0,            // 拉满色散，在无反射的纯黑背景中强行榨出彩虹光谱
              iridescence: 1.0,            // 薄膜虹彩（表面镭射层）
              iridescenceIOR: 1.9,
              iridescenceThicknessRange: [150, 450],

              // 极致哑光微观颗粒
              roughness: 0.5,
              roughnessMap: noiseTexture,
              bumpMap: noiseTexture,       // 用像素噪点做凹凸，把所有直射高光打碎成细腻磨砂
              bumpScale: 0.15,             // 颗粒深度

              clearcoat: 0.0,              // 坚决不要光滑外壳
              side: THREE.FrontSide
            });

            const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            cubeFX = attachCubeInteraction({ mesh: cubeMesh, domElement: renderer.domElement, idleSpin: prefersReducedMotion ? 0 : 0.05 });

          } else if (child.name === 'black') {
            child.material = new THREE.MeshBasicMaterial({ color: 0x000000 });
            bgPlanes.push({ mesh: child, base: child.scale.clone() });
          } else {
            if (child.material) {
              child.material.transparent = false;
              child.material.alphaToCoverage = true;
              child.material.depthWrite = true;
              child.material.needsUpdate = true;
            }
            // 贴 graffiti 的那块图板，桌面端叫 blog1_ll_4000，手机端叫 blog2_web_new
            if (child.name === 'blog1_ll_4000' || child.name === 'blog2_web_new') {
              bgPlanes.push({ mesh: child, base: child.scale.clone() });
            }
          }
        }
      });

      // 字母环挂到涂鸦板上（桌面 blog1_ll_4000 / 手机 blog2_web_new）
      const board = root.getObjectByName('blog1_ll_4000') || root.getObjectByName('blog2_web_new');
      if (board) {
        ringMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
          map: ringTexture,
          transparent: true,
          opacity: RING.opacity,
          depthWrite: false,
          toneMapped: false,
          side: THREE.DoubleSide,
        }));
        ringMesh.position.copy(board.position);
        ringMesh.quaternion.copy(board.quaternion);
        ringMesh.position.z += RING.lift;
        root.add(ringMesh);   // 尺寸在 fitBackground 里按板子算（用 1x1 平面，免得被板子的 5:1 拉扁）

        // 字层：独立一块 1x1 平面，尺寸在 fitBackground 里按板子算
        graffitiBoard = board;
        wordMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
          map: wordTexture,
          color: new THREE.Color().setScalar(WORD.bright),
          metalness: 0,      // 跟 glb 里那块板一样：非金属、哑光
          roughness: 0.5,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }));
        wordMesh.position.copy(board.position);
        wordMesh.quaternion.copy(board.quaternion);
        wordMesh.position.z += WORD.lift;
        root.add(wordMesh);
      }

      fitBackground(); // 背景板按当前视口铺满
    },
    undefined,
    (err) => console.error('GLTF 加载失败：', err)
  );
}

loadScene(mobileQuery.matches);
// 跨断点时换对应的 glb（原来只在加载时判一次，拉窄了不刷新就一直是旧的那套）
mobileQuery.addEventListener('change', (e) => loadScene(e.matches));

const clock = new THREE.Clock();
function animate() {
  const dt = clock.getDelta();

  // 鼠标跟随缓动（帧率无关版本）：原来用固定 0.06 系数每帧硬乘，缓动速度跟帧间隔
  // dt 没关系——帧率稳定的时候看不出问题，但这套材质很重（transmission + dispersion
  // + iridescence + 两张噪点贴图叠加），鼠标划快一点很容易掉帧，dt 一旦变大变小，
  // 固定系数的步长就跟着乱跳，视觉上就是抽搐。换成 1-exp(-rate*dt) 这种指数缓动，
  // 不管这一帧花了多久，缓动比例都按真实时间算，帧率波动时也不会跳
  if (cubeMesh) {
    const targetX = cubeBasePos.x - mouseX * 1.5; 
    const targetY = cubeBasePos.y - mouseY * 1.5; 
    const followRate = 4; // 越大跟手越快，越小越绵软，自己再调
    const t = 1 - Math.exp(-followRate * dt);

    cubeMesh.position.x += (targetX - cubeMesh.position.x) * t;
    cubeMesh.position.y += (targetY - cubeMesh.position.y) * t;
  }

  if (ringMesh) {
    // 绕相机的视线轴转 = 在屏幕平面里转圈。不能用 rotateZ：
    // 板子在 glb 里转过 180°，它的局部 Z 在世界里是竖直的，那样转出来是翻饼
    camera.getWorldDirection(_camDir);
    ringMesh.rotateOnWorldAxis(_camDir, RING.speed * dt);
  }
  if (cubeFX) cubeFX.update(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  fitBackground(); // 必须在上面的 aspect 更新之后
});

// 手机横竖屏切换时 resize 不保证带最终尺寸，补一次
window.addEventListener('orientationchange', () => setTimeout(fitBackground, 200));

// ---- 调试用：Alt + 方向键 / [ ] 微调字层（Shift 一起按步子大 5 倍）----
// 调好之后把控制台打出来的那行抄回上面的 WORD 就行
window.addEventListener('keydown', (e) => {
  if (!e.altKey || !wordMesh) return;
  const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '[', ']', ',', '.'];
  if (!KEYS.includes(e.key)) return;
  const step = e.shiftKey ? 0.005 : 0.001;
  // 窄屏（手机那套）调的是 *Mobile 那几个字段，宽屏调原字段
  const mob = fitMode === 'cover';
  const K = mob ? { w: 'wMobile', dx: 'dxMobile', dy: 'dyMobile' }
                : { w: 'w',       dx: 'dx',       dy: 'dy' };
  if (e.key === 'ArrowUp')    WORD[K.dy] += step;
  if (e.key === 'ArrowDown')  WORD[K.dy] -= step;
  if (e.key === 'ArrowLeft')  WORD[K.dx] -= step;
  if (e.key === 'ArrowRight') WORD[K.dx] += step;
  if (e.key === '[')          WORD[K.w]  -= step;   // 缩小
  if (e.key === ']')          WORD[K.w]  += step;   // 放大
  if (e.key === ',') { WORD.bright = Math.max(0, WORD.bright - 0.05); wordMesh.material.color.setScalar(WORD.bright); }
  if (e.key === '.') { WORD.bright = Math.min(2, WORD.bright + 0.05); wordMesh.material.color.setScalar(WORD.bright); }
  fitBackground();
  console.log(`${mob ? '[手机]' : '[桌面]'} WORD.w = ${WORD[K.w].toFixed(3)}  dx = ${WORD[K.dx].toFixed(3)}  dy = ${WORD[K.dy].toFixed(3)}  bright = ${WORD.bright.toFixed(2)}`);
  e.preventDefault();
});
