# FEWX 项目：从 Blender 文件到 fewx.dev 上线

现状：有域名（fewx.dev，已在 Cloudflare），有两个 Blender 文件（blog.blend 桌面版/phone.blend 手机版），其余什么都没有。这份文档走完之后网站应该能上线。

---

## Stage 0：Blender 里要先处理的两件事

### 0.1 换掉字标贴图

字标平面用的贴图分辨率离谱地高（blog1.png 9064×4108，blog2.png 2719×6000），这玩意是直接打进 .glb 二进制里的，**不能等导出完再换**，必须先在 Blender 里把 Image Texture 节点指向压缩后的图，再导出。

在你的 Arch 机器上先压缩（没装 imagemagick 就 `sudo pacman -S imagemagick`）：

```bash
cd /home/fewx/Downloads
magick blog1.png -resize 2400x -strip blog1_web.webp
magick blog2.png -resize 1400x -strip blog2_web.webp
```

实测结果：blog1 从 5.7MB 降到 121KB，blog2 从 3.48MB 降到 150KB，肉眼基本看不出差别。

然后在 Blender 里：Shading 工作区 → 选中字标平面 → 找到驱动它颜色的 Image Texture 节点 → 点开图片浏览器换成 `blog1_web.webp`（phone.blend 里换 `blog2_web.webp`）。

### 0.2 cube 的玻璃材质——决定跳过，不在 Blender 里修

之前查过，`Dispersion_Glass_Mat` 导出成 glTF 后整个材质 JSON 是空的（没有一条节点链路接到 Principled BSDF，导出器什么都没认出来）。本来有两条路：在 Blender 重搭节点 / 直接在 Three.js 代码里写参数。已经定下来走**代码里写参数**这条路，原因是两边最终用的都是同一个 WebGL 渲染器，调参时浏览器刷新就能看到效果，不用反复导出。所以 Blender 这边材质不用管，等会代码里已经写好了。

### 0.3 导出检查清单

| 检查项 | 要求 |
|---|---|
| 物体 | cube + 字标平面 + 黑背板，三个一起选中导出 |
| Transform | 是否 Apply 不强制要求，scale 不是 1 也没关系，three.js 会正确读取 |
| 格式 | File → Export → glTF 2.0，选 **glTF Binary (.glb)** |
| Include | Selected Objects |
| 摄像机 | **建议把 Camera 一起勾上**，这样取景角度直接带过去，不用在代码里猜机位（目前两个文件都没带摄像机，代码里是手动摆的位置） |
| Materials | Export |
| Images | Automatic |

导出后文件名固定为 `blog.glb` 和 `phone.glb`。

---

## Stage 1：项目结构

```
fewx-site/
├── index.html              页面骨架 + importmap
├── style.css                黑底全屏样式
├── main.js                  场景/相机/渲染器/材质/渲染循环
├── cube-interaction.js       滚轮驱动的随机轴漂浮转动
└── assets/
    ├── blog.glb              桌面版（替换贴图后重新导出的）
    └── phone.glb             手机版
```

前四个文件已经帮你写好了（看这条消息上面历史里发的那几个文件，已经是最新版）。没用 Vite/webpack，直接用浏览器原生 import map 从 CDN 拉 three.js（锁定版本 0.184.0），跟你"pure HTML/CSS/JS"的路线一致。

`main.js` 现在做的事：

1. 按视口宽度（`matchMedia('(max-width: 768px)')`）自动选加载 `blog.glb` 还是 `phone.glb`
2. 把整个 `gltf.scene` 加进场景——cube、字标平面、黑背板三个物体的深度关系用的是你在 Blender 里摆好的那套
3. 按节点名 `Spline_Dispersion_Cube` 精确取出 cube，材质换成代码定义的 `MeshPhysicalMaterial`（transmission/roughness/ior/dispersion/clearcoat 这几个参数，自己再调）
4. 只有 cube 接了滚轮转动，字标和背板不动

唯一现在做不到的：截图里那种表面磨砂颗粒感，得靠一张噪点贴图（roughness map），现在没有这张图。先跑起来看清玻璃效果，需要再加我再给你补一张程序生成的噪点图。

---

## Stage 2：本地跑起来

ES Module 走 `file://` 直接打开浏览器会因为 CORS 失败，必须起个本地静态服务器：

```bash
cd fewx-site
python3 -m http.server 8000
# 或者：npx serve .
```

浏览器开 `http://localhost:8000`。把 F12 打开看 Console，材质参数不对/贴图加载失败都会在这里报错。

---

## Stage 3：部署到 fewx.dev

```bash
cd fewx-site
git init
git add .
git commit -m "init"
gh repo create fewx-site --public --source=. --push
# 没装 gh cli 就手动在 GitHub 网页建仓库，git remote add origin ... 再 push
```

然后：

1. 仓库 Settings → Pages → Source 选 **Deploy from a branch** → `main` / `(root)`
2. 同一页面 Custom domain 填 `fewx.dev`，保存后仓库根目录会自动生成 `CNAME` 文件
3. Cloudflare DNS 后台：加一条 `CNAME` 记录，Name=`@`，Target=`<你的github用户名>.github.io`，**Proxy status 先关成灰云朵（DNS only）**——橙色云朵会挡住 GitHub 的证书签发
4. 等 DNS 生效，GitHub Pages 设置里勾上 **Enforce HTTPS**
5. HTTPS 跑起来之后，Cloudflare 那条记录可以选择重新打开橙色云朵，不开也完全没问题

到这一步 `fewx.dev` 就能直接打开了。

---

## 卡住了怎么办

哪一步报错就把具体错误信息或截图发过来，不用自己先排查半天——尤其 Stage 0 换贴图和重新导出这步，容易因为节点连错或者图片路径找不到出问题。
