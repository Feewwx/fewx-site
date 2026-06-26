document.addEventListener("DOMContentLoaded", () => {
  // 📢 验证标记：如果控制台没打印这行，说明浏览器还在读你的旧缓存！
  console.log("🚀 真正的新路由已全盘接管，缓存已清除！");

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

  const initPage = () => {
    checkReturnZone();
    const wrapper = document.querySelector(".content-wrapper");
    if (wrapper) wrapper.classList.add("animate-in");
    runRenders();
  };

  // 首次进入页面初始化
  initPage();

  // 3. 核心路由驱动引擎（统一处理点击、返回、前进）
  const navigate = async (url, isPushState = true) => {
    const currentWrapper = document.querySelector(".content-wrapper");
    if (currentWrapper) {
      currentWrapper.classList.remove("animate-in");
      currentWrapper.classList.add("animate-out");
      await new Promise(r => setTimeout(r, 400)); // 等待淡出动画
    }

    try {
      const response = await fetch(url);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const newWrapper = doc.querySelector(".content-wrapper");

      // DOM 替换流
      if (currentWrapper && newWrapper) {
        currentWrapper.replaceWith(newWrapper);
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

      // 🔥 核心修复：强行激活新页面中被 DOMParser 搞死的 Script 脚本
      if (newWrapper) {
        const scripts = newWrapper.querySelectorAll("script");
        scripts.forEach(oldScript => {
          const newScript = document.createElement("script");
          Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
          newScript.textContent = oldScript.textContent;
          oldScript.parentNode.replaceChild(newScript, oldScript);
        });
      }

      // 重新初始化新页面逻辑
      initPage();
    } catch (err) {
      console.error("无缝路由降级:", err);
      window.location.href = url;
    }
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

  // 🔥 核心修复：彻底删掉 window.location.reload()！用单页动画过渡接管浏览器 Back 键
  window.addEventListener("popstate", () => {
    const targetUrl = window.location.pathname.split("/").pop() || "index.html";
    navigate(targetUrl, false); // false 代表不再重复推入历史记录
  });
});
