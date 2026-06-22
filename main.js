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

const isMobile = window.matchMedia('(max-width: 768px)').matches;
const gltfPath = isMobile ? './assets/phone.glb' : './assets/blog.glb';

const loader = new GLTFLoader();
loader.load(
  gltfPath,
  (gltf) => {
    const root = gltf.scene;
    scene.add(root);

    if (gltf.cameras && gltf.cameras.length > 0) {
      camera = gltf.cameras[0];
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }

    // 面光：大幅加强强度。没有了假房问的泛光，纯靠它来勾勒高级的磨砂晶体边缘轮廓
    const lightProxy = root.getObjectByName('面光');
    if (lightProxy) {
      const areaLight = new THREE.RectAreaLight(0xffffff, 4.5, lightProxy.scale.x, lightProxy.scale.y);
      areaLight.position.copy(lightProxy.position);
      areaLight.quaternion.copy(lightProxy.quaternion);
      scene.add(areaLight);
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
            bumpScale: 0.15,            // 颗粒深度
            
            clearcoat: 0.0,              // 坚决不要光滑外壳
            side: THREE.FrontSide
          });
          
          cubeFX = attachCubeInteraction({ mesh: cubeMesh, domElement: renderer.domElement });
          
        } else if (child.name === 'black') {
          child.material = new THREE.MeshBasicMaterial({ color: 0x000000 });
        } else {
          if (child.material) {
            child.material.transparent = false;      
            child.material.alphaToCoverage = true;   
            child.material.depthWrite = true;        
            child.material.needsUpdate = true;
          }
        }
      }
    });
  },
  undefined,
  (err) => console.error('GLTF 加载失败：', err)
);

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

  if (cubeFX) cubeFX.update(dt);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
