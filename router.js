document.addEventListener("DOMContentLoaded", () => {
  // 📢 验证标记：如果控制台没打印这行，说明浏览器还在读你的旧缓存！
  console.log("🚀 路由已接管（并行预取 + 插入后移除 + 双 rAF 缓冲版）");

  const FADE_OUT_MS = 500; // 必须和 CSS 里 .animate-out / slideDown 的时长保持一致

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

  // 1. 隐藏/显示主页返回按钮
  const checkReturnZone = () => {
    const returnZone = document.getElementById("top-return-zone");
    if (returnZone) {
      const path = window.location.pathname.split("/").pop();
      // 主页隐藏，子页显示
      returnZone.style.display = (!path || path === "index.html") ? "none" : "flex";
    }
  };

  // 2. 触发数据渲染
  const runRenders = () => {
    if (document.getElementById("home-stream-container") && typeof renderList === "function") renderList("HOME", "home-stream-container");
    if (document.getElementById("log-stream-container") && typeof renderList === "function") renderList("LOG", "log-stream-container");
    if (document.getElementById("products-stream-container") && typeof renderList === "function") renderList("PRODUCTS", "products-stream-container");
    if (document.getElementById("article-content") && typeof renderSinglePost === "function") renderSinglePost();
  };

  // 3. 双 rAF 缓冲：新节点插入时是 opacity:0 的初始态，必须等浏览器真正
  //    "画出"这一帧之后才挂 animate-in，否则有概率被合并进同一次样式计算，
  //    动画直接从结束态起步，肉眼看到的就是"瞬间出现/卡一下"而不是渐入
  const playEnter = async (el) => {
    if (!el) return;
    await nextFrame();
    await nextFrame();
    el.classList.add("animate-in");
  };

  const initPage = (newWrapper) => {
    checkReturnZone();
    playEnter(newWrapper || document.querySelector(".content-wrapper"));
    runRenders();
  };

  // 首次进入页面初始化（首次硬加载，content-wrapper 已经在原始 HTML 里）
  initPage(document.querySelector(".content-wrapper"));

  // 4. 核心路由驱动引擎（统一处理点击、返回、前进）
  const navigate = async (url, isPushState = true) => {
    const currentWrapper = document.querySelector(".content-wrapper");

    // 🔥 关键修复 1：fetch 和淡出动画并行触发，不再"淡出完了才开始发请求"。
    //    旧版本是串行的：等 400ms 淡出动画走完 → 才 fetch → 才解析 → 才换内容，
    //    这段网络等待期间页面上什么都没有，只剩 Three.js 画布的纯黑背景，
    //    这就是"黑一下卡一下"的真正来源。改成并行后，淡出动画播的同时网络
    //    请求已经在路上，500ms 淡出完成时数据基本也到了，几乎没有空窗期。
    const fetchPromise = fetch(url).then((res) => res.text());

    if (currentWrapper) {
      currentWrapper.classList.remove("animate-in");
      currentWrapper.classList.add("animate-out");
    }

    let html;
    try {
      [html] = await Promise.all([
        fetchPromise,
        currentWrapper ? sleep(FADE_OUT_MS) : Promise.resolve(),
      ]);
    } catch (err) {
      console.error("无缝路由降级:", err);
      window.location.href = url;
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const newWrapper = doc.querySelector(".content-wrapper");

    // 🔥 关键修复 2：插入新节点在前，移除旧节点在后（insert-before-remove）。
    //    旧版本用 replaceWith()，理论上是原子操作，但配合上面的串行等待，
    //    实际感知到的"空白期"其实发生在网络请求阶段，不是这一步。这里仍然
    //    保留插入再移除的顺序，避免任何一帧里两个节点都不在树上。
    if (currentWrapper && newWrapper) {
      currentWrapper.insertAdjacentElement("afterend", newWrapper);
      currentWrapper.remove();
    } else if (currentWrapper && !newWrapper) {
      currentWrapper.remove();
    } else if (!currentWrapper && newWrapper) {
      document.body.appendChild(newWrapper);
    }

    const newNav = doc.querySelector("nav");
    const currentNav = document.querySelector("nav");
    if (newNav && currentNav) currentNav.innerHTML = newNav.innerHTML;

    document.title = doc.title;
    if (isPushState) history.pushState({}, "", url);

    // 强行激活新页面中被 DOMParser 搞死的 Script 脚本
    if (newWrapper) {
      const scripts = newWrapper.querySelectorAll("script");
      scripts.forEach((oldScript) => {
        const newScript = document.createElement("script");
        Array.from(oldScript.attributes).forEach((attr) => newScript.setAttribute(attr.name, attr.value));
        newScript.textContent = oldScript.textContent;
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });
    }

    // 重新初始化新页面逻辑
    initPage(newWrapper);
  };

  // 全局劫持点击事件
  document.addEventListener("click", (e) => {
    const returnZone = e.target.closest("#top-return-zone");
    const link = e.target.closest("a");
    let url = null;

    if (returnZone) {
      url = "index.html";
    } else if (link) {
      url = link.getAttribute("href");
      if (!url || url.startsWith("http") || url.startsWith("javascript") || link.target === "_blank") return;
    } else {
      return;
    }

    e.preventDefault();
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    if (url === currentPath) return;

    navigate(url, true);
  });

  // 用单页动画过渡接管浏览器 Back/Forward 键，不再 reload()
  window.addEventListener("popstate", () => {
    const targetUrl = window.location.pathname.split("/").pop() || "index.html";
    navigate(targetUrl, false); // false 代表不再重复推入历史记录
  });
});
